import {
  BadGatewayException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Logger } from 'nestjs-pino';

import { AGENT_ERROR_CODES } from '@harness/agent-protocol';
import type { ChatMessage } from '@harness/agent-protocol';
import { ModelAdapter } from '../model/model-adapter';
import type { ModelMessage, ModelToolCall } from '../model/model-adapter';
import type { ToolExecutionContext, ToolExecutionResult } from '../tools/agent-tool.types';
import { ToolRegistryService } from '../tools/tool-registry.service';
import { describeLogError, formatLogDuration, shortLogId } from '../shared/logging.utils';
import type { AgentRuntimeEvent, AgentRuntimeInput } from './agent-runtime.types';
import { DEFAULT_RUNTIME_POLICY } from './runtime-policy';

class ToolExecutionTimeoutError extends Error {
  constructor() {
    super('Tool execution timed out');
    this.name = 'ToolExecutionTimeoutError';
  }
}

@Injectable()
export class AgentRuntimeService {
  constructor(
    @Inject(ModelAdapter) private readonly model: ModelAdapter,
    @Inject(ToolRegistryService) private readonly tools: ToolRegistryService,
    @Inject(Logger) private readonly logger: Logger,
  ) {}

  // 执行受通用调用上限约束的模型-工具循环，并输出供应商无关的 Runtime 事件。
  async *run(input: AgentRuntimeInput): AsyncGenerator<AgentRuntimeEvent> {
    const runtimeStartedAt = Date.now();
    // System Prompt 与历史消息共同组成第一轮模型上下文，后续轮次只在该数组末尾追加。
    const messages: ModelMessage[] = [
      { role: 'system', content: input.systemPrompt },
      ...this.toModelMessages(input.messages),
    ];
    // 分别记录工具调用次数、交付模式、最终正文和已向客户端展示的文本。
    let toolCallCount = 0;
    let finalResponseOnly = false;
    let finalInstructionAdded = false;
    let finalContent = '';
    let visibleContent = '';
    let modelRounds = 0;
    // 将运行从可调用工具的调查阶段单向切换到无工具的最终回答阶段。
    const enterFinalAnswer = () => {
      // 同一批 Tool Call 必须先补齐全部 Tool Message，最终回答指令在批次结束后追加。
      if (finalResponseOnly) return;
      finalResponseOnly = true;
    };

    // 每次外层循环对应一次独立模型请求，也就是一个稳定的 Model Round。
    // 每一轮要么得到最终文本，要么执行工具并把结果追加到下一轮上下文。
    while (modelRounds <= DEFAULT_RUNTIME_POLICY.maxToolCalls) {
      modelRounds += 1;
      // 最终回答阶段从请求参数层面移除工具，不能只依赖 Prompt 约束模型。
      const definitions = finalResponseOnly ? undefined : this.tools.definitions();
      // 每次模型尝试都重新收集文本、工具调用和结束原因，污染重试不得混入上一轮内容。
      let textDeltas: string[] = [];
      let calls: ModelToolCall[] = [];
      let finishReason: string | null = null;
      // roundId 是稳定关联标识，roundSequence 才承担跨 Round 的排序职责。
      let roundId = crypto.randomUUID();
      let textBlockSequence = 0;
      // 普通调查轮只调用一次；最终回答遇到协议污染时允许有限重试。
      const maxAttempts = finalResponseOnly
        ? DEFAULT_RUNTIME_POLICY.finalAnswerProtocolRetries + 1
        : 1;
      // 内层循环只负责一次模型轮次及最终回答协议校验，不执行任何工具。
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        roundId = crypto.randomUUID();
        const attemptStartedAt = Date.now();
        // 普通轮和最终回答使用不同超时，但都必须响应用户取消信号。
        const roundSignal = this.roundSignal(
          input.signal,
          finalResponseOnly
            ? DEFAULT_RUNTIME_POLICY.finalAnswerTimeoutMs
            : DEFAULT_RUNTIME_POLICY.modelRoundTimeoutMs,
        );
        textDeltas = [];
        calls = [];
        finishReason = null;
        this.logger.log(
          `模型轮次开始 | 会话=${shortLogId(input.sessionId)} | 轮次=${modelRounds} | 尝试=${attempt}/${maxAttempts} | 可用工具=${definitions?.length ?? 0} 个 | 仅最终回答=${finalResponseOnly ? '是' : '否'}`,
          AgentRuntimeService.name,
        );

        try {
          // Adapter 持续产出文本和聚合后的工具调用，Runtime 不依赖供应商 chunk 结构。
          for await (const event of this.model.streamRound({
            model: input.model,
            messages,
            tools: definitions,
            signal: roundSignal,
          })) {
            // 普通 Tool Round 的 Content 首字立即交付，不为排序牺牲首字速度；
            // Round 完成且存在 Tool Call 时，它自然被解释为工具前言而非最终正文。
            if (event.type === 'text.delta') {
              textDeltas.push(event.delta);
              textBlockSequence = event.blockSequence;
              // 最终回答必须完整通过长度、空响应和协议污染校验后才能交付。
              if (!finalResponseOnly) {
                visibleContent += event.delta;
                yield {
                  type: 'text.delta',
                  delta: event.delta,
                  roundId,
                  roundSequence: modelRounds,
                  blockSequence: event.blockSequence,
                };
              }
            } else if (event.type === 'tool_calls.completed') {
              // Adapter 已聚合供应商的分片参数，Runtime 只消费完整 Tool Call。
              calls = event.calls;
            } else {
              // 结束原因用于区分正常完成、长度截断和其他供应商终态。
              finishReason = event.finishReason;
            }
          }
        } catch (error) {
          // 用户主动取消必须原样向上传播，不能包装成供应商故障。
          if (input.signal?.aborted) {
            this.logger.warn(
              `模型轮次已取消 | 会话=${shortLogId(input.sessionId)} | 轮次=${modelRounds}`,
              AgentRuntimeService.name,
            );
            throw error;
          }
          // 模型超时或上游异常统一映射为稳定 API 错误，详细原因只进入脱敏日志。
          this.logger.warn(
            `模型请求失败 | 会话=${shortLogId(input.sessionId)} | 轮次=${modelRounds} | 原因=${describeLogError(error)} | 耗时=${formatLogDuration(Date.now() - attemptStartedAt)}`,
            AgentRuntimeService.name,
          );
          throw new BadGatewayException({
            code: AGENT_ERROR_CODES.modelRequestFailed,
            detail: '模型服务暂时不可用，请检查供应商配置后重试。',
          });
        }

        const roundContent = textDeltas.join('');
        this.logger.log(
          `模型轮次完成 | 会话=${shortLogId(input.sessionId)} | 轮次=${modelRounds} | 尝试=${attempt}/${maxAttempts} | 原因=${finishReason ?? 'unknown'} | 文本=${roundContent.length} 字 | 工具调用=${calls.length} 个 | 耗时=${formatLogDuration(Date.now() - attemptStartedAt)}`,
          AgentRuntimeService.name,
        );

        // 最终回答被长度截断时不能作为完整消息交付或持久化。
        if (finalResponseOnly && finishReason === 'length') {
          throw new ServiceUnavailableException({
            code: AGENT_ERROR_CODES.modelLengthLimit,
            detail: '模型输出达到长度上限，本次回答未保存。',
          });
        }
        // 无文本且无工具调用表示供应商没有产生任何可消费结果。
        if (finalResponseOnly && !roundContent.trim() && calls.length === 0) {
          throw new ServiceUnavailableException({
            code: AGENT_ERROR_CODES.modelEmptyResponse,
            detail: '模型没有返回可显示的文本，请稍后重试。',
          });
        }
        // 最终回答中再次出现结构化 Tool Call 或 DSML 标记，说明模型泄漏了内部控制协议。
        if (finalResponseOnly && (calls.length > 0 || this.containsDsmlProtocol(roundContent))) {
          this.logger.warn(
            `最终回答协议污染 | 会话=${shortLogId(input.sessionId)} | 轮次=${modelRounds} | 尝试=${attempt}/${maxAttempts} | DSML=${this.containsDsmlProtocol(roundContent) ? '是' : '否'} | 工具调用=${calls.length} 个 | 文本=${roundContent.length} 字`,
            AgentRuntimeService.name,
          );
          // 首次污染时丢弃整轮并追加纠偏指令，绝不把污染文本写入客户端或上下文。
          if (attempt < maxAttempts) {
            messages.push({
              role: 'system',
              content:
                '上一次最终回答包含无效的工具协议，已被丢弃。请只输出面向用户的最终自然语言回答，不得输出 DSML、工具调用或控制标记。',
            });
            continue;
          }
          // 达到重试上限仍被污染时终止交付，避免保存伪工具协议。
          throw new ServiceUnavailableException({
            code: AGENT_ERROR_CODES.modelStreamFailed,
            detail: '模型连续返回了无效的工具协议，本次回答未保存。',
          });
        }

        // 最终回答已通过全部校验，此时才按原 delta 边界向客户端交付。
        if (finalResponseOnly) {
          for (const delta of textDeltas) {
            visibleContent += delta;
            yield {
              type: 'text.delta',
              delta,
              roundId,
              roundSequence: modelRounds,
              blockSequence: textBlockSequence,
            };
          }
        }
        // 当前尝试已经成功完成，退出协议重试循环并进入本轮结果处理。
        break;
      }

      // 长度截断的文本不能作为完整交付持久化。
      if (finishReason === 'length') {
        throw new ServiceUnavailableException({
          code: AGENT_ERROR_CODES.modelLengthLimit,
          detail: '模型输出达到长度上限，本次回答未保存。',
        });
      }
      // Round outcome 只在完整消费供应商流后确认：无 Tool Call 才是最终正文。
      if (!calls.length) {
        const roundContent = textDeltas.join('');
        // 普通调查轮同样不能把纯空白结果当作成功交付。
        if (!roundContent.trim()) {
          throw new ServiceUnavailableException({
            code: AGENT_ERROR_CODES.modelEmptyResponse,
            detail: '模型没有返回可显示的文本，请稍后重试。',
          });
        }
        finalContent = visibleContent;
        break;
      }
      // 正常情况下最终回答阶段不会收到 Tool Call；该分支是最后一道防御性保护。
      if (finalResponseOnly) {
        throw new ServiceUnavailableException({
          code: AGENT_ERROR_CODES.toolCallLimitExceeded,
          detail: '工具调用已达到本轮上限，模型仍未生成最终回答。',
        });
      }

      // 某些兼容供应商可能缺失 Tool Call ID，为每个调用补齐稳定关联标识。
      const normalizedCalls = calls.map((call, callIndex) => ({
        ...call,
        id: call.id || crypto.randomUUID(),
        blockSequence:
          call.blockSequence ?? (textDeltas.length > 0 ? textBlockSequence + callIndex + 1 : callIndex),
        providerIndex: call.providerIndex ?? callIndex,
      }));
      // 先追加包含完整 Tool Calls 的 assistant message，后续必须为每个调用补齐 tool message。
      messages.push({
        role: 'assistant',
        content: textDeltas.join('') || null,
        toolCalls: normalizedCalls,
      });

      // 同一 Round 可能包含多个 Tool Call。当前保持模型声明顺序串行执行，
      // 并为每个调用补齐 Tool Message，避免下一轮模型上下文违反供应商协议。
      for (const call of normalizedCalls) {
        // 调用额度耗尽后的同批调用不再计数或执行，只补齐对应的 tool message。
        if (toolCallCount >= DEFAULT_RUNTIME_POLICY.maxToolCalls) {
          messages.push({
            role: 'tool',
            toolCallId: call.id,
            content: this.serializeToolError({
              code: AGENT_ERROR_CODES.toolCallLimitExceeded,
              detail: '工具调用已达到当前 assistant run 的次数上限。',
              retryable: false,
            }),
          });
          enterFinalAnswer();
          this.logger.warn(
            `工具调用已达到上限 | 会话=${shortLogId(input.sessionId)} | 上限=${DEFAULT_RUNTIME_POLICY.maxToolCalls} 次`,
            AgentRuntimeService.name,
          );
          continue;
        }
        toolCallCount += 1;

        // Registry 统一完成 JSON 解析和工具自身 Zod Schema 校验。
        let toolInput: unknown;
        try {
          toolInput = this.tools.parseInput(call.name, call.arguments);
        } catch (error) {
          const code =
            error instanceof Error ? error.message : AGENT_ERROR_CODES.invalidToolArguments;
          messages.push({
            role: 'tool',
            toolCallId: call.id,
            content: this.serializeToolError({
              code,
              detail: '工具参数无法通过 Schema 校验。',
              retryable: false,
            }),
          });
          this.logger.warn(
            `工具参数无效 | 会话=${shortLogId(input.sessionId)} | 调用=${shortLogId(call.id)} | 工具=${call.name} | 错误码=${code}`,
            AgentRuntimeService.name,
          );
          if (toolCallCount >= DEFAULT_RUNTIME_POLICY.maxToolCalls) enterFinalAnswer();
          continue;
        }

        // 参数校验通过后才发布 started，确保每个 started 都能对应一个明确终态。
        const startedAt = new Date();
        this.logger.log(
          `工具调用开始 | 会话=${shortLogId(input.sessionId)} | 调用=${shortLogId(call.id)} | 工具=${call.name}`,
          AgentRuntimeService.name,
        );
        yield {
          type: 'tool.started',
          toolCallId: call.id,
          toolName: call.name,
          input: toolInput,
          startedAt: startedAt.toISOString(),
          roundId,
          roundSequence: modelRounds,
          blockSequence: call.blockSequence,
        };
        let result: ToolExecutionResult<unknown>;
        try {
          // Runtime 统一组合用户取消和 Tool 声明的外层超时，Tool 只处理本次能力调用。
          result = await this.executeTool(call.name, toolInput, {
            sessionId: input.sessionId,
            messageId: input.messageId,
            toolCallId: call.id,
          }, input.signal);
        } catch (error) {
          if (input.signal?.aborted) {
            const completedAt = new Date();
            const durationMs = completedAt.getTime() - startedAt.getTime();
            yield {
              type: 'tool.cancelled',
              toolCallId: call.id,
              toolName: call.name,
              input: toolInput,
              completedAt: completedAt.toISOString(),
              durationMs,
              code: AGENT_ERROR_CODES.toolCancelled,
              detail: '工具调用已取消。',
              roundId,
              roundSequence: modelRounds,
              blockSequence: call.blockSequence,
            };
            throw error;
          }
          const timedOut = error instanceof ToolExecutionTimeoutError;
          result = {
            status: timedOut ? 'timeout' : 'failed',
            error: {
              code: timedOut ? AGENT_ERROR_CODES.toolTimeout : AGENT_ERROR_CODES.toolUnavailable,
              detail: timedOut ? '工具调用超过允许的执行时间。' : '工具执行异常，本次调用未完成。',
              retryable: true,
              cause: error,
            },
          };
        }
        const completedAt = new Date();
        const durationMs = completedAt.getTime() - startedAt.getTime();
        // 工具成功时向前端投影 canonical output，Runtime 随后统一生成模型 Tool Message。
        if (result.status === 'succeeded') {
          this.logger.log(
            `工具调用完成 | 会话=${shortLogId(input.sessionId)} | 调用=${shortLogId(call.id)} | 工具=${call.name} | 状态=成功${this.formatToolLogFields(result.logFields)} | 耗时=${formatLogDuration(durationMs)}`,
            AgentRuntimeService.name,
          );
          yield {
            type: 'tool.completed',
            toolCallId: call.id,
            toolName: call.name,
            input: toolInput,
            output: result.output,
            completedAt: completedAt.toISOString(),
            durationMs,
            roundId,
            roundSequence: modelRounds,
            blockSequence: call.blockSequence,
          };
        } else if (result.status === 'cancelled') {
          // 工具主动返回 cancelled 时保留稳定业务错误码，上游 cause 只进入服务端日志。
          const upstreamReason =
            result.error.cause === undefined
              ? ''
              : ` | 上游原因=${describeLogError(result.error.cause)}`;
          this.logger.warn(
            `工具调用完成 | 会话=${shortLogId(input.sessionId)} | 调用=${shortLogId(call.id)} | 工具=${call.name} | 状态=已取消 | 错误码=${result.error.code}${this.formatToolLogFields(result.logFields)}${upstreamReason} | 耗时=${formatLogDuration(durationMs)}`,
            AgentRuntimeService.name,
          );
          yield {
            type: 'tool.cancelled',
            toolCallId: call.id,
            toolName: call.name,
            input: toolInput,
            completedAt: completedAt.toISOString(),
            durationMs,
            code: result.error.code,
            detail: result.error.detail,
            roundId,
            roundSequence: modelRounds,
            blockSequence: call.blockSequence,
          };
        } else {
          // 所有结构化失败都投影为 failed，前端不会接触敏感的上游 cause。
          const upstreamReason =
            result.error.cause === undefined
              ? ''
              : ` | 上游原因=${describeLogError(result.error.cause)}`;
          this.logger.warn(
            `工具调用完成 | 会话=${shortLogId(input.sessionId)} | 调用=${shortLogId(call.id)} | 工具=${call.name} | 状态=${result.status} | 错误码=${result.error.code}${this.formatToolLogFields(result.logFields)}${upstreamReason} | 耗时=${formatLogDuration(durationMs)}`,
            AgentRuntimeService.name,
          );
          yield {
            type: 'tool.failed',
            toolCallId: call.id,
            toolName: call.name,
            input: toolInput,
            completedAt: completedAt.toISOString(),
            durationMs,
            code: result.error.code,
            detail: result.error.detail,
            retryable: result.error.retryable,
            roundId,
            roundSequence: modelRounds,
            blockSequence: call.blockSequence,
          };
        }
        if (input.signal?.aborted) throw this.abortError();
        // Runtime 统一序列化公开 Tool Result；诊断 cause 和 logFields 永不进入模型。
        messages.push({
          role: 'tool',
          toolCallId: call.id,
          content:
            result.status === 'succeeded'
              ? this.serializeToolSuccess(result.output)
              : this.serializeToolError(result.error),
        });
        // 全局工具调用上限优先保证循环收敛，不受具体工具类型影响。
        if (toolCallCount >= DEFAULT_RUNTIME_POLICY.maxToolCalls) enterFinalAnswer();
      }
      // 整批 assistant Tool Calls 已逐一配对后，再追加一次无工具最终回答约束。
      if (finalResponseOnly && !finalInstructionAdded) {
        finalInstructionAdded = true;
        messages.push({
          role: 'system',
          content:
            '工具调用阶段已经结束。请仅依据已有材料直接完成回答，必要时说明资料限制；不得继续调用工具，也不得输出任何工具调用协议或控制标记。',
        });
      }
    }

    // 只有外层循环正常得到最终正文后才发出 run.completed，调用方据此执行持久化提交。
    this.logger.log(
      `Agent 运行完成 | 会话=${shortLogId(input.sessionId)} | 轮次=${modelRounds} | 工具=${toolCallCount} 次 | 耗时=${formatLogDuration(Date.now() - runtimeStartedAt)}`,
      AgentRuntimeService.name,
    );
    yield { type: 'run.completed', content: finalContent, toolCallCount };
  }

  // 将客户端取消信号与单次模型请求的超时信号合并。
  private roundSignal(external: AbortSignal | undefined, timeoutMs: number): AbortSignal {
    const timeout = AbortSignal.timeout(timeoutMs);
    return external ? AbortSignal.any([external, timeout]) : timeout;
  }

  // DeepSeek 等兼容供应商偶发把内部 DSML 控制协议作为正文返回。
  private containsDsmlProtocol(content: string): boolean {
    return /<[|｜]DSML[|｜]/iu.test(content);
  }

  // 将工具提供的安全结构化字段格式化为统一日志片段。
  private formatToolLogFields(
    fields: Readonly<Record<string, string | number | boolean>> | undefined,
  ): string {
    if (!fields) return '';
    return Object.entries(fields)
      .map(([key, value]) => ` | ${key}=${String(value)}`)
      .join('');
  }

  // 在 Runtime 层强制 Tool 声明的外层超时，并让不响应 AbortSignal 的实现也能及时返回。
  private async executeTool(
    name: string,
    input: unknown,
    context: Omit<ToolExecutionContext, 'signal'>,
    externalSignal?: AbortSignal,
  ): Promise<ToolExecutionResult<unknown>> {
    const timeoutMs = this.tools.executionPolicy(name).timeoutMs;
    const timeoutController = new AbortController();
    const signal = externalSignal
      ? AbortSignal.any([externalSignal, timeoutController.signal])
      : timeoutController.signal;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let cancelListener: (() => void) | undefined;
    const boundary = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        timeoutController.abort();
        reject(new ToolExecutionTimeoutError());
      }, timeoutMs);
      if (externalSignal) {
        cancelListener = () => reject(this.abortError());
        externalSignal.addEventListener('abort', cancelListener, { once: true });
      }
    });
    try {
      return await Promise.race([
        this.tools.execute(name, input, { ...context, signal }),
        boundary,
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
      if (externalSignal && cancelListener)
        externalSignal.removeEventListener('abort', cancelListener);
    }
  }

  // 将成功结果包装为统一的不可信 Tool Message，避免具体 Tool 维护第二份模型内容。
  private serializeToolSuccess(output: unknown): string {
    return JSON.stringify({ ok: true, untrustedToolData: true, output });
  }

  // 将安全错误字段序列化给模型，排除 cause 和服务端日志字段。
  private serializeToolError(error: {
    code: string;
    detail: string;
    retryable: boolean;
  }): string {
    return JSON.stringify({
      ok: false,
      error: { code: error.code, detail: error.detail, retryable: error.retryable },
    });
  }

  // 创建可被上层识别为用户取消的标准 AbortError。
  private abortError(): Error {
    const error = new Error('Tool execution cancelled');
    error.name = 'AbortError';
    return error;
  }

  // 将共享聊天消息转换为 Runtime 使用的 canonical model message。
  private toModelMessages(messages: ChatMessage[]): ModelMessage[] {
    return messages.map((message): ModelMessage => {
      // Tool Message 必须保留 toolCallId，供模型关联上一条 assistant Tool Call。
      if (message.role === 'tool') {
        return { role: 'tool', content: message.content, toolCallId: message.toolCallId };
      }
      // Assistant 历史可能包含工具调用，需要恢复为 Adapter 使用的 canonical 结构。
      if (message.role === 'assistant') {
        return {
          role: 'assistant',
          content: message.content ?? null,
          toolCalls: message.toolCalls?.map((call) => ({
            id: call.id,
            name: call.name,
            arguments: JSON.stringify(call.arguments),
            blockSequence: 0,
            providerIndex: 0,
          })),
        };
      }
      // System 与 User Message 无需额外转换，直接保留角色和正文。
      return { role: message.role, content: message.content };
    });
  }
}

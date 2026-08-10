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
import type { ModelMessage } from '../model/model-adapter';
import type { ToolExecutionResult } from '../tools/agent-tool.types';
import { ToolRegistryService } from '../tools/tool-registry.service';
import { ToolRunState } from '../tools/tool-run-state';
import { describeLogError, formatLogDuration, shortLogId } from '../shared/logging.utils';
import type { AgentRuntimeEvent, AgentRuntimeInput } from './agent-runtime.types';
import { DEFAULT_RUNTIME_POLICY } from './runtime-policy';

@Injectable()
export class AgentRuntimeService {
  constructor(
    @Inject(ModelAdapter) private readonly model: ModelAdapter,
    @Inject(ToolRegistryService) private readonly tools: ToolRegistryService,
    @Inject(Logger) private readonly logger: Logger,
  ) {}

  // 执行有硬预算的模型-工具循环，并输出供应商无关的 Runtime 事件。
  async *run(input: AgentRuntimeInput): AsyncGenerator<AgentRuntimeEvent> {
    const runtimeStartedAt = Date.now();
    const disabledTools = new Set<string>();
    const runState = new ToolRunState();
    const latestUserContent = this.latestUserContent(input.messages);
    const messages: ModelMessage[] = [
      { role: 'system', content: input.systemPrompt },
      ...this.toModelMessages(input.messages),
    ];
    let toolCallCount = 0;
    let forceFinalAnswer = false;
    let finalContent = '';
    let visibleContent = '';
    let modelRounds = 0;
    const enterFinalAnswer = () => {
      if (forceFinalAnswer) return;
      forceFinalAnswer = true;
      messages.push({
        role: 'system',
        content:
          '工具调用阶段已经结束。请仅依据已有材料直接完成回答，必要时说明资料限制；不得继续调用工具，也不得输出任何工具调用协议或控制标记。',
      });
    };

    // 每一轮要么直接得到最终文本，要么执行工具并把结果追加到下一轮上下文。
    while (modelRounds <= DEFAULT_RUNTIME_POLICY.maxToolCalls) {
      modelRounds += 1;
      const definitions = forceFinalAnswer ? undefined : this.tools.definitions(disabledTools);
      let textDeltas: string[] = [];
      let calls: Array<{ id: string; name: string; arguments: string }> = [];
      let finishReason: string | null = null;
      const maxAttempts = forceFinalAnswer
        ? DEFAULT_RUNTIME_POLICY.finalAnswerProtocolRetries + 1
        : 1;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const attemptStartedAt = Date.now();
        const roundSignal = this.roundSignal(
          input.signal,
          forceFinalAnswer
            ? DEFAULT_RUNTIME_POLICY.finalAnswerTimeoutMs
            : DEFAULT_RUNTIME_POLICY.modelRoundTimeoutMs,
        );
        textDeltas = [];
        calls = [];
        finishReason = null;
        this.logger.log(
          `模型轮次开始 | 会话=${shortLogId(input.sessionId)} | 轮次=${modelRounds} | 尝试=${attempt}/${maxAttempts} | 可用工具=${definitions?.length ?? 0} 个 | 强制回答=${forceFinalAnswer ? '是' : '否'}`,
          AgentRuntimeService.name,
        );

        try {
          // Adapter 持续产出文本和聚合后的工具调用，Runtime 不依赖供应商 chunk 结构。
          for await (const event of this.model.streamRound({
            model: input.model,
            messages,
            tools: definitions,
            forceFinalAnswer,
            signal: roundSignal,
          })) {
            if (event.type === 'text.delta') {
              textDeltas.push(event.delta);
              if (!forceFinalAnswer) {
                visibleContent += event.delta;
                // 普通调查轮保持透明时间线；最终回答必须通过完整校验后才能交付。
                yield { type: 'text.delta', delta: event.delta };
              }
            } else if (event.type === 'tool_calls.completed') calls = event.calls;
            else finishReason = event.finishReason;
          }
        } catch (error) {
          if (input.signal?.aborted) {
            this.logger.warn(
              `模型轮次已取消 | 会话=${shortLogId(input.sessionId)} | 轮次=${modelRounds}`,
              AgentRuntimeService.name,
            );
            throw error;
          }
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

        if (forceFinalAnswer && finishReason === 'length') {
          throw new ServiceUnavailableException({
            code: AGENT_ERROR_CODES.modelLengthLimit,
            detail: '模型输出达到长度上限，本次回答未保存。',
          });
        }
        if (forceFinalAnswer && !roundContent.trim() && calls.length === 0) {
          throw new ServiceUnavailableException({
            code: AGENT_ERROR_CODES.modelEmptyResponse,
            detail: '模型没有返回可显示的文本，请稍后重试。',
          });
        }
        if (forceFinalAnswer && (calls.length > 0 || this.containsDsmlProtocol(roundContent))) {
          this.logger.warn(
            `最终回答协议污染 | 会话=${shortLogId(input.sessionId)} | 轮次=${modelRounds} | 尝试=${attempt}/${maxAttempts} | DSML=${this.containsDsmlProtocol(roundContent) ? '是' : '否'} | 工具调用=${calls.length} 个 | 文本=${roundContent.length} 字`,
            AgentRuntimeService.name,
          );
          if (attempt < maxAttempts) {
            messages.push({
              role: 'system',
              content:
                '上一次最终回答包含无效的工具协议，已被丢弃。请只输出面向用户的最终自然语言回答，不得输出 DSML、工具调用或控制标记。',
            });
            continue;
          }
          throw new ServiceUnavailableException({
            code: AGENT_ERROR_CODES.modelStreamFailed,
            detail: '模型连续返回了无效的工具协议，本次回答未保存。',
          });
        }

        if (forceFinalAnswer) {
          for (const delta of textDeltas) {
            visibleContent += delta;
            yield { type: 'text.delta', delta };
          }
        }
        break;
      }

      // 长度截断的文本不能作为完整交付持久化。
      if (finishReason === 'length') {
        throw new ServiceUnavailableException({
          code: AGENT_ERROR_CODES.modelLengthLimit,
          detail: '模型输出达到长度上限，本次回答未保存。',
        });
      }
      if (!calls.length) {
        const roundContent = textDeltas.join('');
        if (!roundContent.trim()) {
          throw new ServiceUnavailableException({
            code: AGENT_ERROR_CODES.modelEmptyResponse,
            detail: '模型没有返回可显示的文本，请稍后重试。',
          });
        }
        finalContent = visibleContent;
        break;
      }
      if (forceFinalAnswer) {
        throw new ServiceUnavailableException({
          code: AGENT_ERROR_CODES.toolBudgetExceeded,
          detail: '工具调用已达到本轮上限，模型仍未生成最终回答。',
        });
      }

      const normalizedCalls = calls.map((call) => ({
        ...call,
        id: call.id || crypto.randomUUID(),
      }));
      messages.push({
        role: 'assistant',
        content: textDeltas.join('') || null,
        toolCalls: normalizedCalls,
      });

      for (const call of normalizedCalls) {
        // 预算耗尽后的同批调用不再计数或执行，只补齐对应的 tool message。
        if (toolCallCount >= DEFAULT_RUNTIME_POLICY.maxToolCalls) {
          messages.push({
            role: 'tool',
            toolCallId: call.id,
            content: JSON.stringify({ ok: false, code: AGENT_ERROR_CODES.toolBudgetExceeded }),
          });
          enterFinalAnswer();
          this.logger.warn(
            `工具预算已耗尽 | 会话=${shortLogId(input.sessionId)} | 上限=${DEFAULT_RUNTIME_POLICY.maxToolCalls} 次`,
            AgentRuntimeService.name,
          );
          continue;
        }
        toolCallCount += 1;

        // 同一响应中已有工具请求结束工具阶段后，只补齐剩余调用的 tool message。
        if (forceFinalAnswer) {
          messages.push({
            role: 'tool',
            toolCallId: call.id,
            content: JSON.stringify({ ok: false, code: AGENT_ERROR_CODES.toolUnavailable }),
          });
          continue;
        }

        if (disabledTools.has(call.name)) {
          messages.push({
            role: 'tool',
            toolCallId: call.id,
            content: JSON.stringify({ ok: false, code: AGENT_ERROR_CODES.toolUnavailable }),
          });
          if (toolCallCount >= DEFAULT_RUNTIME_POLICY.maxToolCalls) enterFinalAnswer();
          continue;
        }

        let toolInput: unknown;
        try {
          toolInput = this.tools.parseInput(call.name, call.arguments);
        } catch (error) {
          const code =
            error instanceof Error ? error.message : AGENT_ERROR_CODES.invalidToolArguments;
          messages.push({
            role: 'tool',
            toolCallId: call.id,
            content: JSON.stringify({ ok: false, code }),
          });
          this.logger.warn(
            `工具参数无效 | 会话=${shortLogId(input.sessionId)} | 调用=${shortLogId(call.id)} | 工具=${call.name} | 错误码=${code}`,
            AgentRuntimeService.name,
          );
          if (toolCallCount >= DEFAULT_RUNTIME_POLICY.maxToolCalls) enterFinalAnswer();
          continue;
        }

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
        };
        let result: ToolExecutionResult<unknown>;
        try {
          result = await this.tools.execute(call.name, toolInput, {
            sessionId: input.sessionId,
            messageId: input.messageId,
            toolCallId: call.id,
            signal: input.signal,
            latestUserContent,
            runState,
          });
        } catch (error) {
          const completedAt = new Date();
          const durationMs = completedAt.getTime() - startedAt.getTime();
          const cancelled =
            input.signal?.aborted || (error instanceof Error && error.name === 'AbortError');
          this.logger.warn(
            `工具执行异常 | 会话=${shortLogId(input.sessionId)} | 调用=${shortLogId(call.id)} | 工具=${call.name} | 原因=${describeLogError(error)}`,
            AgentRuntimeService.name,
          );
          // 即使工具抛出异常，也先交付终态事件，避免前端 Activity 永久停留在运行中。
          if (cancelled) {
            yield {
              type: 'tool.cancelled',
              toolCallId: call.id,
              toolName: call.name,
              input: toolInput,
              completedAt: completedAt.toISOString(),
              durationMs,
              code: AGENT_ERROR_CODES.toolCancelled,
              detail: '工具调用已取消。',
            };
          } else {
            yield {
              type: 'tool.failed',
              toolCallId: call.id,
              toolName: call.name,
              input: toolInput,
              completedAt: completedAt.toISOString(),
              durationMs,
              code: AGENT_ERROR_CODES.toolUnavailable,
              detail: '工具执行异常，本次调用未完成。',
            };
          }
          throw error;
        }
        const completedAt = new Date();
        const durationMs = completedAt.getTime() - startedAt.getTime();
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
          };
        } else if (result.status === 'cancelled') {
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
          };
        } else {
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
          };
        }
        // 工具结果只作为不可信 tool message 回传模型，不提升为 system/user instruction。
        messages.push({ role: 'tool', toolCallId: call.id, content: result.modelContent });
        for (const name of result.control?.disableTools ?? []) disabledTools.add(name);
        if (result.control?.forceFinalAnswer) enterFinalAnswer();
        if (toolCallCount >= DEFAULT_RUNTIME_POLICY.maxToolCalls) enterFinalAnswer();
      }
    }

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

  private formatToolLogFields(
    fields: Readonly<Record<string, string | number | boolean>> | undefined,
  ): string {
    if (!fields) return '';
    return Object.entries(fields)
      .map(([key, value]) => ` | ${key}=${String(value)}`)
      .join('');
  }

  private latestUserContent(messages: ChatMessage[]): string {
    return [...messages].reverse().find((message) => message.role === 'user')?.content ?? '';
  }

  // 将共享聊天消息转换为 Runtime 使用的 canonical model message。
  private toModelMessages(messages: ChatMessage[]): ModelMessage[] {
    return messages.map((message): ModelMessage => {
      if (message.role === 'tool')
        return { role: 'tool', content: message.content, toolCallId: message.toolCallId };
      if (message.role === 'assistant') {
        return {
          role: 'assistant',
          content: message.content ?? null,
          toolCalls: message.toolCalls?.map((call) => ({
            id: call.id,
            name: call.name,
            arguments: JSON.stringify(call.arguments),
          })),
        };
      }
      return { role: message.role, content: message.content };
    });
  }
}

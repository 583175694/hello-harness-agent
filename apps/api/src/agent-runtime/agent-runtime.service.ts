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
    const definitions = this.tools.definitions();
    const messages: ModelMessage[] = [
      { role: 'system', content: input.systemPrompt },
      ...this.toModelMessages(input.messages),
    ];
    let toolCallCount = 0;
    let forceFinalAnswer = false;
    let finalContent = '';
    let visibleContent = '';
    let modelRounds = 0;
    const toolUnitsUsed = new Map<string, number>();

    // 每一轮要么直接得到最终文本，要么执行工具并把结果追加到下一轮上下文。
    while (modelRounds <= DEFAULT_RUNTIME_POLICY.maxToolCalls) {
      modelRounds += 1;
      const roundStartedAt = Date.now();
      const textDeltas: string[] = [];
      let calls: Array<{ id: string; name: string; arguments: string }> = [];
      let finishReason: string | null = null;
      this.logger.log(
        `模型轮次开始 | 会话=${shortLogId(input.sessionId)} | 轮次=${modelRounds} | 可用工具=${definitions?.length ?? 0} 个 | 强制回答=${forceFinalAnswer ? '是' : '否'}`,
        AgentRuntimeService.name,
      );

      try {
        // Adapter 持续产出文本和聚合后的工具调用，Runtime 不依赖供应商 chunk 结构。
        for await (const event of this.model.streamRound({
          model: input.model,
          messages,
          tools: definitions,
          forceFinalAnswer,
          signal: input.signal,
        })) {
          if (event.type === 'text.delta') {
            textDeltas.push(event.delta);
            visibleContent += event.delta;
            // 文本和工具事件共同组成透明时间线，模型增量到达后必须立即向上游投影。
            yield { type: 'text.delta', delta: event.delta };
          } else if (event.type === 'tool_calls.completed') calls = event.calls;
          else finishReason = event.finishReason;
        }
      } catch (error) {
        if (input.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
          this.logger.warn(
            `模型轮次已取消 | 会话=${shortLogId(input.sessionId)} | 轮次=${modelRounds}`,
            AgentRuntimeService.name,
          );
          throw error;
        }
        this.logger.warn(
          `模型请求失败 | 会话=${shortLogId(input.sessionId)} | 轮次=${modelRounds} | 原因=${describeLogError(error)} | 耗时=${formatLogDuration(Date.now() - roundStartedAt)}`,
          AgentRuntimeService.name,
        );
        throw new BadGatewayException({
          code: AGENT_ERROR_CODES.modelRequestFailed,
          detail: '模型服务暂时不可用，请检查供应商配置后重试。',
        });
      }

      this.logger.log(
        `模型轮次完成 | 会话=${shortLogId(input.sessionId)} | 轮次=${modelRounds} | 原因=${finishReason ?? 'unknown'} | 文本=${textDeltas.join('').length} 字 | 工具调用=${calls.length} 个 | 耗时=${formatLogDuration(Date.now() - roundStartedAt)}`,
        AgentRuntimeService.name,
      );

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
        toolCallCount += 1;
        // 超出预算的调用不再执行，而是把机器可读错误交回模型并要求最终回答。
        if (toolCallCount > DEFAULT_RUNTIME_POLICY.maxToolCalls) {
          messages.push({
            role: 'tool',
            toolCallId: call.id,
            content: JSON.stringify({ ok: false, code: AGENT_ERROR_CODES.toolBudgetExceeded }),
          });
          forceFinalAnswer = true;
          this.logger.warn(
            `工具预算已耗尽 | 会话=${shortLogId(input.sessionId)} | 上限=${DEFAULT_RUNTIME_POLICY.maxToolCalls} 次`,
            AgentRuntimeService.name,
          );
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
        const budget = typeof this.tools.units === 'function'
          ? this.tools.units(call.name, toolInput)
          : { units: 1 };
        const usedUnits = toolUnitsUsed.get(call.name) ?? 0;
        if (budget.limit !== undefined && usedUnits + budget.units > budget.limit) {
          const completedAt = new Date();
          const durationMs = completedAt.getTime() - startedAt.getTime();
          const code = AGENT_ERROR_CODES.fetchBudgetExceeded;
          const detail = '网页读取已达到本轮 URL 上限。';
          yield {
            type: 'tool.failed',
            toolCallId: call.id,
            toolName: call.name,
            input: toolInput,
            completedAt: completedAt.toISOString(),
            durationMs,
            code,
            detail,
          };
          messages.push({
            role: 'tool',
            toolCallId: call.id,
            content: JSON.stringify({ ok: false, code }),
          });
          this.logger.warn(
            `工具单位预算已耗尽 | 会话=${shortLogId(input.sessionId)} | 工具=${call.name} | 已用=${usedUnits} | 请求=${budget.units} | 上限=${budget.limit}`,
            AgentRuntimeService.name,
          );
          continue;
        }
        toolUnitsUsed.set(call.name, usedUnits + budget.units);
        let result: ToolExecutionResult<unknown>;
        try {
          result = await this.tools.execute(call.name, toolInput, {
            sessionId: input.sessionId,
            messageId: input.messageId,
            toolCallId: call.id,
            signal: input.signal,
          });
        } catch (error) {
          const completedAt = new Date();
          const durationMs = completedAt.getTime() - startedAt.getTime();
          const cancelled = input.signal?.aborted || (error instanceof Error && error.name === 'AbortError');
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
          // 结果数量不是所有工具都具备的指标，缺失时不输出误导性的零值。
          const resultCount =
            result.metrics.resultCount === undefined
              ? ''
              : ` | 结果=${result.metrics.resultCount} 条`;
          this.logger.log(
            `工具调用完成 | 会话=${shortLogId(input.sessionId)} | 调用=${shortLogId(call.id)} | 工具=${call.name} | 状态=成功${resultCount} | 耗时=${formatLogDuration(durationMs)}`,
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
          this.logger.warn(
            `工具调用完成 | 会话=${shortLogId(input.sessionId)} | 调用=${shortLogId(call.id)} | 工具=${call.name} | 状态=已取消 | 错误码=${result.error.code} | 耗时=${formatLogDuration(durationMs)}`,
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
          this.logger.warn(
            `工具调用完成 | 会话=${shortLogId(input.sessionId)} | 调用=${shortLogId(call.id)} | 工具=${call.name} | 状态=${result.status} | 错误码=${result.error.code} | 耗时=${formatLogDuration(durationMs)}`,
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
        if (toolCallCount >= DEFAULT_RUNTIME_POLICY.maxToolCalls) forceFinalAnswer = true;
      }
    }

    this.logger.log(
      `Agent 运行完成 | 会话=${shortLogId(input.sessionId)} | 轮次=${modelRounds} | 工具=${toolCallCount} 次 | 耗时=${formatLogDuration(Date.now() - runtimeStartedAt)}`,
      AgentRuntimeService.name,
    );
    yield { type: 'run.completed', content: finalContent, toolCallCount };
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

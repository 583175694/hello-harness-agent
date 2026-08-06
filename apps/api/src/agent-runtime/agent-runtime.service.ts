import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';

import { AGENT_ERROR_CODES } from '@harness/agent-protocol';
import type { ChatMessage } from '@harness/agent-protocol';
import { ModelAdapter } from '../model/model-adapter';
import type { ModelMessage } from '../model/model-adapter';
import { ToolRegistryService } from '../tools/tool-registry.service';
import type { AgentRuntimeEvent, AgentRuntimeInput } from './agent-runtime.types';
import { DEFAULT_RUNTIME_POLICY } from './runtime-policy';

@Injectable()
export class AgentRuntimeService {
  constructor(
    private readonly model: ModelAdapter,
    private readonly tools: ToolRegistryService,
  ) {}

  // 执行有硬预算的模型-工具循环，并输出供应商无关的 Runtime 事件。
  async *run(input: AgentRuntimeInput): AsyncGenerator<AgentRuntimeEvent> {
    const definitions = this.tools.definitions();
    const messages: ModelMessage[] = [
      { role: 'system', content: input.systemPrompt },
      ...this.toModelMessages(input.messages),
    ];
    let toolCallCount = 0;
    let forceFinalAnswer = false;
    let finalContent = '';
    let modelRounds = 0;

    while (modelRounds <= DEFAULT_RUNTIME_POLICY.maxToolCalls) {
      modelRounds += 1;
      const textDeltas: string[] = [];
      let calls: Array<{ id: string; name: string; arguments: string }> = [];
      let finishReason: string | null = null;
      const streamTextImmediately = !definitions || forceFinalAnswer;

      try {
        for await (const event of this.model.streamRound({
          model: input.model,
          messages,
          tools: definitions,
          forceFinalAnswer,
          signal: input.signal,
        })) {
          if (event.type === 'text.delta') {
            textDeltas.push(event.delta);
            if (streamTextImmediately) yield { type: 'text.delta', delta: event.delta };
          } else if (event.type === 'tool_calls.completed') calls = event.calls;
          else finishReason = event.finishReason;
        }
      } catch (error) {
        if (input.signal?.aborted || (error instanceof Error && error.name === 'AbortError'))
          throw error;
        throw new BadGatewayException({
          code: AGENT_ERROR_CODES.modelRequestFailed,
          detail: '模型服务暂时不可用，请检查供应商配置后重试。',
        });
      }

      if (finishReason === 'length') {
        throw new ServiceUnavailableException({
          code: AGENT_ERROR_CODES.modelLengthLimit,
          detail: '模型输出达到长度上限，本次回答未保存。',
        });
      }
      if (!calls.length) {
        finalContent = textDeltas.join('');
        if (!finalContent.trim()) {
          throw new ServiceUnavailableException({
            code: AGENT_ERROR_CODES.modelEmptyResponse,
            detail: '模型没有返回可显示的文本，请稍后重试。',
          });
        }
        if (!streamTextImmediately) {
          for (const delta of textDeltas) yield { type: 'text.delta', delta };
        }
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
        if (toolCallCount > DEFAULT_RUNTIME_POLICY.maxToolCalls) {
          messages.push({
            role: 'tool',
            toolCallId: call.id,
            content: JSON.stringify({ ok: false, code: AGENT_ERROR_CODES.toolBudgetExceeded }),
          });
          forceFinalAnswer = true;
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
          continue;
        }

        const startedAt = new Date();
        yield {
          type: 'tool.started',
          toolCallId: call.id,
          toolName: call.name,
          input: toolInput,
          startedAt: startedAt.toISOString(),
        };
        const result = await this.tools.execute(call.name, toolInput, {
          sessionId: input.sessionId,
          messageId: input.messageId,
          toolCallId: call.id,
          signal: input.signal,
        });
        const completedAt = new Date();
        const durationMs = completedAt.getTime() - startedAt.getTime();
        if (result.status === 'succeeded') {
          yield {
            type: 'tool.completed',
            toolCallId: call.id,
            toolName: call.name,
            input: toolInput,
            output: result.output,
            completedAt: completedAt.toISOString(),
            durationMs,
          };
        } else {
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
        messages.push({ role: 'tool', toolCallId: call.id, content: result.modelContent });
        if (toolCallCount >= DEFAULT_RUNTIME_POLICY.maxToolCalls) forceFinalAnswer = true;
      }
    }

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

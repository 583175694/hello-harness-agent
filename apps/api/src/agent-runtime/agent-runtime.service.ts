import {
  BadGatewayException,
  Inject,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Logger } from 'nestjs-pino';

import {
  AGENT_ERROR_CODES,
  AGENT_TOOL_NAMES,
  bashInputSchema,
  hashBashApprovalBase,
  renderBashBackgroundResult,
  renderBashResult,
  toBashInputSummary,
  toBashTerminalCommandInput,
  type BashInput,
  type BashRunResult,
  type BashTerminalCommandInput,
} from '@harness/agent-protocol';
import { BashCommandPolicyService } from '../sandbox/bash-command-policy.service';
import { sandboxLimits } from '../sandbox/sandbox-config';
import { ModelAdapter } from '../model/model-adapter';
import {
  ModelProviderResponseError,
  type ModelFinishReason,
  type ModelMessage,
  type ModelToolCall,
} from '../model/model-adapter';
import type { ToolExecutionContext, ToolExecutionResult } from '../tools/agent-tool.types';
import { ToolInputValidationError, ToolRegistryService } from '../tools/tool-registry.service';
import type { ToolRegistryContext } from '../tools/tool-registry.types';
import { describeLogError, formatLogDuration, shortLogId } from '../shared/logging.utils';
import type { AgentRuntimeEvent, AgentRuntimeInput } from './agent-runtime.types';
import { DEFAULT_RUNTIME_POLICY } from './runtime-policy';
import { recoverTruncatedModelRound } from './output-limit-recovery';
import { ContextEngineeringService } from '../context-engineering/context-engineering.service';
import type { ToolResultCandidate } from '../context-engineering/context-engineering.types';
import type { CompactionState } from '../context-engineering/context-engineering.types';
import { type PlanSnapshot } from '@harness/agent-protocol';
import { PlanHandler } from './plan.handler';
import { builtinToolDefinitions } from '../tools/builtin-tool-definitions';
import type {
  RuntimeLifecycleBoundary,
  RuntimeLifecycleContextMap,
  RuntimeLifecycleToolCall,
  RuntimeToolDispatchItem,
  RuntimeToolResultSummary,
} from './runtime-lifecycle';

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
    @Inject(BashCommandPolicyService) private readonly bashPolicy: BashCommandPolicyService,
    @Inject(Logger) private readonly logger: Logger,
    @Optional()
    @Inject(ContextEngineeringService)
    private readonly context?: ContextEngineeringService,
  ) {}

  private readonly planHandler = new PlanHandler();

  // 执行受通用调用上限约束的模型-工具循环，并输出供应商无关的 Runtime 事件。
  async *run(input: AgentRuntimeInput): AsyncGenerator<AgentRuntimeEvent> {
    const toolRegistryContext: ToolRegistryContext = { mcpSnapshot: input.mcpSnapshot };
    const runtimeStartedAt = Date.now();
    const runDeadlineSignal = AbortSignal.timeout(DEFAULT_RUNTIME_POLICY.runTimeoutMs);
    const runSignal = input.signal
      ? AbortSignal.any([input.signal, runDeadlineSignal])
      : runDeadlineSignal;
    // System Prompt 与历史消息共同组成第一轮模型上下文，后续轮次只在该数组末尾追加。
    const messages: ModelMessage[] = [
      { role: 'system', content: input.systemPrompt },
      ...input.messages,
    ];
    // 分别记录工具调用次数、交付模式、最终正文和已向客户端展示的文本。
    let toolCallCount = 0;
    let finalResponseOnly = false;
    let finalInstructionAdded = false;
    let finalContent = '';
    let visibleContent = '';
    let modelRounds = 0;
    let compactionState: CompactionState | undefined;
    // reasoning-only 只允许单向切换一次到无工具、无思考的最终回答恢复阶段。
    let finalizationRecoveryAttempted = false;
    let outputLimitRecoveryCount = 0;
    let deliveryNudgeAdded = false;
    // Runtime 仅保留最新计划，用于事件发布和下一轮只读上下文。
    let currentPlan: PlanSnapshot | undefined;
    // 将运行从可调用工具的调查阶段单向切换到无工具的最终回答阶段。
    const enterFinalAnswer = () => {
      // 同一批 Tool Call 必须先补齐全部 Tool Message，最终回答指令在批次结束后追加。
      if (finalResponseOnly) return;
      finalResponseOnly = true;
    };

    // 每次外层循环对应一次独立模型请求，也就是一个稳定的 Model Round。
    // 每一轮要么得到最终文本，要么执行工具并把结果追加到下一轮上下文。
    runtimeLoop: while (modelRounds <= DEFAULT_RUNTIME_POLICY.maxToolCalls) {
      this.assertRunActive(input.signal, runDeadlineSignal);
      modelRounds += 1;
      const beforeModelWait = this.reachLifecycle(input, 'before_model_request', {
        roundSequence: modelRounds,
        finalResponseOnly,
      });
      if (beforeModelWait) await beforeModelWait;
      if (input.onBeforeModelRequest) {
        const result = await input.onBeforeModelRequest(modelRounds, finalResponseOnly);
        if (result.messages.length) messages.push(...result.messages);
        for (const intervention of result.interventions ?? []) {
          yield {
            type: 'user.intervention',
            ...intervention,
            roundId: crypto.randomUUID(),
            roundSequence: modelRounds,
            blockSequence: 0,
          };
        }
      }
      this.assertRunActive(input.signal, runDeadlineSignal);
      if (
        !finalResponseOnly &&
        !deliveryNudgeAdded &&
        modelRounds === DEFAULT_RUNTIME_POLICY.deliveryNudgeAfterRounds
      ) {
        deliveryNudgeAdded = true;
        messages.push({
          role: 'system',
          content:
            '已进行多轮调查。请停止重复搜索，基于已有材料用精炼 create_report 或较短最终回答完成交付；不要在思考中复述全部原始数据。',
        });
      }
      this.logger.log(
        `模型 Loop 即将开始 | 会话=${shortLogId(input.sessionId)} | Run=${shortLogId(input.runId ?? 'unknown')} | 轮次=${modelRounds} | 阶段=${finalResponseOnly ? 'final_answer' : 'tool_loop'} | 暂停状态=${input.lifecycle?.snapshot().state ?? 'none'}`,
        AgentRuntimeService.name,
      );
      // 最终回答阶段从请求参数层面移除工具，不能只依赖 Prompt 约束模型。
      // 最终回答阶段主动撤掉所有工具，防止模型在收尾时再次发起调用。
      const definitions = finalResponseOnly
        ? undefined
        : [
            ...(this.tools.definitions(toolRegistryContext) ?? []),
            ...builtinToolDefinitions(),
          ];
      // 每次模型尝试都重新收集文本、工具调用和结束原因，污染重试不得混入上一轮内容。
      let compiled;
      try {
        // 将文件预算超限转换为前端可识别的稳定错误码。
        compiled = this.context
          ? await this.context.compileRound({
              sessionId: input.sessionId,
              model: input.model,
              messages,
              tools: definitions,
              signal: runSignal,
              ...(compactionState ? { compactionState } : {}),
            })
          : { messages, estimatedInputTokens: 0, promptBudget: null, compactionTriggered: false };
      } catch (error) {
        if (
          error instanceof Error &&
          (error.name === 'ModelTranscriptIntegrityError' ||
            error.message === 'MODEL_TRANSCRIPT_INTEGRITY_ERROR')
        ) {
          this.logger.warn(
            `上下文工具链不完整 | 会话=${shortLogId(input.sessionId)} | 轮次=${modelRounds} | 上游=${describeLogError(error)}`,
            AgentRuntimeService.name,
          );
          throw new ServiceUnavailableException({
            code: AGENT_ERROR_CODES.modelTranscriptIntegrityError,
            detail:
              '对话过长后工具调用记录不完整，无法继续请求模型。请新建会话后重试，或缩短单次任务的调查范围。',
          });
        }
        if (
          error instanceof Error &&
          (error.message === 'CONTEXT_BUDGET_EXCEEDED' ||
            error.message === 'FILE_CONTEXT_TOO_LARGE')
        ) {
          const code =
            error.message === 'FILE_CONTEXT_TOO_LARGE'
              ? 'FILE_CONTEXT_TOO_LARGE'
              : AGENT_ERROR_CODES.contextBudgetExceeded;
          this.logger.warn(
            `上下文编译失败 | 会话=${shortLogId(input.sessionId)} | 轮次=${modelRounds} | 错误码=${code}`,
            AgentRuntimeService.name,
          );
          throw new ServiceUnavailableException({
            code,
            detail:
              error.message === 'FILE_CONTEXT_TOO_LARGE'
                ? '文件内容超过当前模型上下文预算，请移除附件或缩短问题后重试。'
                : '当前上下文超过模型预算，无法在保留必要内容后继续执行。',
          });
        }
        this.logger.warn(
          `上下文编译异常 | 会话=${shortLogId(input.sessionId)} | 轮次=${modelRounds} | 上游=${describeLogError(error)}`,
          AgentRuntimeService.name,
        );
        throw error;
      }
      if (compiled.compactionState) compactionState = compiled.compactionState;
      if (typeof this.context?.applyCollapsedToolPointers === 'function') {
        this.context.applyCollapsedToolPointers(messages, compiled.messages);
      }
      const roundMessages = compiled.messages;
      let textDeltas: string[] = [];
      let reasoningDeltas: string[] = [];
      let calls: ModelToolCall[] = [];
      let clarification: import('@harness/agent-protocol').ClarificationRequest | undefined;
      let finishReason: ModelFinishReason | null = null;
      let incompleteReason: string | undefined;
      // roundId 是稳定关联标识，roundSequence 才承担跨 Round 的排序职责。
      let roundId = crypto.randomUUID();
      let textBlockSequence = 0;
      let textPhase: 'pending' | 'commentary' | 'final_answer' | null | undefined;
      // 普通调查轮只调用一次；最终回答遇到协议污染时允许有限重试。
      const maxAttempts = finalResponseOnly
        ? DEFAULT_RUNTIME_POLICY.finalAnswerProtocolRetries +
          DEFAULT_RUNTIME_POLICY.outputLimitRecoveryAttempts +
          1
        : 1;
      // 内层循环只负责一次模型轮次及最终回答协议校验，不执行任何工具。
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        roundId = crypto.randomUUID();
        const attemptStartedAt = Date.now();
        // 普通轮和最终回答使用不同超时，但都必须响应用户取消信号。
        const roundSignal = this.roundSignal(
          runSignal,
          finalResponseOnly
            ? DEFAULT_RUNTIME_POLICY.finalAnswerTimeoutMs
            : DEFAULT_RUNTIME_POLICY.modelRoundTimeoutMs,
        );
        textDeltas = [];
        reasoningDeltas = [];
        calls = [];
        textPhase = undefined;
        finishReason = null;
        incompleteReason = undefined;
        let usage = {
          promptTokens: null as number | null,
          completionTokens: null as number | null,
          cachedTokens: null as number | null,
          estimatedPromptTokens: 0,
        };
        this.logger.log(
          `模型轮次开始 | 会话=${shortLogId(input.sessionId)} | 轮次=${modelRounds} | 尝试=${attempt}/${maxAttempts} | 可用工具=${definitions?.length ?? 0} 个 | 仅最终回答=${finalResponseOnly ? '是' : '否'}`,
          AgentRuntimeService.name,
        );
        const attemptVisibleStart = visibleContent.length;

        try {
          // Adapter 持续产出文本和聚合后的工具调用，Runtime 不依赖供应商 chunk 结构。
          for await (const event of this.model.streamRound({
            model: input.model,
            messages: roundMessages,
            tools: definitions,
            // 最终答案不需要新的思维链：保留输出
            // 为用户可见内容预留预算。历史工具调用推理在协议需要时仍由模型适配器回放。
            reasoningEffort: finalResponseOnly ? 'off' : (input.reasoningEffort ?? 'off'),
            maxOutputTokens: finalResponseOnly
              ? DEFAULT_RUNTIME_POLICY.finalAnswerMaxOutputTokens
              : DEFAULT_RUNTIME_POLICY.toolRoundMaxOutputTokens,
            signal: roundSignal,
            allowClarification: !finalResponseOnly,
          })) {
            // 普通 Tool Round 的 Content 首字立即交付，不为排序牺牲首字速度；
            // Round 完成且存在 Tool Call 时，它自然被解释为工具前言而非最终正文。
            if (event.type === 'reasoning.delta') {
              reasoningDeltas.push(event.delta);
              yield {
                type: 'reasoning.delta',
                delta: event.delta,
                roundId,
                roundSequence: modelRounds,
                blockSequence: event.blockSequence,
              };
            } else if (event.type === 'text.delta') {
              textDeltas.push(event.delta);
              textBlockSequence = event.blockSequence;
              if (event.phase !== undefined) textPhase = event.phase;
              visibleContent += event.delta;
              yield {
                type: 'text.delta',
                delta: event.delta,
                roundId,
                roundSequence: modelRounds,
                blockSequence: event.blockSequence,
                ...(event.phase !== undefined ? { phase: event.phase } : {}),
              };
            } else if (event.type === 'text.phase.completed') {
              textBlockSequence = event.blockSequence;
              textPhase = event.phase;
              yield {
                type: 'text.phase.completed',
                roundId,
                roundSequence: modelRounds,
                blockSequence: event.blockSequence,
                phase: event.phase,
              };
            } else if (event.type === 'tool_calls.completed') {
              // Adapter 已聚合供应商的分片参数，Runtime 只消费完整 Tool Call。
              calls = event.calls;
            } else if (event.type === 'clarification.completed') {
              clarification = event.request;
            } else {
              // 结束原因用于区分正常完成、长度截断和其他供应商终态。
              finishReason = event.finishReason;
              incompleteReason = event.incompleteReason;
              usage = event.usage ?? usage;
            }
          }
        } catch (error) {
          if (textDeltas.length) {
            visibleContent = visibleContent.slice(0, attemptVisibleStart);
            yield {
              type: 'text.discarded',
              roundId,
              roundSequence: modelRounds,
              blockSequence: textBlockSequence,
            };
          }
          // 用户主动取消必须原样向上传播，不能包装成供应商故障。
          if (input.signal?.aborted) {
            this.logger.warn(
              `模型轮次已取消 | 会话=${shortLogId(input.sessionId)} | 轮次=${modelRounds}`,
              AgentRuntimeService.name,
            );
            throw error;
          }
          if (runDeadlineSignal.aborted)
            throw new ServiceUnavailableException({
              code: AGENT_ERROR_CODES.runDeadlineExceeded,
              detail: '本次任务已达到总执行时间上限。',
            });
          if (roundSignal.aborted)
            throw new ServiceUnavailableException({
              code: AGENT_ERROR_CODES.modelRoundTimeout,
              detail: '模型本轮响应超时，本次回答未完成。',
            });
          if (error instanceof ModelProviderResponseError)
            throw new BadGatewayException({
              code: AGENT_ERROR_CODES.modelRequestFailed,
              detail: '模型供应商返回失败，本次回答未完成。',
            });
          // 已排除取消和确定性超时后，其余流异常按不可恢复的传输中断处理。
          this.logger.warn(
            `模型请求失败 | 会话=${shortLogId(input.sessionId)} | 轮次=${modelRounds} | 原因=${describeLogError(error)} | 耗时=${formatLogDuration(Date.now() - attemptStartedAt)}`,
            AgentRuntimeService.name,
          );
          throw new BadGatewayException({
            code: AGENT_ERROR_CODES.modelStreamInterrupted,
            detail: '模型响应流意外中断，本次回答未完成。',
          });
        }

        const roundContent = textDeltas.join('');
        if (roundContent && textPhase === 'pending') {
          textPhase = calls.length ? 'commentary' : 'final_answer';
          yield {
            type: 'text.phase.completed',
            roundId,
            roundSequence: modelRounds,
            blockSequence: textBlockSequence,
            phase: textPhase,
          };
        }
        const roundDurationMs = Date.now() - attemptStartedAt;
        const roundResponse: ModelMessage = {
          role: 'assistant',
          content: roundContent || null,
          ...(textPhase === 'commentary' || textPhase === 'final_answer'
            ? { phase: textPhase }
            : {}),
          ...(reasoningDeltas.length ? { reasoning: reasoningDeltas.join('') } : {}),
          ...(calls.length ? { toolCalls: structuredClone(calls) } : {}),
        };
        yield {
          type: 'model.round.completed',
          observation: {
            roundSequence: modelRounds,
            attempt,
            ...usage,
            durationMs: roundDurationMs,
            finishReason,
            ...(incompleteReason ? { incompleteReason } : {}),
          },
          context: {
            version: 1,
            roundSequence: modelRounds,
            attempt,
            estimatedInputTokens: compiled.estimatedInputTokens,
            promptBudget: compiled.promptBudget,
            compactionTriggered: compiled.compactionTriggered,
            finalResponseOnly,
            messages: structuredClone(roundMessages),
            response: structuredClone(roundResponse),
            tools: structuredClone(definitions ?? []),
          },
        };
        const blockOrder = [
          ...(textDeltas.length > 0 ? [`text:${textBlockSequence}`] : []),
          ...calls.map(
            (call, callIndex) =>
              `tool:${call.blockSequence ?? callIndex}:${shortLogId(call.id || `missing-${callIndex}`)}`,
          ),
        ].join(',');
        this.logger.log(
          `模型轮次完成 | 会话=${shortLogId(input.sessionId)} | 轮次=${modelRounds} | 尝试=${attempt}/${maxAttempts} | 原因=${finishReason ?? 'unknown'} | reasoning=${finalResponseOnly ? 'off' : (input.reasoningEffort ?? 'off')} | promptTokens=${usage.promptTokens ?? 'unknown'} | completionTokens=${usage.completionTokens ?? 'unknown'} | estimatedPromptTokens=${usage.estimatedPromptTokens} | cachedTokens=${usage.cachedTokens ?? 'unknown'} | 文本=${roundContent.length} 字 | reasoning文本=${reasoningDeltas.join('').length} 字 | 工具调用=${calls.length} 个 | Block顺序=${blockOrder || '空'} | 耗时=${formatLogDuration(roundDurationMs)}`,
          AgentRuntimeService.name,
        );

        const truncated =
          finishReason === 'max_output_tokens' || incompleteReason === 'max_output_tokens';
        if (incompleteReason && incompleteReason !== 'max_output_tokens') {
          throw new ServiceUnavailableException({
            code: AGENT_ERROR_CODES.modelStreamInterrupted,
            detail: '模型响应未完整结束，本次回答未完成。',
          });
        }
        if (truncated) {
          const recovery = recoverTruncatedModelRound({
            calls,
            hasText: Boolean(textDeltas.join('').trim()),
            finalResponseOnly,
          });
          if (recovery.kind === 'proceed') {
            calls = recovery.calls;
            this.logger.warn(
              `输出预算截断已恢复 | 会话=${shortLogId(input.sessionId)} | 轮次=${modelRounds} | 修复参数=${recovery.anySalvaged ? '是' : '否'} | 工具调用=${calls.length} 个`,
              AgentRuntimeService.name,
            );
          } else if (
            outputLimitRecoveryCount < DEFAULT_RUNTIME_POLICY.outputLimitRecoveryAttempts
          ) {
            outputLimitRecoveryCount += 1;
            this.logger.warn(
              `输出预算截断，缩短后重试 | 会话=${shortLogId(input.sessionId)} | 轮次=${modelRounds} | 阶段=${finalResponseOnly ? 'final_answer' : 'tool_loop'}`,
              AgentRuntimeService.name,
            );
            if (textDeltas.length) {
              visibleContent = visibleContent.slice(0, attemptVisibleStart);
              yield {
                type: 'text.discarded',
                roundId,
                roundSequence: modelRounds,
                blockSequence: textBlockSequence,
              };
            }
            messages.push({ role: 'system', content: recovery.hint });
            if (finalResponseOnly) continue;
            continue runtimeLoop;
          } else {
            if (finalResponseOnly && textDeltas.length) {
              visibleContent = visibleContent.slice(0, attemptVisibleStart);
              yield {
                type: 'text.discarded',
                roundId,
                roundSequence: modelRounds,
                blockSequence: textBlockSequence,
              };
            }
            throw new ServiceUnavailableException({
              code: AGENT_ERROR_CODES.modelOutputLimit,
              detail: '模型输出预算已耗尽，本次回答未保存。',
            });
          }
        }
        // 无文本、无 reasoning 且无工具调用表示供应商没有产生任何可消费结果。
        if (
          finalResponseOnly &&
          !roundContent.trim() &&
          calls.length === 0 &&
          !reasoningDeltas.length
        ) {
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
            visibleContent = visibleContent.slice(0, attemptVisibleStart);
            yield {
              type: 'text.discarded',
              roundId,
              roundSequence: modelRounds,
              blockSequence: textBlockSequence,
            };
            messages.push({
              role: 'system',
              content:
                '上一次最终回答包含无效的工具协议，已被丢弃。请只输出面向用户的最终自然语言回答，不得输出 DSML、工具调用或控制标记。',
            });
            continue;
          }
          visibleContent = visibleContent.slice(0, attemptVisibleStart);
          yield {
            type: 'text.discarded',
            roundId,
            roundSequence: modelRounds,
            blockSequence: textBlockSequence,
          };
          // 达到重试上限仍被污染时终止交付，避免保存伪工具协议。
          throw new ServiceUnavailableException({
            code: AGENT_ERROR_CODES.modelStreamFailed,
            detail: '模型连续返回了无效的工具协议，本次回答未保存。',
          });
        }

        // 当前尝试已经成功完成，退出协议重试循环并进入本轮结果处理。
        break;
      }

      // 某些兼容供应商可能缺失 Tool Call ID，为每个调用补齐稳定关联标识。
      const normalizedCalls: RuntimeLifecycleToolCall[] = calls.map((call, callIndex) => ({
        ...call,
        id: call.id || crypto.randomUUID(),
        blockSequence:
          call.blockSequence ??
          (textDeltas.length > 0 ? textBlockSequence + callIndex + 1 : callIndex),
        providerIndex: call.providerIndex ?? callIndex,
      }));
      const classifiedWait = this.reachLifecycle(input, 'model_round_classified', {
        roundId,
        roundSequence: modelRounds,
        finishReason,
        outcome: normalizedCalls.length ? 'tool_calls' : 'final_answer',
        toolCalls: normalizedCalls,
        ...(clarification ? { clarification } : {}),
      });
      if (classifiedWait) await classifiedWait;
      this.assertRunActive(input.signal, runDeadlineSignal);

      if (clarification) {
        if (normalizedCalls.length || finalResponseOnly)
          throw new ServiceUnavailableException({
            code: 'INVALID_CLARIFICATION',
            detail: '澄清请求不能与工具调用或最终回答混合。',
          });
        if (!input.lifecycle)
          throw new ServiceUnavailableException({
            code: 'HITL_RUNTIME_REQUIRED',
            detail: '澄清请求缺少 Runtime 控制器。',
          });
        const clarificationWait = input.lifecycle.createClarification({
          roundId,
          roundSequence: modelRounds,
          finishReason,
          outcome: 'final_answer',
          toolCalls: normalizedCalls,
          clarification,
        });
        const interruptId = input.lifecycle.interrupt()?.interruptId;
        if (!interruptId) throw new Error('CLARIFICATION_INTERRUPT_MISSING');
        messages.push({
          role: 'assistant',
          content: this.clarificationRequestContent(clarification),
        });
        yield {
          type: 'transcript.fact',
          fact: {
            kind: 'clarification_request',
            interruptId,
            roundId,
            roundSequence: modelRounds,
            request: clarification,
          },
        };
        yield {
          type: 'clarification.requested',
          request: clarification,
          roundId,
          roundSequence: modelRounds,
        };
        const result = await clarificationWait;
        if (result.kind !== 'clarification') throw new Error('INVALID_CLARIFICATION_RESPONSE');
        messages.push({ role: 'user', content: result.answer });
        yield {
          type: 'transcript.fact',
          fact: {
            kind: 'clarification_response',
            interruptId,
            roundId,
            roundSequence: modelRounds,
            answer: result.answer,
          },
        };
        continue;
      }

      // Round outcome 只在完整消费供应商流后确认：无 Tool Call 才是最终正文。
      // 没有工具调用表示模型已经产出最终文本；计划状态不参与此判断。
      if (!normalizedCalls.length) {
        const roundContent = textDeltas.join('');
        if (
          !roundContent.trim() &&
          !finalResponseOnly &&
          !finalizationRecoveryAttempted
        ) {
          finalizationRecoveryAttempted = true;
          enterFinalAnswer();
          messages.push({
            role: 'system',
            content:
              '上一轮没有生成用户可见正文。请停止继续分析，仅依据已有材料直接输出完整最终答案，不得调用工具或输出控制标记。',
          });
          continue runtimeLoop;
        }
        if (!roundContent.trim() && reasoningDeltas.length) {
          throw new ServiceUnavailableException({
            code: AGENT_ERROR_CODES.modelReasoningOnly,
            detail: '模型完成了推理，但没有生成可显示的最终答案。',
          });
        }
        // 普通调查轮同样不能把纯空白结果当作成功交付。
        if (!roundContent.trim()) {
          throw new ServiceUnavailableException({
            code: AGENT_ERROR_CODES.modelEmptyResponse,
            detail: '模型没有返回可显示的文本，请稍后重试。',
          });
        }
        const finalAnswerWait = this.reachLifecycle(input, 'final_answer', {
          roundId,
          roundSequence: modelRounds,
          finishReason,
        });
        if (finalAnswerWait) await finalAnswerWait;
        finalContent = visibleContent;
        const finalMessage: ModelMessage = {
          role: 'assistant',
          content: roundContent,
          ...(textPhase === 'commentary' || textPhase === 'final_answer'
            ? { phase: textPhase }
            : {}),
          ...(reasoningDeltas.length ? { reasoning: reasoningDeltas.join('') } : {}),
        };
        messages.push(finalMessage);
        yield { type: 'transcript.item', message: finalMessage };
        break;
      }
      // 正常情况下最终回答阶段不会收到 Tool Call；该分支是最后一道防御性保护。
      if (finalResponseOnly) {
        throw new ServiceUnavailableException({
          code: AGENT_ERROR_CODES.toolCallLimitExceeded,
          detail: '工具调用已达到本轮上限，模型仍未生成最终回答。',
        });
      }

      // 先追加包含完整 Tool Calls 的 assistant message，后续必须为每个调用补齐 tool message。
      const assistantToolCallMessage: ModelMessage = {
        role: 'assistant',
        content: textDeltas.join('') || null,
        ...(textPhase === 'commentary' || textPhase === 'final_answer' ? { phase: textPhase } : {}),
        ...(reasoningDeltas.length ? { reasoning: reasoningDeltas.join('') } : {}),
        toolCalls: normalizedCalls,
      };
      messages.push(assistantToolCallMessage);
      yield { type: 'transcript.item', message: assistantToolCallMessage };

      // 同一 Round 可能包含多个 Tool Call。工具按声明顺序执行，但结果先暂存在内存中，
      // 批次完成后统一按 Context Engineering 预算裁剪，再写入下一轮上下文。
      const pendingToolResults: Array<{
        candidate: ToolResultCandidate;
        event?: AgentRuntimeEvent;
        controlOutcome?: 'approved_by_user' | 'rejected_by_user' | 'rejected_by_policy';
        enterFinalAnswer: boolean;
        summary: RuntimeToolResultSummary;
      }> = [];
      type PreparedDispatch = Readonly<
        | {
            status: 'ready';
            call: RuntimeLifecycleToolCall;
            input: unknown;
            enterFinalAnswer: boolean;
          }
        | {
            status: 'rejected';
            call: RuntimeLifecycleToolCall;
            error: Readonly<{ code: string; detail: string; retryable: false }>;
            enterFinalAnswer: boolean;
          }
      >;
      const dispatchPlan: PreparedDispatch[] = [];

      // Dispatch Plan 在任何工具开始前一次性完成，供生命周期策略安全审查。
      for (const call of normalizedCalls) {
        // 计划工具是控制工具，不占用 Business Tool 调用配额。
        if (
          call.name !== AGENT_TOOL_NAMES.updatePlan &&
          toolCallCount >= DEFAULT_RUNTIME_POLICY.maxToolCalls
        ) {
          dispatchPlan.push({
            status: 'rejected',
            call,
            error: {
              code: AGENT_ERROR_CODES.toolCallLimitExceeded,
              detail: '工具调用已达到当前 assistant run 的次数上限。',
              retryable: false,
            },
            enterFinalAnswer: true,
          });
          this.logger.warn(
            `工具调用已达到上限 | 会话=${shortLogId(input.sessionId)} | 上限=${DEFAULT_RUNTIME_POLICY.maxToolCalls} 次`,
            AgentRuntimeService.name,
          );
          continue;
        }
        if (call.name !== AGENT_TOOL_NAMES.updatePlan) toolCallCount += 1;

        let toolInput: unknown;
        try {
          // update_plan 使用独立 Handler；其他调用必须经过 Business Tool Schema。
          if (call.name === AGENT_TOOL_NAMES.updatePlan) {
            const result = this.planHandler.handle(call.arguments);
            if (!result.ok) throw new Error(result.code);
            this.logger.log(
              `计划校验成功 | 调用=${shortLogId(call.id)} | 步骤=${result.snapshot.plan.length}`,
              AgentRuntimeService.name,
            );
            toolInput = result.snapshot;
          } else toolInput = this.tools.parseInput(call.name, call.arguments, toolRegistryContext);
        } catch (error) {
          const code = this.toolValidationCode(error);
          const detail =
            error instanceof ToolInputValidationError
              ? error.detail
              : '工具参数无法通过 Schema 校验。';
          dispatchPlan.push({
            status: 'rejected',
            call,
            error: {
              code,
              detail,
              retryable: false,
            },
            enterFinalAnswer: toolCallCount >= DEFAULT_RUNTIME_POLICY.maxToolCalls,
          });
          this.logger.warn(
            `工具参数无效 | 会话=${shortLogId(input.sessionId)} | 调用=${shortLogId(call.id)} | 工具=${call.name} | 错误码=${code} | 原因=${detail}`,
            AgentRuntimeService.name,
          );
          continue;
        }

        dispatchPlan.push({
          status: 'ready',
          call,
          input: toolInput,
          enterFinalAnswer: toolCallCount >= DEFAULT_RUNTIME_POLICY.maxToolCalls,
        });
      }

      const dispatchReadyWait = this.reachLifecycle(input, 'tool_dispatch_ready', {
        roundId,
        roundSequence: modelRounds,
        dispatchPlan: dispatchPlan.map<RuntimeToolDispatchItem>((item) =>
          item.status === 'ready'
            ? { status: 'ready', call: item.call, input: item.input }
            : { status: 'rejected', call: item.call, error: item.error },
        ),
      });
      if (dispatchReadyWait) await dispatchReadyWait;
      this.assertRunActive(input.signal, runDeadlineSignal);

      const bashApprovalPermission = new Map<string, 'network' | 'install'>();
      const approvalItems = dispatchPlan
        .filter(
          (item): item is Extract<PreparedDispatch, { status: 'ready' }> => item.status === 'ready',
        )
        .filter((item) => item.call.name !== AGENT_TOOL_NAMES.updatePlan)
        .flatMap((item) => {
          const resolved = this.tools.resolveName(item.call.name);
          if (resolved === AGENT_TOOL_NAMES.bash) {
            const bashInput = item.input as BashInput;
            const policyClass = this.bashPolicy.classify(bashInput);
            if (!policyClass) return [];
            bashApprovalPermission.set(item.call.id, policyClass);
            const base = hashBashApprovalBase(bashInput);
            return [
              {
                itemId: `${roundId}:${item.call.id}:${policyClass}`,
                toolCallId: item.call.id,
                toolName: item.call.name,
                input: toBashInputSummary(bashInput, policyClass),
                argumentsHash: createHash('sha256')
                  .update(`${base}:${policyClass}`)
                  .digest('hex'),
              },
            ];
          }
          if (this.approvalPolicy(item.call.name, toolRegistryContext) !== 'require_approval')
            return [];
          return [
            {
              itemId: `${roundId}:${item.call.id}`,
              toolCallId: item.call.id,
              toolName: item.call.name,
              input: item.input,
              argumentsHash: this.hashCanonical(item.call.name, item.input),
            },
          ];
        });
      let approvalDecisions = new Map<string, 'approve' | 'reject'>();
      if (approvalItems.length) {
        if (!input.lifecycle)
          throw new ServiceUnavailableException({
            code: 'HITL_RUNTIME_REQUIRED',
            detail: '工具审批缺少 Runtime 控制器。',
          });
        const approvalResult = await input.lifecycle.createToolApproval({
          roundId,
          roundSequence: modelRounds,
          items: approvalItems,
        });
        if (approvalResult.kind !== 'tool_approval')
          throw new Error('INVALID_TOOL_APPROVAL_RESPONSE');
        approvalDecisions = new Map(
          approvalResult.decisions.map((decision) => [decision.toolCallId, decision.decision]),
        );
      }

      for (const dispatch of dispatchPlan) {
        const { call } = dispatch;
        // 参数校验或配额失败转成模型可见 Tool Result，不直接终止整个 Run。
        if (dispatch.status === 'rejected') {
          pendingToolResults.push({
            candidate: {
              toolCallId: call.id,
              toolName: call.name,
              content: this.serializeToolError(dispatch.error),
            },
            enterFinalAnswer: dispatch.enterFinalAnswer,
            summary: {
              toolCallId: call.id,
              toolName: call.name,
              status: 'rejected',
            },
          });
          continue;
        }

        const toolInput = dispatch.input;
        // 成功计划更新立即发布事件，但仍继续处理同一批后续调用。
        if (call.name === AGENT_TOOL_NAMES.updatePlan) {
          const plan = toolInput as PlanSnapshot;
          currentPlan = structuredClone(plan);
          this.logger.log(
            `计划事件发布 | 调用=${shortLogId(call.id)} | 轮次=${modelRounds}`,
            AgentRuntimeService.name,
          );
          yield {
            type: 'plan.updated',
            ...(plan.explanation ? { explanation: plan.explanation } : {}),
            plan: plan.plan,
            roundId,
            roundSequence: modelRounds,
            blockSequence: call.blockSequence,
          };
          pendingToolResults.push({
            candidate: {
              toolCallId: call.id,
              toolName: call.name,
              content: JSON.stringify({ status: 'updated' }),
            },
            enterFinalAnswer: false,
            summary: { toolCallId: call.id, toolName: call.name, status: 'succeeded' },
          });
          continue;
        }
        if (this.approvalPolicy(call.name, toolRegistryContext) === 'direct_reject') {
          pendingToolResults.push({
            candidate: {
              toolCallId: call.id,
              toolName: call.name,
              content: JSON.stringify({
                type: 'tool_control_outcome',
                toolCallId: call.id,
                executed: false,
                outcomeType: 'rejected_by_policy',
                retryable: false,
              }),
            },
            controlOutcome: 'rejected_by_policy',
            enterFinalAnswer: dispatch.enterFinalAnswer,
            summary: { toolCallId: call.id, toolName: call.name, status: 'rejected' },
          });
          continue;
        }
        if (approvalDecisions.get(call.id) === 'reject') {
          pendingToolResults.push({
            candidate: {
              toolCallId: call.id,
              toolName: call.name,
              content: JSON.stringify({
                type: 'tool_control_outcome',
                toolCallId: call.id,
                executed: false,
                outcomeType: 'rejected_by_user',
                retryable: false,
              }),
            },
            controlOutcome: 'rejected_by_user',
            enterFinalAnswer: dispatch.enterFinalAnswer,
            summary: { toolCallId: call.id, toolName: call.name, status: 'rejected' },
          });
          continue;
        }

        const startedAt = new Date();
        this.logger.log(
          `工具调用开始 | 会话=${shortLogId(input.sessionId)} | 调用=${shortLogId(call.id)} | 工具=${call.name}`,
          AgentRuntimeService.name,
        );
        const bashTerminalInput = this.bashTerminalInput(call.name, toolInput);
        yield {
          type: 'tool.started',
          toolCallId: call.id,
          toolName: call.name,
          input: this.publicToolInput(call.name, toolInput),
          ...(bashTerminalInput ? { bashTerminalInput } : {}),
          startedAt: startedAt.toISOString(),
          roundId,
          roundSequence: modelRounds,
          blockSequence: call.blockSequence,
        };
        let result: ToolExecutionResult<unknown>;
        try {
          const bashEgressBoost =
            approvalDecisions.get(call.id) === 'approve' && bashApprovalPermission.has(call.id);
          result = await this.executeTool(
            call.name,
            toolInput,
            {
              sessionId: input.sessionId,
              runId: input.runId,
              messageId: input.messageId,
              toolCallId: call.id,
              ...(bashEgressBoost ? { bashEgressBoost: true } : {}),
            },
            runSignal,
            toolRegistryContext,
          );
        } catch (error) {
          if (input.signal?.aborted) {
            const completedAt = new Date();
            const durationMs = completedAt.getTime() - startedAt.getTime();
            yield {
              type: 'tool.cancelled',
              toolCallId: call.id,
              toolName: call.name,
              input: this.publicToolInput(call.name, toolInput),
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
          this.assertRunActive(input.signal, runDeadlineSignal);
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
        let event: AgentRuntimeEvent;
        if (result.status === 'succeeded') {
          this.logger.log(
            `工具调用完成 | 会话=${shortLogId(input.sessionId)} | 调用=${shortLogId(call.id)} | 工具=${call.name} | 状态=成功${this.formatToolLogFields(result.logFields)} | 耗时=${formatLogDuration(durationMs)}`,
            AgentRuntimeService.name,
          );
          event = {
            type: 'tool.completed',
            toolCallId: call.id,
            toolName: call.name,
            input: this.publicToolInput(call.name, toolInput),
            ...(bashTerminalInput ? { bashTerminalInput } : {}),
            output: result.output,
            completedAt: completedAt.toISOString(),
            durationMs,
            roundId,
            roundSequence: modelRounds,
            blockSequence: call.blockSequence,
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
          event = {
            type: 'tool.cancelled',
            toolCallId: call.id,
            toolName: call.name,
            input: this.publicToolInput(call.name, toolInput),
            ...(bashTerminalInput ? { bashTerminalInput } : {}),
            completedAt: completedAt.toISOString(),
            durationMs,
            code: result.error.code,
            detail: result.error.detail,
            roundId,
            roundSequence: modelRounds,
            blockSequence: call.blockSequence,
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
          event = {
            type: 'tool.failed',
            toolCallId: call.id,
            toolName: call.name,
            input: this.publicToolInput(call.name, toolInput),
            ...(bashTerminalInput ? { bashTerminalInput } : {}),
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
        this.assertRunActive(input.signal, runDeadlineSignal);
        pendingToolResults.push({
          candidate: {
            toolCallId: call.id,
            toolName: call.name,
            content:
              result.status === 'succeeded'
                ? this.serializeToolSuccess(call.name, result.output)
                : this.serializeToolError(result.error),
            ...(this.isFileTool(call.name) ? { truncatable: false } : {}),
          },
          event,
          ...(approvalDecisions.get(call.id) === 'approve'
            ? { controlOutcome: 'approved_by_user' as const }
            : {}),
          enterFinalAnswer: dispatch.enterFinalAnswer,
          summary: {
            toolCallId: call.id,
            toolName: call.name,
            status: this.toolResultStatus(result.status),
          },
        });
      }

      // Tool Result 会进入下一轮已编译 Context，而不是重新带回已被 summary 覆盖的原始历史。
      // compileRound 未改写数组时，messages 已包含当前 Tool Call；改写后需显式补到编译结果末尾。
      const toolResultBudgetMessages =
        roundMessages === messages
          ? messages
          : [...roundMessages, structuredClone(assistantToolCallMessage)];
      const trimmedToolResults = this.context
        ? await this.context.trimToolResults(
            toolResultBudgetMessages,
            definitions,
            pendingToolResults.map(({ candidate }) => candidate),
            input.model,
            input.sessionId,
          )
        : pendingToolResults.map(({ candidate }) => ({
            ...candidate,
            originalTokens: 0,
            retainedTokens: 0,
            truncated: false,
          }));
      for (const [index, trimmed] of trimmedToolResults.entries()) {
        const pending = pendingToolResults[index]!;
        if (pending.event) yield pending.event;
        messages.push({
          role: 'tool',
          toolCallId: trimmed.toolCallId,
          content: trimmed.content,
          ...(pending.controlOutcome ? { controlOutcome: pending.controlOutcome } : {}),
        });
        yield { type: 'transcript.item', message: messages.at(-1)! };
        if (pending.enterFinalAnswer) enterFinalAnswer();
      }
      // 下一轮上下文只保留最新计划，删除旧标记后再追加当前快照。
      if (currentPlan) {
        const marker = '当前计划（只读）：';
        for (let index = messages.length - 1; index >= 0; index -= 1) {
          const message = messages[index];
          if (message?.role === 'system' && message.content.startsWith(marker))
            messages.splice(index, 1);
        }
        messages.push({
          role: 'system',
          content: `${marker}\n${currentPlan.plan.map((step, index) => `${index + 1}. ${step.step} - ${step.status}`).join('\n')}`,
        });
      }
      // assistant Tool Calls 与全部 Tool Messages 已由消费者按顺序提交，之后才允许控制策略等待。
      const batchCommittedWait = this.reachLifecycle(input, 'tool_batch_committed', {
        roundId,
        roundSequence: modelRounds,
        results: pendingToolResults.map(({ summary }) => summary),
        nextAction: finalResponseOnly ? 'final_answer' : 'model_request',
      });
      if (batchCommittedWait) await batchCommittedWait;
      this.assertRunActive(input.signal, runDeadlineSignal);
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
    yield {
      type: 'run.completed',
      content: finalContent,
      toolCallCount,
      ...(compactionState ? { compactionState } : {}),
    };
  }

  private reachLifecycle<Boundary extends RuntimeLifecycleBoundary>(
    input: AgentRuntimeInput,
    boundary: Boundary,
    context: RuntimeLifecycleContextMap[Boundary],
  ): Promise<void> | undefined {
    const wait = input.lifecycle?.reach(boundary, context);
    const state = input.lifecycle?.snapshot();
    this.logger.log(
      `Runtime 生命周期边界 | 会话=${shortLogId(input.sessionId)} | Run=${shortLogId(input.runId ?? 'unknown')} | Boundary=${boundary} | 轮次=${this.lifecycleRoundSequence(context)} | 状态=${state?.state ?? 'none'} | 阶段=${state?.phase ?? 'none'}`,
      AgentRuntimeService.name,
    );
    if (!wait) return;
    return wait.then(() => {
      const resumed = input.lifecycle?.snapshot();
      this.logger.log(
        `Runtime 生命周期等待结束 | 会话=${shortLogId(input.sessionId)} | Run=${shortLogId(input.runId ?? 'unknown')} | Boundary=${boundary} | 轮次=${this.lifecycleRoundSequence(context)} | 状态=${resumed?.state ?? 'none'} | 阶段=${resumed?.phase ?? 'none'}`,
        AgentRuntimeService.name,
      );
    });
  }

  private lifecycleRoundSequence(
    context: RuntimeLifecycleContextMap[RuntimeLifecycleBoundary],
  ): string {
    return 'roundSequence' in context ? String(context.roundSequence) : '-';
  }

  private hashCanonical(toolName: string, input: unknown): string {
    const ordered = JSON.stringify(input, (_key, value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
      return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
    });
    return createHash('sha256').update(`${toolName}:${ordered}`).digest('hex');
  }

  private approvalPolicy(
    toolName: string,
    ctx?: ToolRegistryContext,
  ): 'auto_execute' | 'require_approval' | 'direct_reject' {
    return this.tools.approvalPolicy(toolName, ctx);
  }

  private isFileTool(toolName: string): boolean {
    return toolName === AGENT_TOOL_NAMES.searchFile || toolName === AGENT_TOOL_NAMES.readFileLines;
  }

  // create_file 的正文只进入工具执行，不进入 SSE、快照、日志或历史 metadata。
  private bashTerminalInput(toolName: string, input: unknown): BashTerminalCommandInput | undefined {
    const resolved = this.tools.resolveName(toolName);
    if (resolved !== AGENT_TOOL_NAMES.bash) return undefined;
    const parsed = bashInputSchema.safeParse(input);
    return parsed.success ? toBashTerminalCommandInput(parsed.data) : undefined;
  }

  private publicToolInput(toolName: string, input: unknown): unknown {
    const resolved = this.tools.resolveName(toolName);
    if (resolved === AGENT_TOOL_NAMES.bash && typeof input === 'object' && input !== null) {
      const parsed = bashInputSchema.safeParse(input);
      return parsed.success ? toBashInputSummary(parsed.data) : input;
    }
    if (
      (toolName !== AGENT_TOOL_NAMES.createFile && toolName !== AGENT_TOOL_NAMES.createReport) ||
      typeof input !== 'object' ||
      input === null
    )
      return input;
    const value = input as { fileName?: unknown; content?: unknown; sheets?: unknown };
    const content = typeof value.content === 'string' ? value.content : '';
    const base = {
      fileName: typeof value.fileName === 'string' ? value.fileName : '',
      contentCharacterCount: [...content].length,
      contentByteCount: Buffer.byteLength(content, 'utf8'),
    };
    if (toolName === AGENT_TOOL_NAMES.createReport) {
      const report = input as {
        title?: unknown;
        summary?: unknown;
        sourceIds?: unknown;
        fileIds?: unknown;
      };
      return {
        ...base,
        title: report.title,
        summary: report.summary,
        sourceIds: report.sourceIds,
        fileIds: report.fileIds,
      };
    }
    if (Array.isArray(value.sheets)) {
      const rows = value.sheets.flatMap((sheet) =>
        typeof sheet === 'object' &&
        sheet !== null &&
        Array.isArray((sheet as { rows?: unknown }).rows)
          ? (sheet as { rows: unknown[] }).rows
          : [],
      );
      return {
        inputType: 'workbook',
        fileName: base.fileName,
        sheetCount: value.sheets.length,
        totalRowCount: rows.length,
        totalCellCount: rows.reduce<number>(
          (total, row) => total + (Array.isArray(row) ? row.length : 0),
          0,
        ),
      };
    }
    return { inputType: 'document', ...base };
  }

  private clarificationRequestContent(
    request: import('@harness/agent-protocol').ClarificationRequest,
  ): string {
    const options = request.options.length
      ? `\n可选项：\n${request.options.map((option) => `- ${option}`).join('\n')}`
      : '';
    return `我需要用户补充信息后才能继续：${request.question}${options}`;
  }

  // 将客户端取消信号与单次模型请求的超时信号合并。
  private roundSignal(external: AbortSignal | undefined, timeoutMs: number): AbortSignal {
    const timeout = AbortSignal.timeout(timeoutMs);
    return external ? AbortSignal.any([external, timeout]) : timeout;
  }

  private assertRunActive(
    externalSignal: AbortSignal | undefined,
    runDeadlineSignal: AbortSignal,
  ): void {
    if (externalSignal?.aborted) throw this.abortError();
    if (runDeadlineSignal.aborted)
      throw new ServiceUnavailableException({
        code: AGENT_ERROR_CODES.runDeadlineExceeded,
        detail: '本次任务已达到总执行时间上限。',
      });
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
    registryContext?: ToolRegistryContext,
  ): Promise<ToolExecutionResult<unknown>> {
    const timeoutMs = this.tools.executionPolicy(name, registryContext).timeoutMs;
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
    const execution = this.tools.execute(name, input, { ...context, signal }, registryContext);
    try {
      return await Promise.race([execution, boundary]);
    } catch (error) {
      timeoutController.abort();
      const graceMs =
        this.tools.resolveName(name) === AGENT_TOOL_NAMES.bash
          ? sandboxLimits.cancellationGraceMs
          : 0;
      if (graceMs > 0) {
        const settled = await Promise.race([
          execution.then(
            (result) => result,
            () => undefined,
          ),
          new Promise<undefined>((resolve) => setTimeout(resolve, graceMs)),
        ]);
        if (settled) return settled;
      }
      throw error;
    } finally {
      if (timeout) clearTimeout(timeout);
      if (externalSignal && cancelListener)
        externalSignal.removeEventListener('abort', cancelListener);
    }
  }

  // 将成功结果包装为统一的不可信 Tool Message，避免具体 Tool 维护第二份模型内容。
  private serializeToolSuccess(toolName: string, output: unknown): string {
    const resolved = this.tools.resolveName(toolName);
    if (resolved === AGENT_TOOL_NAMES.bash) {
      const value = output as BashRunResult | { kind: 'background'; jobId: string };
      if (typeof value === 'object' && value !== null && 'kind' in value && value.kind === 'background') {
        return renderBashBackgroundResult(value);
      }
      return renderBashResult(output as BashRunResult);
    }
    if (
      resolved === AGENT_TOOL_NAMES.jobOutput ||
      resolved === AGENT_TOOL_NAMES.jobList ||
      resolved === AGENT_TOOL_NAMES.jobKill
    ) {
      return typeof output === 'string' ? output : String(output);
    }
    return JSON.stringify({ ok: true, untrustedToolData: true, output });
  }

  // 将安全错误字段序列化给模型，排除 cause 和服务端日志字段。
  private serializeToolError(error: { code: string; detail: string; retryable: boolean }): string {
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

  private toolValidationCode(error: unknown): string {
    if (error instanceof ToolInputValidationError) return error.code;
    if (error instanceof Error) return error.message;
    return AGENT_ERROR_CODES.invalidToolArguments;
  }

  private toolResultStatus(
    status: 'succeeded' | 'failed' | 'cancelled' | 'timeout',
  ): 'succeeded' | 'cancelled' | 'failed' {
    if (status === 'succeeded') return 'succeeded';
    if (status === 'cancelled') return 'cancelled';
    return 'failed';
  }
}

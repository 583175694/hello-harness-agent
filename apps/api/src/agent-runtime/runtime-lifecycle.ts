import { ConflictException, Injectable } from '@nestjs/common';
import type {
  ClarificationRequest,
  InterruptSnapshot,
  PendingInterruptSnapshot,
  ToolApprovalDecision,
} from '@harness/agent-protocol';

export type RuntimeControlState =
  | 'running'
  | 'pause_requested'
  | 'paused'
  | 'resuming'
  | 'waiting_for_user'
  | 'completed'
  | 'cancel_requested'
  | 'cancelled'
  | 'failed';

export type RuntimePhase = 'tool_loop' | 'final_answer' | 'terminal';

export type RuntimeControlSnapshot = {
  runId: string;
  state: RuntimeControlState;
  phase: RuntimePhase;
  activeInterrupt?: PendingInterruptSnapshot;
};

export type RuntimeInterruptResolution =
  | { kind: 'clarification'; answer: string }
  | { kind: 'tool_approval'; decisions: readonly ToolApprovalDecision[] };
export type RuntimeInterruptResult =
  | { kind: 'clarification'; answer: string }
  | { kind: 'tool_approval'; decisions: readonly ToolApprovalDecision[] };

export type RuntimeLifecycleBoundary =
  | 'before_model_request'
  | 'model_round_classified'
  | 'tool_dispatch_ready'
  | 'tool_batch_committed'
  | 'final_answer'
  | 'terminal';

export type RuntimeLifecycleToolCall = Readonly<{
  id: string;
  name: string;
  arguments: string;
  blockSequence: number;
  providerIndex: number;
}>;

export type RuntimeToolDispatchItem = Readonly<
  | {
      status: 'ready';
      call: RuntimeLifecycleToolCall;
      input: unknown;
    }
  | {
      status: 'rejected';
      call: RuntimeLifecycleToolCall;
      error: Readonly<{ code: string; detail: string }>;
    }
>;

export type RuntimeToolResultSummary = Readonly<{
  toolCallId: string;
  toolName: string;
  status: 'succeeded' | 'failed' | 'cancelled' | 'rejected';
}>;

export type RuntimeLifecycleContextMap = {
  before_model_request: Readonly<{
    roundSequence: number;
    finalResponseOnly: boolean;
  }>;
  model_round_classified: Readonly<{
    roundId: string;
    roundSequence: number;
    finishReason: string | null;
    outcome: 'tool_calls' | 'final_answer';
    toolCalls: readonly RuntimeLifecycleToolCall[];
    clarification?: ClarificationRequest;
  }>;
  tool_dispatch_ready: Readonly<{
    roundId: string;
    roundSequence: number;
    dispatchPlan: readonly RuntimeToolDispatchItem[];
  }>;
  tool_batch_committed: Readonly<{
    roundId: string;
    roundSequence: number;
    results: readonly RuntimeToolResultSummary[];
    nextAction: 'model_request' | 'final_answer';
  }>;
  final_answer: Readonly<{
    roundId: string;
    roundSequence: number;
    finishReason: string | null;
  }>;
  terminal: Readonly<{
    status: 'completed' | 'cancelled' | 'failed';
  }>;
};

export type RuntimeLifecycleEvent<
  Boundary extends RuntimeLifecycleBoundary = RuntimeLifecycleBoundary,
> = {
  [Key in Boundary]: Readonly<{
    boundary: Key;
    context: RuntimeLifecycleContextMap[Key];
  }>;
}[Boundary];

type StateListener = (snapshot: RuntimeControlSnapshot) => void;
type InterruptListener = (
  type: 'created' | 'resolved' | 'cancelled',
  interrupt: InterruptSnapshot,
  snapshot: RuntimeControlSnapshot,
) => void;

export interface RuntimeLifecycleHook {
  onBoundary(event: RuntimeLifecycleEvent): Promise<void> | undefined;
}

/** Pause is a policy attached only to transcript-safe lifecycle boundaries. */
class RuntimePauseLifecycleHook implements RuntimeLifecycleHook {
  constructor(private readonly waitForPause: () => Promise<void> | undefined) {}

  onBoundary(event: RuntimeLifecycleEvent): Promise<void> | undefined {
    if (event.boundary !== 'before_model_request' && event.boundary !== 'tool_batch_committed')
      return;
    return this.waitForPause();
  }
}

/**
 * Per-run owner of lifecycle control. Runtime reports typed boundaries here;
 * policies may wait, but may never execute model/tool work or mutate transcript.
 */
export class RuntimeLifecycleController {
  private state: RuntimeControlState = 'running';
  private phase: RuntimePhase = 'tool_loop';
  private boundary?: RuntimeLifecycleBoundary;
  private resumeResolver?: () => void;
  private disposed = false;
  private activeInterrupt?: PendingInterruptSnapshot;
  private interruptResolver?: (result: RuntimeInterruptResult) => void;
  private interruptRejecter?: (error: Error) => void;
  private readonly hooks: readonly RuntimeLifecycleHook[];

  constructor(
    readonly runId: string,
    private readonly onChange?: StateListener,
    hooks: readonly RuntimeLifecycleHook[] = [],
    private readonly onInterrupt?: InterruptListener,
  ) {
    this.hooks = [new RuntimePauseLifecycleHook(() => this.waitForRequestedPause()), ...hooks];
  }

  snapshot(): RuntimeControlSnapshot {
    return {
      runId: this.runId,
      state: this.state,
      phase: this.phase,
      ...(this.activeInterrupt ? { activeInterrupt: this.activeInterrupt } : {}),
    };
  }

  interrupt(): PendingInterruptSnapshot | undefined {
    return this.activeInterrupt;
  }

  currentBoundary(): RuntimeLifecycleBoundary | undefined {
    return this.boundary;
  }

  reach<Boundary extends RuntimeLifecycleBoundary>(
    boundary: Boundary,
    context: RuntimeLifecycleContextMap[Boundary],
  ): Promise<void> | undefined {
    if (this.disposed) return;
    this.boundary = boundary;
    if (
      boundary === 'final_answer' ||
      (boundary === 'before_model_request' &&
        (context as RuntimeLifecycleContextMap['before_model_request']).finalResponseOnly) ||
      (boundary === 'tool_batch_committed' &&
        (context as RuntimeLifecycleContextMap['tool_batch_committed']).nextAction ===
          'final_answer')
    )
      this.setPhase('final_answer');
    else if (boundary === 'terminal') this.setPhase('terminal');
    else if (this.phase !== 'final_answer') this.setPhase('tool_loop');

    const event = { boundary, context } as RuntimeLifecycleEvent<Boundary>;
    return this.runHooks(event as unknown as RuntimeLifecycleEvent);
  }

  private runHooks(event: RuntimeLifecycleEvent): Promise<void> | undefined {
    let pending: Promise<void> | undefined;
    for (const hook of this.hooks) {
      if (pending) {
        pending = pending.then(() => hook.onBoundary(event));
        continue;
      }
      pending = hook.onBoundary(event);
    }
    return pending;
  }

  requestPause(): RuntimeControlSnapshot {
    if (this.disposed)
      throw new ConflictException({ code: 'RUNTIME_NOT_FOUND', detail: '运行已结束。' });
    if (this.phase === 'final_answer')
      throw new ConflictException({
        code: 'RUN_FINAL_ANSWER_NOT_PAUSABLE',
        detail: '运行已进入最终回答阶段，无法暂停。',
      });
    if (this.phase === 'terminal' || ['completed', 'cancelled', 'failed'].includes(this.state))
      throw new ConflictException({ code: 'RUN_NOT_ACTIVE', detail: '运行已结束。' });
    if (this.state === 'paused' || this.state === 'pause_requested')
      throw new ConflictException({ code: 'RUN_ALREADY_PAUSED', detail: '运行已经在暂停流程中。' });
    if (this.state === 'cancel_requested')
      throw new ConflictException({
        code: 'RUN_CANCEL_REQUESTED',
        detail: '运行正在取消，无法暂停。',
      });
    this.state = 'pause_requested';
    this.emit();
    return this.snapshot();
  }

  resume(): RuntimeControlSnapshot {
    if (this.disposed)
      throw new ConflictException({ code: 'RUNTIME_NOT_FOUND', detail: '运行已结束。' });
    if (this.state !== 'paused')
      throw new ConflictException({ code: 'RUN_NOT_PAUSED', detail: '运行当前不在暂停状态。' });
    this.state = 'resuming';
    this.emit();
    this.resumeResolver?.();
    this.resumeResolver = undefined;
    return this.snapshot();
  }

  requestCancel(): void {
    if (this.disposed) return;
    if (!['completed', 'cancelled', 'failed'].includes(this.state)) {
      this.state = 'cancel_requested';
      if (this.activeInterrupt) {
        const cancelled = this.activeInterrupt;
        this.interruptRejecter?.(new Error('RUNTIME_CANCELLED'));
        this.interruptResolver = undefined;
        this.interruptRejecter = undefined;
        this.activeInterrupt = undefined;
        this.onInterrupt?.('cancelled', { ...cancelled, status: 'cancelled' }, this.snapshot());
      }
      this.resumeResolver?.();
      this.resumeResolver = undefined;
      this.emit();
    }
  }

  markTerminal(status: 'completed' | 'cancelled' | 'failed'): void {
    if (this.disposed) return;
    this.boundary = 'terminal';
    this.phase = 'terminal';
    this.state = status;
    this.resumeResolver?.();
    this.resumeResolver = undefined;
    this.emit();
    // Terminal is observational only: the durable terminal transaction has
    // already committed and no lifecycle hook may delay or overturn it.
    try {
      const pending = this.runHooks({ boundary: 'terminal', context: { status } });
      if (pending) void pending.catch(() => undefined);
    } catch {
      // Deliberately ignored after the durable terminal state is committed.
    }
  }

  dispose(): void {
    this.disposed = true;
    this.resumeResolver?.();
    this.resumeResolver = undefined;
    this.interruptRejecter?.(new Error('RUNTIME_DISPOSED'));
    this.interruptResolver = undefined;
    this.interruptRejecter = undefined;
    this.activeInterrupt = undefined;
  }

  createClarification(
    context: RuntimeLifecycleContextMap['model_round_classified'],
  ): Promise<RuntimeInterruptResult> {
    if (!context.clarification)
      throw new ConflictException({ code: 'INVALID_CLARIFICATION', detail: '澄清请求为空。' });
    if (this.activeInterrupt)
      throw new ConflictException({ code: 'RUN_INTERRUPT_PENDING', detail: '运行已有待处理的用户请求。' });
    const interrupt: PendingInterruptSnapshot = {
      interruptId: crypto.randomUUID(),
      runId: this.runId,
      kind: 'clarification',
      status: 'pending',
      createdAt: new Date().toISOString(),
      roundId: context.roundId,
      roundSequence: context.roundSequence,
      payload: context.clarification,
    };
    this.activeInterrupt = interrupt;
    this.state = 'waiting_for_user';
    this.onInterrupt?.('created', interrupt, this.snapshot());
    this.emit();
    return new Promise<RuntimeInterruptResult>((resolve, reject) => {
      this.interruptResolver = resolve;
      this.interruptRejecter = reject;
    }).then((result) => {
      if (this.state === 'resuming') {
        this.state = 'running';
        this.emit();
      }
      return result;
    });
  }

  createToolApproval(input: {
    roundId: string;
    roundSequence: number;
    items: ReadonlyArray<{
      itemId: string;
      toolCallId: string;
      toolName: string;
      input: unknown;
      argumentsHash: string;
    }>;
  }): Promise<RuntimeInterruptResult> {
    if (this.activeInterrupt)
      throw new ConflictException({ code: 'RUN_INTERRUPT_PENDING', detail: '运行已有待处理的用户请求。' });
    const interrupt: PendingInterruptSnapshot = {
      interruptId: crypto.randomUUID(),
      runId: this.runId,
      kind: 'tool_approval',
      status: 'pending',
      createdAt: new Date().toISOString(),
      roundId: input.roundId,
      roundSequence: input.roundSequence,
      payload: { items: input.items.map((item) => ({ ...item })) },
    };
    this.activeInterrupt = interrupt;
    this.state = 'waiting_for_user';
    this.onInterrupt?.('created', interrupt, this.snapshot());
    this.emit();
    return new Promise<RuntimeInterruptResult>((resolve, reject) => {
      this.interruptResolver = resolve;
      this.interruptRejecter = reject;
    }).then((result) => {
      if (this.state === 'resuming') {
        this.state = 'running';
        this.emit();
      }
      return result;
    });
  }

  respond(interruptId: string, answer: string): RuntimeControlSnapshot {
    const active = this.requireInterrupt(interruptId, 'clarification');
    const normalized = answer.trim();
    if (!normalized)
      throw new ConflictException({ code: 'CLARIFICATION_RESPONSE_INVALID', detail: '回答不能为空。' });
    if (!active.payload.allowFreeText && !active.payload.options.includes(normalized))
      throw new ConflictException({
        code: 'CLARIFICATION_RESPONSE_INVALID',
        detail: '回答必须选择当前澄清请求提供的选项。',
      });
    return this.resolveInterrupt({ kind: 'clarification', answer: normalized });
  }

  decideApproval(
    interruptId: string,
    decisions: readonly ToolApprovalDecision[],
  ): RuntimeControlSnapshot {
    const active = this.requireInterrupt(interruptId, 'tool_approval');
    const byItem = new Map(decisions.map((decision) => [decision.itemId, decision]));
    if (byItem.size !== decisions.length || decisions.length !== active.payload.items.length)
      throw new ConflictException({
        code: 'TOOL_APPROVAL_RESPONSE_INVALID',
        detail: '审批决定必须完整且不能包含重复项目。',
      });
    for (const item of active.payload.items) {
      const decision = byItem.get(item.itemId);
      if (
        !decision ||
        decision.toolCallId !== item.toolCallId ||
        decision.argumentsHash !== item.argumentsHash
      )
        throw new ConflictException({
          code: 'TOOL_APPROVAL_RESPONSE_INVALID',
          detail: '审批项目与当前待执行工具调用不匹配。',
        });
    }
    return this.resolveInterrupt({ kind: 'tool_approval', decisions: [...decisions] });
  }

  private requireInterrupt<Kind extends PendingInterruptSnapshot['kind']>(
    interruptId: string,
    kind: Kind,
  ): Extract<PendingInterruptSnapshot, { kind: Kind }> {
    const active = this.activeInterrupt;
    if (!active || active.interruptId !== interruptId)
      throw new ConflictException({ code: 'INTERRUPT_NOT_FOUND', detail: '待处理请求不存在或已结束。' });
    if (active.kind !== kind)
      throw new ConflictException({ code: 'INTERRUPT_RESPONSE_INVALID', detail: '响应类型与待处理请求不匹配。' });
    return active as Extract<PendingInterruptSnapshot, { kind: Kind }>;
  }

  private resolveInterrupt(result: RuntimeInterruptResult): RuntimeControlSnapshot {
    const resolved = this.activeInterrupt;
    if (!resolved)
      throw new ConflictException({ code: 'INTERRUPT_NOT_FOUND', detail: '待处理请求不存在或已结束。' });
    this.activeInterrupt = undefined;
    this.state = 'resuming';
    this.onInterrupt?.('resolved', { ...resolved, status: 'resolved' }, this.snapshot());
    this.emit();
    this.interruptResolver?.(result);
    this.interruptResolver = undefined;
    this.interruptRejecter = undefined;
    return this.snapshot();
  }

  private setPhase(phase: RuntimePhase): void {
    if (this.phase === phase) return;
    this.phase = phase;
    this.emit();
  }

  private waitForRequestedPause(): Promise<void> | undefined {
    // The no-op path must remain synchronous so a pause cannot slip between
    // this boundary and the next model request through a resolved Promise.
    if (this.disposed || this.phase === 'final_answer' || this.state !== 'pause_requested') return;
    this.state = 'paused';
    this.emit();
    const wait = new Promise<void>((resolve) => {
      this.resumeResolver = resolve;
      if (this.state === 'resuming' || this.state === 'cancel_requested') {
        this.resumeResolver = undefined;
        resolve();
      }
    });
    return wait.then(() => {
      if (this.state === 'resuming') {
        this.state = 'running';
        this.emit();
      }
    });
  }

  private emit(): void {
    this.onChange?.(this.snapshot());
  }
}

@Injectable()
export class RuntimeLifecycleRegistry {
  private readonly controllers = new Map<string, RuntimeLifecycleController>();

  create(
    runId: string,
    onChange?: StateListener,
    onInterrupt?: InterruptListener,
  ): RuntimeLifecycleController {
    const existing = this.controllers.get(runId);
    if (existing) return existing;
    const controller = new RuntimeLifecycleController(runId, onChange, [], onInterrupt);
    this.controllers.set(runId, controller);
    return controller;
  }

  get(runId: string): RuntimeLifecycleController | undefined {
    return this.controllers.get(runId);
  }

  dispose(runId: string): void {
    this.controllers.get(runId)?.dispose();
    this.controllers.delete(runId);
  }
}

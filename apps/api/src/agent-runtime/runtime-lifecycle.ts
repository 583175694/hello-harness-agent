import { ConflictException, Injectable } from '@nestjs/common';

export type RuntimeControlState =
  | 'running'
  | 'pause_requested'
  | 'paused'
  | 'resuming'
  | 'completed'
  | 'cancel_requested'
  | 'cancelled'
  | 'failed';

export type RuntimePhase = 'tool_loop' | 'final_answer' | 'terminal';

export type RuntimeControlSnapshot = {
  runId: string;
  state: RuntimeControlState;
  phase: RuntimePhase;
};

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
  private readonly hooks: readonly RuntimeLifecycleHook[];

  constructor(
    readonly runId: string,
    private readonly onChange?: StateListener,
    hooks: readonly RuntimeLifecycleHook[] = [],
  ) {
    this.hooks = [new RuntimePauseLifecycleHook(() => this.waitForRequestedPause()), ...hooks];
  }

  snapshot(): RuntimeControlSnapshot {
    return { runId: this.runId, state: this.state, phase: this.phase };
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

  create(runId: string, onChange?: StateListener): RuntimeLifecycleController {
    const existing = this.controllers.get(runId);
    if (existing) return existing;
    const controller = new RuntimeLifecycleController(runId, onChange);
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

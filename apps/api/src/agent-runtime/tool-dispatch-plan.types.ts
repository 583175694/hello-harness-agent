import type { RuntimeLifecycleToolCall } from './runtime-lifecycle';

export type PreparedToolDispatch = Readonly<
  | {
      status: 'ready';
      call: RuntimeLifecycleToolCall;
      input: unknown;
      enterFinalAnswer: boolean;
    }
  | {
      status: 'ready';
      call: RuntimeLifecycleToolCall;
      enterFinalAnswer: boolean;
      mcpArgumentsPending: true;
    }
  | {
      status: 'rejected';
      call: RuntimeLifecycleToolCall;
      error: Readonly<{ code: string; detail: string; retryable: boolean }>;
      enterFinalAnswer: boolean;
    }
>;

export function isReadyDispatch(
  item: PreparedToolDispatch,
): item is Extract<PreparedToolDispatch, { status: 'ready' }> {
  return item.status === 'ready';
}

export function readyDispatchInput(
  item: Extract<PreparedToolDispatch, { status: 'ready' }>,
): unknown | undefined {
  if (!('input' in item)) return undefined;
  return item.input;
}

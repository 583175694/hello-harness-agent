import { Inject, Injectable } from '@nestjs/common';
import { protocolVersion } from '@harness/agent-protocol';
import type {
  InterruptSnapshot,
  PendingInterruptSnapshot,
  RunSnapshot,
  RunStreamEvent,
} from '@harness/agent-protocol';
import { ActiveRunRegistry } from './active-run.registry';
import type { RunSubscriber } from './run.types';

const MAX_SUBSCRIBER_QUEUE = 256;

function pendingInterrupt(interrupt: InterruptSnapshot): PendingInterruptSnapshot | undefined {
  return interrupt.status === 'pending' ? (interrupt as PendingInterruptSnapshot) : undefined;
}

@Injectable()
export class RunEventHub {
  constructor(@Inject(ActiveRunRegistry) private readonly registry: ActiveRunRegistry) {}

  // 提交普通事件并立即广播给当前订阅者。
  // 普通事件可以提交后立即广播；Terminal Event 必须由 Executor 显式拆分 commit/broadcast。
  publish(runId: string, type: RunStreamEvent['type'], payload: RunStreamEvent['payload']) {
    const event = this.commit(runId, type, payload);
    if (event) this.broadcast(runId, event);
    return event;
  }

  // 为事件分配序号、更新 Live Snapshot，并保存到未压缩 Tail。
  // 原子推进 Event、Live Sequence、Live Snapshot 和 Tail，但不向客户端交付。
  // 这个边界让 Terminal 流程能够先持久化精确版本，成功后再广播。
  commit(runId: string, type: RunStreamEvent['type'], payload: RunStreamEvent['payload']) {
    const run = this.registry.get(runId);
    if (!run) return undefined;
    const event: RunStreamEvent = {
      version: protocolVersion,
      eventId: crypto.randomUUID(),
      seq: run.nextSequence++,
      sessionId: run.sessionId,
      runId,
      type,
      occurredAt: new Date().toISOString(),
      payload,
    };
    if (type === 'run.snapshot') run.liveSnapshot = structuredClone(payload as RunSnapshot);
    else run.liveSnapshot = this.reduceSnapshot(run.liveSnapshot, event);
    run.liveSequence = event.seq;
    const bytes = Buffer.byteLength(JSON.stringify(event));
    run.tailEvents.push(event);
    run.tailBytes += bytes;
    return event;
  }

  // 把已经提交的事件放入每个订阅者的独立队列。
  // 将已经提交的事件分发给当前观察者，不再修改任何 Run 状态。
  broadcast(runId: string, event: RunStreamEvent): void {
    const run = this.registry.get(runId);
    if (!run) return;
    for (const subscriber of run.subscribers) this.enqueue(subscriber, event);
  }

  // 终态持久化失败时撤销尚未广播的内存事件。
  // 仅用于尚未广播的最新 Terminal Event。CAS 失败时恢复前一 Live Snapshot 和序号分配器。
  rollback(runId: string, event: RunStreamEvent, snapshot: RunSnapshot): void {
    const run = this.registry.get(runId);
    if (!run || run.liveSequence !== event.seq) return;
    run.liveSnapshot = structuredClone(snapshot);
    run.liveSequence = snapshot.lastEventSequence;
    run.nextSequence = event.seq;
    const index = run.tailEvents.findIndex((candidate) => candidate.eventId === event.eventId);
    if (index >= 0) {
      const [removed] = run.tailEvents.splice(index, 1);
      if (removed) run.tailBytes -= Buffer.byteLength(JSON.stringify(removed));
    }
  }

  // 用数据库 Snapshot 覆盖当前内存状态，处理执行权竞争。
  // 当 Executor 无法取得 queued -> running 所有权时，用数据库事实覆盖内存初始状态。
  updateSnapshot(runId: string, snapshot: RunSnapshot): void {
    const run = this.registry.get(runId);
    if (run) {
      run.liveSnapshot = structuredClone(snapshot);
      run.liveSequence = snapshot.lastEventSequence;
    }
  }

  // 数据库确认 Checkpoint 后推进 Durable 水位并压缩已覆盖的 Tail。
  // 数据库确认同版本 Snapshot 后推进 Durable 水位，并只压缩已被该版本覆盖的 Tail。
  // 写库期间产生的更高序号事件必须继续保留，不能按“最近 N 条”静默淘汰。
  checkpointCommitted(runId: string, snapshot: RunSnapshot, draftVersion: number): void {
    const run = this.registry.get(runId);
    if (!run || snapshot.lastEventSequence < run.durableCheckpoint.sequence) return;
    run.durableCheckpoint = {
      sequence: snapshot.lastEventSequence,
      draftVersion,
      snapshot: structuredClone(snapshot),
    };
    const retained = run.tailEvents.filter((event) => event.seq > snapshot.lastEventSequence);
    run.tailEvents = retained;
    run.tailBytes = retained.reduce(
      (total, event) => total + Buffer.byteLength(JSON.stringify(event)),
      0,
    );
  }

  // 注册 SSE 订阅，并准备 Tail replay 或完整 Snapshot fallback。
  // 注册 Subscriber 与准备首批恢复数据在同一个同步调用栈完成，避免 replay/live 空窗。
  // cursor 连续时精确 replay Tail；缺失、过旧或越过 Live 时发送完整 Live Snapshot。
  subscribe(runId: string, cursor?: number): AsyncIterable<RunStreamEvent> | undefined {
    const run = this.registry.get(runId);
    if (!run) return undefined;
    const subscriber: RunSubscriber = { queue: [], closed: false };
    run.subscribers.add(subscriber);
    const firstBuffered = run.tailEvents[0]?.seq;
    const terminal = ['completed', 'failed', 'cancelled'].includes(run.liveSnapshot.status);
    if (terminal) {
      this.enqueue(subscriber, this.snapshotEvent(runId, run.sessionId, run.liveSnapshot));
      subscriber.closed = true;
      run.subscribers.delete(subscriber);
    } else if (
      cursor !== undefined &&
      cursor <= run.liveSequence &&
      (firstBuffered === undefined || cursor >= firstBuffered - 1)
    ) {
      for (const event of run.tailEvents) if (event.seq > cursor) this.enqueue(subscriber, event);
    } else {
      this.enqueue(subscriber, this.snapshotEvent(runId, run.sessionId, run.liveSnapshot));
    }
    return {
      [Symbol.asyncIterator]: () => ({
        next: () => this.next(subscriber),
        return: async () => {
          subscriber.closed = true;
          run.subscribers.delete(subscriber);
          subscriber.waiting?.({ done: true, value: undefined });
          return { done: true, value: undefined };
        },
      }),
    };
  }

  // 构造一个表示完整替换的 Snapshot 事件。
  // Snapshot Event 的 seq 等于 Snapshot 水位；它表示完整替换，而不是新的业务变化。
  private snapshotEvent(runId: string, sessionId: string, snapshot: RunSnapshot): RunStreamEvent {
    return {
      version: protocolVersion,
      eventId: crypto.randomUUID(),
      seq: snapshot.lastEventSequence,
      sessionId,
      runId,
      type: 'run.snapshot',
      occurredAt: new Date().toISOString(),
      payload: snapshot,
    };
  }

  // 关闭某个 Run 的全部 SSE 订阅者。
  // Terminal 已交付或 Executor 结束时关闭所有观察连接，但不在这里删除 Active Run。
  close(runId: string): void {
    const run = this.registry.get(runId);
    if (!run) return;
    for (const subscriber of run.subscribers) {
      subscriber.closed = true;
      subscriber.waiting?.({ done: true, value: undefined });
    }
    run.subscribers.clear();
  }

  // 向单个订阅者入队；队列过慢时主动断开以便客户端重连自愈。
  // 慢 Subscriber 超过独立队列上限时断开，让客户端下次通过 cursor/Snapshot 自愈。
  private enqueue(subscriber: RunSubscriber, event: RunStreamEvent): void {
    if (subscriber.closed) return;
    if (subscriber.waiting) {
      const resolve = subscriber.waiting;
      subscriber.waiting = undefined;
      resolve({ done: false, value: event });
      return;
    }
    if (subscriber.queue.length >= MAX_SUBSCRIBER_QUEUE) {
      subscriber.closed = true;
      subscriber.overflowed = true;
      return;
    }
    subscriber.queue.push(event);
  }

  // 读取订阅者队列中的下一个事件，必要时等待新事件。
  private next(subscriber: RunSubscriber): Promise<IteratorResult<RunStreamEvent>> {
    const event = subscriber.queue.shift();
    if (event) return Promise.resolve({ done: false, value: event });
    if (subscriber.closed) return Promise.resolve({ done: true, value: undefined });
    return new Promise((resolve) => (subscriber.waiting = resolve));
  }

  // 将单个事件归约到 Run 外壳 Snapshot 上。
  // EventHub 只归约 Run 外壳状态；正文、Blocks 和工具投影由同版本 Projection 覆盖。
  private reduceSnapshot(snapshot: RunSnapshot, event: RunStreamEvent): RunSnapshot {
    const payload = event.payload;
    if (event.type === 'user_input.updated' && 'pendingUserInputs' in payload) {
      return {
        ...snapshot,
        pendingUserInputs: payload.pendingUserInputs,
        lastEventSequence: event.seq,
      };
    }
    const createdInterrupt =
      (event.type === 'interrupt.created' || event.type === 'run.waiting_for_user') &&
      'interrupt' in payload
        ? pendingInterrupt(payload.interrupt)
        : undefined;
    const status =
      event.type === 'run.started'
        ? 'running'
        : event.type === 'run.cancel_requested'
          ? 'cancel_requested'
          : event.type === 'run.completed'
            ? 'completed'
            : event.type === 'run.failed'
              ? 'failed'
              : event.type === 'run.cancelled'
                ? 'cancelled'
                : snapshot.status;
    return {
      ...snapshot,
      status,
      lastEventSequence: event.seq,
      ...(event.type.startsWith('run.') && 'control' in payload
        ? { control: payload.control }
        : {}),
      ...(createdInterrupt ? { activeInterrupt: createdInterrupt } : {}),
      ...(event.type === 'interrupt.resolved' || event.type === 'interrupt.cancelled'
        ? { activeInterrupt: undefined }
        : {}),
      ...(event.type === 'run.failed' && 'code' in payload
        ? { error: { code: payload.code, detail: payload.detail } }
        : {}),
    };
  }
}

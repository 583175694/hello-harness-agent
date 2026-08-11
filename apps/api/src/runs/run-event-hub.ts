import { Inject, Injectable } from '@nestjs/common';
import { protocolVersion } from '@harness/agent-protocol';
import type { RunSnapshot, RunStreamEvent } from '@harness/agent-protocol';
import { ActiveRunRegistry } from './active-run.registry';
import type { RunSubscriber } from './run.types';

const MAX_EVENTS = 500;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_SUBSCRIBER_QUEUE = 256;

@Injectable()
export class RunEventHub {
  constructor(@Inject(ActiveRunRegistry) private readonly registry: ActiveRunRegistry) {}

  publish(runId: string, type: RunStreamEvent['type'], payload: RunStreamEvent['payload']) {
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
    if (type === 'run.snapshot') run.snapshot = payload as RunSnapshot;
    else run.snapshot = this.reduceSnapshot(run.snapshot, event);
    const bytes = Buffer.byteLength(JSON.stringify(event));
    run.recentEvents.push(event);
    run.recentBytes += bytes;
    while (run.recentEvents.length > MAX_EVENTS || run.recentBytes > MAX_BYTES) {
      const removed = run.recentEvents.shift();
      if (removed) run.recentBytes -= Buffer.byteLength(JSON.stringify(removed));
    }
    for (const subscriber of run.subscribers) this.enqueue(subscriber, event);
    return event;
  }

  updateSnapshot(runId: string, snapshot: RunSnapshot): void {
    const run = this.registry.get(runId);
    if (run) run.snapshot = snapshot;
  }

  subscribe(runId: string, cursor?: number): AsyncIterable<RunStreamEvent> | undefined {
    const run = this.registry.get(runId);
    if (!run) return undefined;
    const subscriber: RunSubscriber = { queue: [], closed: false };
    run.subscribers.add(subscriber);
    const firstBuffered = run.recentEvents[0]?.seq;
    const terminal = ['completed', 'failed', 'cancelled'].includes(run.snapshot.status);
    if (terminal) {
      this.enqueue(subscriber, this.snapshotEvent(runId, run.sessionId, run.snapshot));
      subscriber.closed = true;
      run.subscribers.delete(subscriber);
    } else if (cursor !== undefined && (firstBuffered === undefined || cursor >= firstBuffered - 1)) {
      for (const event of run.recentEvents) if (event.seq > cursor) this.enqueue(subscriber, event);
    } else {
      this.enqueue(subscriber, this.snapshotEvent(runId, run.sessionId, run.snapshot));
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

  close(runId: string): void {
    const run = this.registry.get(runId);
    if (!run) return;
    for (const subscriber of run.subscribers) {
      subscriber.closed = true;
      subscriber.waiting?.({ done: true, value: undefined });
    }
    run.subscribers.clear();
  }

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
      return;
    }
    subscriber.queue.push(event);
  }

  private next(subscriber: RunSubscriber): Promise<IteratorResult<RunStreamEvent>> {
    const event = subscriber.queue.shift();
    if (event) return Promise.resolve({ done: false, value: event });
    if (subscriber.closed) return Promise.resolve({ done: true, value: undefined });
    return new Promise((resolve) => (subscriber.waiting = resolve));
  }

  private reduceSnapshot(snapshot: RunSnapshot, event: RunStreamEvent): RunSnapshot {
    const payload = event.payload;
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
      ...(event.type === 'run.failed' && 'code' in payload
        ? { error: { code: payload.code, detail: payload.detail } }
        : {}),
    };
  }
}

import { Injectable } from '@nestjs/common';
import type { RunSnapshot } from '@harness/agent-protocol';
import type { ActiveRun } from './run.types';

@Injectable()
export class ActiveRunRegistry {
  private readonly runs = new Map<string, ActiveRun>();

  register(snapshot: RunSnapshot): ActiveRun {
    const existing = this.runs.get(snapshot.runId);
    if (existing) return existing;
    const active: ActiveRun = {
      runId: snapshot.runId,
      sessionId: snapshot.sessionId,
      abortController: new AbortController(),
      nextSequence: snapshot.lastEventSequence + 1,
      recentEvents: [],
      recentBytes: 0,
      snapshot,
      subscribers: new Set(),
    };
    this.runs.set(snapshot.runId, active);
    return active;
  }

  get(runId: string): ActiveRun | undefined {
    return this.runs.get(runId);
  }

  values(): ActiveRun[] {
    return [...this.runs.values()];
  }

  remove(runId: string): void {
    this.runs.delete(runId);
  }
}

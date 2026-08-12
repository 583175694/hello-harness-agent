import { Injectable } from '@nestjs/common';
import type { RunSnapshot } from '@harness/agent-protocol';
import type { ActiveRun } from './run.types';

@Injectable()
export class ActiveRunRegistry {
  // Registry 只保存当前 API 实例正在执行或刚结束、仍可供重连的 Run。
  private readonly runs = new Map<string, ActiveRun>();

  // 从数据库初始 Snapshot 建立内存基线；此时 Tail 为空，Live 与 Durable 完全一致。
  register(snapshot: RunSnapshot): ActiveRun {
    const existing = this.runs.get(snapshot.runId);
    if (existing) return existing;
    const active: ActiveRun = {
      runId: snapshot.runId,
      sessionId: snapshot.sessionId,
      abortController: new AbortController(),
      nextSequence: snapshot.lastEventSequence + 1,
      liveSequence: snapshot.lastEventSequence,
      liveSnapshot: structuredClone(snapshot),
      durableCheckpoint: {
        sequence: snapshot.lastEventSequence,
        draftVersion: 0,
        snapshot: structuredClone(snapshot),
      },
      tailEvents: [],
      tailBytes: 0,
      checkpointRequested: false,
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

  // 移除只影响进程内精确 replay；之后客户端仍可从 PostgreSQL 读取 Durable Snapshot。
  remove(runId: string): void {
    this.runs.delete(runId);
  }
}

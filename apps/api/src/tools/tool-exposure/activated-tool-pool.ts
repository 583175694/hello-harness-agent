import { MCP_ACTIVATED_CAP } from './tool-exposure.constants';

export type ActivatedToolEntry = {
  publicName: string;
  activatedInRound: number;
  invoked: boolean;
  lastInvokedRound?: number;
};

/**
 * 管理单个 Run 内通过 tool_search 激活的 MCP 工具生命周期：
 * 1. 硬容量上限（默认 MCP_ACTIVATED_CAP = 8），超限时优先淘汰未调用且最早激活的候选；
 * 2. 跨轮未调用淘汰：工具被搜出后至少保留下一整轮供模型调用，若整轮未被执行则在再下一轮自动移出；
 * 3. 真调用留存：一旦被模型实际执行，锁定留存并在超限时按 LRU 排序。
 */
export class ActivatedToolPool {
  private readonly entries = new Map<string, ActivatedToolEntry>();

  constructor(private readonly maxSize: number = MCP_ACTIVATED_CAP) {}

  activate(names: ReadonlyArray<string>, round: number): void {
    for (const name of names) {
      const existing = this.entries.get(name);
      if (existing) {
        existing.activatedInRound = Math.max(existing.activatedInRound, round);
        continue;
      }
      if (this.entries.size >= this.maxSize) {
        this.evictOne();
      }
      if (this.entries.size < this.maxSize) {
        this.entries.set(name, {
          publicName: name,
          activatedInRound: round,
          invoked: false,
        });
      }
    }
  }

  markInvoked(publicName: string, round: number): void {
    const existing = this.entries.get(publicName);
    if (existing) {
      existing.invoked = true;
      existing.lastInvokedRound = round;
    }
  }

  /**
   * 清理已完整暴露过至少一轮但仍未被模型调用的候选工具。
   * 例：第 1 轮 tool_search 激活 -> 第 2 轮供模型调用 -> 第 3 轮起若仍未调用则淘汰。
   */
  evictStaleUninvoked(currentRound: number): string[] {
    const evicted: string[] = [];
    for (const [name, entry] of this.entries) {
      if (!entry.invoked && currentRound - entry.activatedInRound >= 2) {
        this.entries.delete(name);
        evicted.push(name);
      }
    }
    return evicted;
  }

  asSet(): ReadonlySet<string> {
    return new Set(this.entries.keys());
  }

  get size(): number {
    return this.entries.size;
  }

  private evictOne(): void {
    let victim: ActivatedToolEntry | undefined;
    for (const entry of this.entries.values()) {
      if (!entry.invoked) {
        if (!victim || entry.activatedInRound < victim.activatedInRound) {
          victim = entry;
        }
      }
    }
    if (!victim) {
      for (const entry of this.entries.values()) {
        const entryTouch = entry.lastInvokedRound ?? entry.activatedInRound;
        const victimTouch = victim
          ? (victim.lastInvokedRound ?? victim.activatedInRound)
          : Number.POSITIVE_INFINITY;
        if (!victim || entryTouch < victimTouch) {
          victim = entry;
        }
      }
    }
    if (victim) {
      this.entries.delete(victim.publicName);
    }
  }
}

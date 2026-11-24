import { MCP_ACTIVATED_CAP } from './tool-exposure.constants';

export type ActivatedToolEntry = {
  publicName: string;
  activatedInRound: number;
  invoked: boolean;
  lastInvokedRound?: number;
};

/**
 * 管理单个 Run 内通过 tool_search 激活的 MCP 工具生命周期（Append-Only）：
 * 1. 单 Run 内只增不减、严格保持首次激活顺序，避免跨轮淘汰反复击穿 KV-Cache；
 * 2. 达到硬上限（默认 MCP_ACTIVATED_CAP = 12）后不再追加新工具，总工具面恒定有界；
 * 3. 记录 invoked 状态供观测审计使用。
 */
export class ActivatedToolPool {
  private readonly entries = new Map<string, ActivatedToolEntry>();

  constructor(private readonly maxSize: number = MCP_ACTIVATED_CAP) {}

  activate(names: ReadonlyArray<string>, round: number): void {
    for (const name of names) {
      if (this.entries.has(name)) continue;
      if (this.entries.size >= this.maxSize) break;
      this.entries.set(name, {
        publicName: name,
        activatedInRound: round,
        invoked: false,
      });
    }
  }

  markInvoked(publicName: string, round: number): void {
    const existing = this.entries.get(publicName);
    if (existing) {
      existing.invoked = true;
      existing.lastInvokedRound = round;
    }
  }

  /** 返回按首次激活顺序排列的只读集合（JS Set 严格保序）。 */
  asSet(): ReadonlySet<string> {
    return new Set(this.entries.keys());
  }

  get size(): number {
    return this.entries.size;
  }
}

import { formatLogDuration, formatLogShare } from './logging.utils';

/** 可注入的时钟，便于测试里推进时间而不 sleep。 */
export type Clock = () => number;

type Segment = { label: string; ms: number };

type LatencyTraceOptions = {
  clock?: Clock;
  /** 起点绝对时间戳；缺省为构造时刻。用于跨函数边界复用同一段计时。 */
  origin?: number;
};

/**
 * 一次调用链的耗时归因。
 *
 * 用法：
 * - `measure(label, fn)` 包裹一段异步工作，自动累加到同名片段；
 * - `mark(label, at)` 记录事件发生的绝对时刻（如首 token）；
 * - `formatSegments()` 直接拼出可读日志，不必手写 Date.now 差值。
 *
 * 片段按首次出现顺序累加；同名片段会被合并，因此可以循环调用 measure。
 */
export class LatencyTrace {
  private readonly clock: Clock;
  private readonly originMs: number;
  private readonly segments: Segment[] = [];
  private readonly marks: Array<{ label: string; offsetMs: number }> = [];

  constructor(options: LatencyTraceOptions = {}) {
    this.clock = options.clock ?? Date.now;
    this.originMs = options.origin ?? this.clock();
  }

  /** 自起点的累计毫秒数。 */
  elapsedMs(): number {
    return Math.max(0, this.clock() - this.originMs);
  }

  /** 自起点到指定绝对时刻的偏移毫秒数。 */
  offsetOf(timestamp: number): number {
    return Math.max(0, timestamp - this.originMs);
  }

  /** 累加一段耗时；同名片段合并，方便在循环里重复调用。 */
  add(label: string, ms: number): void {
    const existing = this.segments.find((segment) => segment.label === label);
    if (existing) {
      existing.ms += Math.max(0, ms);
      return;
    }
    this.segments.push({ label, ms: Math.max(0, ms) });
  }

  /** 包裹一段同步/异步工作并自动计时，同时返回其结果。 */
  async measure<T>(label: string, task: () => Promise<T> | T): Promise<T> {
    const startedAt = this.clock();
    try {
      return await task();
    } finally {
      this.add(label, this.clock() - startedAt);
    }
  }

  /** 记录一个事件发生的绝对时刻，输出时换算为相对起点的偏移。 */
  mark(label: string, atMs: number): void {
    // 同名标记只保留首次：`首正文` 语义是整条链路第一次出现，而不是每轮都覆盖。
    if (this.marks.some((mark) => mark.label === label)) return;
    this.marks.push({ label, offsetMs: this.offsetOf(atMs) });
  }

  segmentMs(label: string): number | undefined {
    return this.segments.find((segment) => segment.label === label)?.ms;
  }

  /** `凭证=12 毫秒 连接=340 毫秒`，按首次记录顺序输出。 */
  formatSegments(): string {
    if (!this.segments.length) return '无';
    return this.segments
      .map((segment) => `${segment.label}=${formatLogDuration(segment.ms)}`)
      .join(' ');
  }

  /** 带占比的片段，占比基数为总耗时；用于判断哪一段才是主因。 */
  formatSegmentsWithShare(totalMs = this.elapsedMs()): string {
    if (!this.segments.length) return '无';
    return this.segments
      .map(
        (segment) =>
          `${segment.label}=${formatLogDuration(segment.ms)}(≈${formatLogShare(segment.ms, totalMs)})`,
      )
      .join(' ');
  }

  /** `首推理=1.20 秒 首正文=8.40 秒`，无记录时输出 `无`。 */
  formatMarks(): string {
    if (!this.marks.length) return '无';
    return this.marks.map((mark) => `${mark.label}=${formatLogDuration(mark.offsetMs)}`).join(' ');
  }

  /**
   * 未被片段解释的剩余时间。
   * 仅在片段串行执行时成立；并行片段会得出 0 而不是负数。
   */
  unaccountedMs(): number {
    const accounted = this.segments.reduce((sum, segment) => sum + segment.ms, 0);
    return Math.max(0, this.elapsedMs() - accounted);
  }
}

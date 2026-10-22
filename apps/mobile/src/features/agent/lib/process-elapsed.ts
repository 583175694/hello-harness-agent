import type { MobileAssistantBlock } from '../fixtures/mobile-preview.types';

function parseTime(iso?: string): number | undefined {
  if (!iso) return undefined;
  const value = Date.parse(iso);
  return Number.isFinite(value) ? value : undefined;
}

function parseDurationMs(duration?: string): number {
  if (!duration) return 0;
  const ms = duration.match(/^(\d+)ms$/);
  if (ms) return Number(ms[1]);
  const sec = duration.match(/^([\d.]+)s$/);
  if (sec) return Math.round(Number(sec[1]) * 1000);
  return 0;
}

/** 对齐 Web `agent-chain-of-thought` 的 `processTimeRange` + `processElapsed`。 */
export function processTimelineTimeRange(items: MobileAssistantBlock[]): {
  start?: number;
  end?: number;
} {
  const starts: number[] = [];
  const ends: number[] = [];
  for (const item of items) {
    if (item.type === 'tool_activity') {
      const started = parseTime(item.item.startedAt);
      if (started !== undefined) starts.push(started);
      const completed = parseTime(item.item.completedAt);
      if (completed !== undefined) ends.push(completed);
      continue;
    }
    if (item.type === 'reasoning') {
      const started = parseTime(item.startedAt);
      if (started !== undefined) starts.push(started);
      const completed = parseTime(item.completedAt);
      if (completed !== undefined) ends.push(completed);
    }
  }
  return {
    start: starts.length ? Math.min(...starts) : undefined,
    end: ends.length ? Math.max(...ends) : undefined,
  };
}

export function processTimelineElapsedMs(
  items: MobileAssistantBlock[],
  running: boolean,
  now: number,
): number {
  const { start, end } = processTimelineTimeRange(items);
  if (start === undefined) {
    let fallbackMs = 0;
    for (const item of items) {
      if (item.type === 'reasoning' && item.durationMs) fallbackMs += item.durationMs;
      if (item.type === 'tool_activity') fallbackMs += parseDurationMs(item.item.duration);
    }
    return running && fallbackMs === 0 ? 0 : fallbackMs;
  }
  const finish = running ? now : (end ?? start);
  return Math.max(0, finish - start);
}

export function formatProcessElapsedLabel(elapsedMs: number): string {
  if (elapsedMs <= 0) return '处理过程';
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  if (totalSeconds < 60) return `已用时 ${totalSeconds} 秒`;
  return `已用时 ${Math.floor(totalSeconds / 60)} 分 ${totalSeconds % 60}秒`;
}

import { describe, expect, it } from 'vitest';

import { formatLogDuration, formatLogShare } from '../../../src/shared/logging.utils';
import { LatencyTrace } from '../../../src/shared/timing';

function fakeClock(start: number, steps: number[]): () => number {
  let current = start;
  let index = 0;
  return () => {
    const value = current;
    current += steps[index] ?? 0;
    index += 1;
    return value;
  };
}

describe('LatencyTrace', () => {
  it('totals repeated segments so loops do not emit one line per entry', () => {
    const clock = fakeClock(1_000, [120, 80, 40]);
    const trace = new LatencyTrace({ clock });

    trace.add('连接', 120);
    trace.add('连接', 80);
    trace.add('listTools', 40);

    expect(trace.segmentMs('连接')).toBe(200);
    expect(trace.formatSegments()).toBe('连接=200 毫秒 listTools=40 毫秒');
  });

  it('records marks relative to the origin', () => {
    const trace = new LatencyTrace({ origin: 5_000, clock: () => 13_400 });
    trace.mark('首正文', 13_400);
    expect(trace.formatMarks()).toBe('首正文=8.40 秒');
  });

  it('keeps only the first occurrence of a repeated mark', () => {
    const trace = new LatencyTrace({ origin: 0, clock: () => 9_000 });
    trace.mark('首正文', 3_000);
    trace.mark('首正文', 9_000);
    expect(trace.formatMarks()).toBe('首正文=3.00 秒');
  });

  it('keeps the segments recorded before a failing task throws', async () => {
    const clock = fakeClock(0, [0, 250, 250]);
    const trace = new LatencyTrace({ clock });

    await expect(
      trace.measure('凭证', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(trace.segmentMs('凭证')).toBe(250);
  });

  it('reports the remaining time not covered by segments', () => {
    const trace = new LatencyTrace({ clock: () => 1_000, origin: 0 });
    trace.add('模型', 400);
    expect(trace.unaccountedMs()).toBe(600);
  });

  it('never reports negative durations when the clock jumps backwards', () => {
    const clock = fakeClock(1_000, [1_000, 400]);
    const trace = new LatencyTrace({ clock });
    trace.add('回拨', -500);
    expect(trace.segmentMs('回拨')).toBe(0);
  });

  it('falls back to 无 when nothing was recorded', () => {
    const trace = new LatencyTrace({ clock: () => 0 });
    expect(trace.formatSegments()).toBe('无');
    expect(trace.formatMarks()).toBe('无');
  });
});

describe('log formatting helpers', () => {
  it('marks missing totals instead of dividing by zero', () => {
    expect(formatLogShare(10, 0)).toBe('0%');
    expect(formatLogShare(25, 100)).toBe('25%');
  });

  it('switches from milliseconds to seconds at one second', () => {
    expect(formatLogDuration(999)).toBe('999 毫秒');
    expect(formatLogDuration(1_234)).toBe('1.23 秒');
  });
});

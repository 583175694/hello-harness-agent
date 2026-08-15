export function summarizePasses(values: Array<{ taskId: string; passed: boolean }>): {
  passAtK: number;
  passPowerK: number;
} {
  const grouped = new Map<string, boolean[]>();
  for (const value of values)
    grouped.set(value.taskId, [...(grouped.get(value.taskId) ?? []), value.passed]);
  const tasks = [...grouped.values()];
  return {
    passAtK: tasks.filter((trials) => trials.some(Boolean)).length / Math.max(tasks.length, 1),
    passPowerK: tasks.filter((trials) => trials.every(Boolean)).length / Math.max(tasks.length, 1),
  };
}

export function bootstrapPassRate(
  passed: boolean[],
  seed: number,
  samples = 10_000,
): { low: number; high: number } {
  if (!passed.length) return { low: 0, high: 0 };
  const random = mulberry32(seed);
  const rates = Array.from({ length: samples }, () => {
    let successes = 0;
    for (let index = 0; index < passed.length; index += 1)
      if (passed[Math.floor(random() * passed.length)]) successes += 1;
    return successes / passed.length;
  }).sort((left, right) => left - right);
  return {
    low: rates[Math.floor(samples * 0.025)] ?? 0,
    high: rates[Math.floor(samples * 0.975)] ?? 1,
  };
}

// 多 Trial 属于同一个 Task，不应把它们当成相互独立样本；按 Task 聚类重采样。
export function bootstrapTaskPassRate(
  values: Array<{ taskId: string; passed: boolean }>,
  seed: number,
  samples = 10_000,
): { low: number; high: number } {
  const grouped = new Map<string, boolean[]>();
  for (const value of values)
    grouped.set(value.taskId, [...(grouped.get(value.taskId) ?? []), value.passed]);
  const tasks = [...grouped.values()];
  if (!tasks.length) return { low: 0, high: 0 };
  const random = mulberry32(seed);
  const rates = Array.from({ length: samples }, () => {
    let successes = 0;
    let trials = 0;
    for (let index = 0; index < tasks.length; index += 1) {
      const selected = tasks[Math.floor(random() * tasks.length)] ?? [];
      successes += selected.filter(Boolean).length;
      trials += selected.length;
    }
    return successes / Math.max(trials, 1);
  }).sort((left, right) => left - right);
  return {
    low: rates[Math.floor(samples * 0.025)] ?? 0,
    high: rates[Math.floor(samples * 0.975)] ?? 1,
  };
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

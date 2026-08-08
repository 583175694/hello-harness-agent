// 从已有来源标识中计算下一序号，避免线索升级后复用已经分配过的编号。
export function nextSourceNumber(sources: Array<{ id: string }>, prefix: 'R' | 'F'): number {
  const maximum = sources.reduce((current, source) => {
    const match = new RegExp(`^${prefix}(\\d+)$`, 'u').exec(source.id);
    return match?.[1] ? Math.max(current, Number(match[1])) : current;
  }, 0);
  return maximum + 1;
}

// 将字符串转换为 code-point 数组，统一处理 emoji 和扩展 Unicode 字符。
export function toCodePoints(value: string): string[] {
  return Array.from(value);
}

// 返回字符串包含的 Unicode code point 数量。
export function codePointLength(value: string): number {
  return toCodePoints(value).length;
}

// 使用 code-point 区间截取字符串，避免拆开代理对。
export function sliceCodePoints(value: string, start: number, end?: number): string {
  return toCodePoints(value).slice(start, end).join('');
}

// 在 canonical 文本中以 code points 查找直接子串位置。
export function codePointIndexOf(value: string, search: string, from = 0): number {
  const source = toCodePoints(value);
  const target = toCodePoints(search);
  if (!target.length) return from;
  outer: for (let index = from; index <= source.length - target.length; index += 1) {
    for (let offset = 0; offset < target.length; offset += 1) {
      if (source[index + offset] !== target[offset]) continue outer;
    }
    return index;
  }
  return -1;
}

// 类型化 key 只用于约束同一个状态槽的读写类型，运行时仍以唯一 Symbol 隔离。
export type ToolRunStateKey<T> = symbol & {
  readonly __toolRunStateType?: (value: T) => T;
};

export function createToolRunStateKey<T>(description: string): ToolRunStateKey<T> {
  return Symbol(description) as ToolRunStateKey<T>;
}

// 保存单次非持久化 Agent run 中由各工具领域自行拥有的状态。
export class ToolRunState {
  private readonly values = new Map<symbol, unknown>();

  getOrCreate<T>(key: ToolRunStateKey<T>, factory: () => T): T {
    if (this.values.has(key)) return this.values.get(key) as T;
    const value = factory();
    this.values.set(key, value);
    return value;
  }
}

type MessageOrderValue = {
  id: string;
  role: 'user' | 'assistant';
  runId?: string | null;
  createdAt: Date;
};

// PostgreSQL 的事务时间戳对同一 Run 的用户消息和 assistant 草稿可能相同。
export function compareMessageOrder(left: MessageOrderValue, right: MessageOrderValue): number {
  const byTime = left.createdAt.getTime() - right.createdAt.getTime();
  if (byTime !== 0) return byTime;
  if (left.runId && left.runId === right.runId && left.role !== right.role)
    return left.role === 'user' ? -1 : 1;
  return left.id.localeCompare(right.id);
}

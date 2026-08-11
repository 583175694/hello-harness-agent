type MessageOrderValue = {
  id: string;
  role: 'user' | 'assistant';
  runId?: string | null;
  createdAt: Date;
};

// PostgreSQL's transaction timestamp is identical for a Run's user message and assistant draft.
export function compareMessageOrder(left: MessageOrderValue, right: MessageOrderValue): number {
  const byTime = left.createdAt.getTime() - right.createdAt.getTime();
  if (byTime !== 0) return byTime;
  if (left.runId && left.runId === right.runId && left.role !== right.role)
    return left.role === 'user' ? -1 : 1;
  return left.id.localeCompare(right.id);
}

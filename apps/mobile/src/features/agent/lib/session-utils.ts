import type { SessionSummary } from '@harness/agent-protocol';

import type { SessionDrawerItemFixture } from '../fixtures/ui-fixtures';

export function formatSessionUpdatedAt(updatedAt: string, nowMs = Date.now()): string {
  const updated = new Date(updatedAt).getTime();
  if (Number.isNaN(updated)) return '';
  const diffMs = Math.max(0, nowMs - updated);
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} 小时前`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return '昨天';
  if (diffDays < 7) return `${diffDays} 天前`;
  return new Date(updatedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

export function sessionSummaryToDrawerItem(
  session: SessionSummary,
  options: {
    active?: boolean;
    running?: boolean;
    nowMs?: number;
  } = {},
): SessionDrawerItemFixture {
  return {
    id: session.id,
    title: session.title,
    time: formatSessionUpdatedAt(session.updatedAt, options.nowMs),
    pinned: session.isPinned,
    active: options.active,
    running: options.running,
  };
}

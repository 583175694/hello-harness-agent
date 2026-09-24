import type { SessionSummary } from '@harness/agent-protocol';


// 按置顶优先、最近更新其次的规则稳定排列会话。
function sortSessionSummaries(items: SessionSummary[]): SessionSummary[] {
  return [...items].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

export type SessionTimeGroup = {
  id: 'pinned' | 'today' | 'yesterday' | 'week' | 'month' | 'older';
  label: '置顶' | '今天' | '昨天' | '过去 7 天' | '过去 30 天' | '更早';
  sessions: SessionSummary[];
};

function sessionTimeGroup(input: {
  updatedAt: number;
  today: number;
  yesterday: number;
  week: number;
  month: number;
  todayGroup: SessionTimeGroup;
  yesterdayGroup: SessionTimeGroup;
  weekGroup: SessionTimeGroup;
  monthGroup: SessionTimeGroup;
  older: SessionTimeGroup;
}): SessionTimeGroup {
  if (input.updatedAt >= input.today) return input.todayGroup;
  if (input.updatedAt >= input.yesterday) return input.yesterdayGroup;
  if (input.updatedAt >= input.week) return input.weekGroup;
  if (input.updatedAt >= input.month) return input.monthGroup;
  return input.older;
}

// 按用户本地自然日和最近活动时间分组；各时间区间互斥，置顶会话独立置于最前。
export function groupSessionSummaries(
  items: SessionSummary[],
  now = new Date(),
): SessionTimeGroup[] {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const boundary = (daysAgo: number) => {
    const value = new Date(startOfToday);
    value.setDate(value.getDate() - daysAgo);
    return value.getTime();
  };
  const today = startOfToday.getTime();
  const yesterday = boundary(1);
  const week = boundary(7);
  const month = boundary(30);
  const pinned: SessionTimeGroup = { id: 'pinned', label: '置顶', sessions: [] };
  const todayGroup: SessionTimeGroup = { id: 'today', label: '今天', sessions: [] };
  const yesterdayGroup: SessionTimeGroup = { id: 'yesterday', label: '昨天', sessions: [] };
  const weekGroup: SessionTimeGroup = { id: 'week', label: '过去 7 天', sessions: [] };
  const monthGroup: SessionTimeGroup = { id: 'month', label: '过去 30 天', sessions: [] };
  const older: SessionTimeGroup = { id: 'older', label: '更早', sessions: [] };
  const groups = [pinned, todayGroup, yesterdayGroup, weekGroup, monthGroup, older];

  for (const session of sortSessionSummaries(items)) {
    if (session.isPinned) {
      pinned.sessions.push(session);
      continue;
    }
    const updatedAt = new Date(session.updatedAt).getTime();
    const target = sessionTimeGroup({
      updatedAt,
      today,
      yesterday,
      week,
      month,
      todayGroup,
      yesterdayGroup,
      weekGroup,
      monthGroup,
      older,
    });
    target.sessions.push(session);
  }

  return groups.filter((group) => group.sessions.length > 0);
}

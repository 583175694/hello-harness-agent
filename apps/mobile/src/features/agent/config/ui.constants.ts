import type { ActivityStatus, ServiceState } from '@harness/agent-ui-types';

export const AGENT_UI_BEHAVIOR = {
  copyFeedbackDurationMs: 1_400,
  stickToBottomThresholdPx: 32,
  longPasteThresholdCodePoints: 4_000,
} as const;

export const AGENT_UI_COPY = {
  defaultSessionTitle: '新任务',
  composerPlaceholders: {
    newRun: '描述你想完成的任务……',
    steer: '补充方向，将从下一步骤应用……',
    clarification: '回答确认问题以继续……',
    disabled: '正在取消当前任务……',
  },
  steerAcceptedHint: '已接受，将从下一步骤生效',
  deleteSessionConfirm:
    '删除后将移除该会话中的对话、报告与证据快照，且无法恢复。确定删除？',
} as const;

export const SERVICE_STATE_LABELS: Record<ServiceState, string> = {
  checking: '检查服务',
  ready: '服务已就绪',
  unavailable: '服务不可用',
};

export const ACTIVITY_STATUS_COPY: Record<ActivityStatus, { title: string; subtitle: string }> = {
  queued: { title: '排队中', subtitle: '等待执行资源' },
  final_answer: { title: '撰写最终回答', subtitle: '正在整理结论' },
  running: { title: '执行中', subtitle: 'Agent 正在调用工具' },
  completed: { title: '已完成', subtitle: '本轮任务结束' },
  waiting: { title: '等待你的确认', subtitle: '确认后才会继续检索与筛选' },
  pause_requested: { title: '暂停请求已收到', subtitle: '将在安全边界暂停' },
  paused: { title: '已暂停', subtitle: '可从当前边界继续' },
  resuming: { title: '恢复中', subtitle: '从暂停边界继续执行' },
  waiting_for_user: { title: '等待你的操作', subtitle: '提交回答或审批后继续' },
  cancelling: { title: '取消中', subtitle: '正在安全停止' },
  cancelled: { title: '已取消', subtitle: '取消前的快照仍保留' },
  failed: { title: '执行失败', subtitle: '请稍后重试或修改任务' },
};

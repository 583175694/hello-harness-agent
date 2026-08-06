import type { ActivityStatus, ServiceState } from '../model/types';

// 集中维护影响交互行为的数值，避免组件间产生不一致的手感。
export const AGENT_UI_BEHAVIOR = {
  // 复制消息后，复制成功图标保持显示的时间。
  copyFeedbackDurationMs: 1_400,
  // 用户距离滚动底部小于该值时继续吸底。
  stickToBottomThresholdPx: 32,
} as const;

// 集中维护跨页面重复使用的稳定界面文案。
export const AGENT_UI_COPY = {
  // 没有持久化会话时显示的默认标题。
  defaultSessionTitle: '新任务',
  // 搜索 Workbench 的统一任务标题。
  searchWorkbenchTitle: '网页检索',
  // Composer 各运行模式下的输入提示。
  composerPlaceholders: {
    // 普通新任务的输入提示。
    newRun: '描述你想完成的任务……',
    // 运行中允许 steer 时的输入提示。
    steer: '补充方向，将从下一步骤应用……',
    // 等待用户确认时的输入提示。
    clarification: '回答确认问题以继续……',
    // 运行取消期间不可提交时的输入提示。
    disabled: '正在取消当前任务……',
  },
  // Composer 各运行模式下的辅助说明。
  composerHints: {
    // steer 提交按钮旁的说明。
    steer: '作为调整提交 · 下一步骤生效',
    // 确认提交按钮旁的说明。
    clarification: '回答后继续当前任务',
  },
} as const;

// 将服务状态映射为稳定的可读标签。
export const SERVICE_STATE_LABELS: Record<ServiceState, string> = {
  // 正在请求 API readiness 时的状态标签。
  checking: '检查服务',
  // API readiness 成功时的状态标签。
  ready: '服务已就绪',
  // API readiness 失败时的状态标签。
  unavailable: '服务不可用',
};

// 将 Activity 状态映射为 Workbench 标题和说明。
export const ACTIVITY_STATUS_COPY: Record<ActivityStatus, { title: string; subtitle: string }> = {
  // 工具循环正常执行时的标题和说明。
  running: { title: '正在执行网页检索', subtitle: '逐步寻找并验证可引用证据' },
  // Runtime 等待用户确认时的标题和说明。
  waiting: { title: '等待你的确认', subtitle: '确认后才会继续检索与筛选' },
  // 收到取消请求但尚未完全结束时的标题和说明。
  cancelling: { title: '正在安全取消', subtitle: '停止当前工具调用并保留已有快照' },
  // 运行已取消时的标题和说明。
  cancelled: { title: '任务已取消', subtitle: '取消前收集到的来源仍可查看' },
  // Runtime 或工具执行失败时的标题和说明。
  failed: { title: '执行失败', subtitle: '供应商异常，可稍后重试' },
  // 工具执行和报告交付完成时的标题和说明。
  completed: { title: '检索与复核已完成', subtitle: '报告已生成，可查看来源与文件' },
};

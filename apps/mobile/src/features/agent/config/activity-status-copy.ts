/** 与 Web `ACTIVITY_STATUS_COPY` 对齐（Mobile 展示用） */
export const ACTIVITY_STATUS_COPY: Record<
  string,
  { title: string; subtitle: string }
> = {
  queued: { title: '排队中', subtitle: '任务已提交，正在等待执行资源' },
  final_answer: { title: '正在撰写回答', subtitle: '证据已整理，正在生成最终交付内容' },
  running: { title: '正在执行', subtitle: '工具循环进行中' },
  pause_requested: { title: '即将暂停', subtitle: '当前工具批次完成后将在安全位置暂停' },
  paused: { title: '任务已暂停', subtitle: '可恢复同一个 Runtime 继续执行' },
  resuming: { title: '正在恢复', subtitle: '正在从暂停边界继续执行' },
  waiting_for_user: { title: '等待你的操作', subtitle: '提交回答或审批后继续' },
  waiting: { title: '等待你的确认', subtitle: '确认后才会继续' },
  cancelling: { title: '正在安全取消', subtitle: '停止当前工具调用并保留已有快照' },
  cancelled: { title: '任务已取消', subtitle: '取消前收集到的来源仍可查看' },
  failed: { title: '执行失败', subtitle: '供应商异常，可稍后重试' },
  completed: { title: '已完成', subtitle: '报告与产物可查看' },
};

import type {
  AgentRunStatus,
  AssistantContentBlock,
  ResearchSourceSnapshot,
  RunSnapshot,
  RunStreamEvent,
  ToolExecutionSnapshot,
} from '@harness/agent-protocol';

// Chat/Tool 事件归约后的完整业务投影；它不包含传输 cursor 等 Run 外壳字段。
export type RunProjection = {
  model: string;
  content: string;
  blocks: AssistantContentBlock[];
  executions: ToolExecutionSnapshot[];
  sources: ResearchSourceSnapshot[];
  toolCallCount: number;
};

// API 进程存活期间一个 Run 的权威内存状态。
// 核心不变量：reduce(durableCheckpoint.snapshot, tailEvents) === liveSnapshot。
export type ActiveRun = {
  runId: string;
  sessionId: string;
  // 只控制后台 Runtime 执行；浏览器断开或切换会话不会触发 abort。
  abortController: AbortController;
  // 下一个待分配的事件序号，始终等于当前最大已提交序号加一。
  nextSequence: number;
  // liveSnapshot 已经包含到的最后事件序号。
  liveSequence: number;
  // 当前进程内最新完整 UI 状态；cursor 断档时作为 Snapshot fallback。
  liveSnapshot: RunSnapshot;
  // PostgreSQL 已确认保存的完整版本；sequence 之前的 Tail 才能安全清理。
  durableCheckpoint: {
    sequence: number;
    draftVersion: number;
    snapshot: RunSnapshot;
  };
  // 仅保留 durableCheckpoint 之后的未压缩事件，用于短断线精确 replay。
  tailEvents: RunStreamEvent[];
  tailBytes: number;
  // 为未来串行 Checkpoint 调度保留；同一 Run 不允许并发写入不同版本。
  checkpointInFlight?: Promise<void>;
  checkpointRequested: boolean;
  // Subscriber 只是观察者；集合为空不代表 Run 应该停止。
  subscribers: Set<RunSubscriber>;
};

// 每个 SSE 连接拥有独立的小队列，慢客户端不能阻塞 Runtime 或其他订阅者。
export type RunSubscriber = {
  queue: RunStreamEvent[];
  waiting?: (result: IteratorResult<RunStreamEvent>) => void;
  closed: boolean;
  overflowed?: boolean;
};

export const ACTIVE_RUN_STATUSES: AgentRunStatus[] = ['queued', 'running', 'cancel_requested'];

export const TERMINAL_RUN_STATUSES: AgentRunStatus[] = ['completed', 'failed', 'cancelled'];

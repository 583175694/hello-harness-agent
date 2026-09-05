import {
  cancelRunResponseSchema,
  runControlResponseSchema,
  createRunResponseSchema,
  createSessionResponseSchema,
  deleteSessionResponseSchema,
  generateSessionTitleResponseSchema,
  listSessionsResponseSchema,
  problemDetailsSchema,
  runSnapshotSchema,
  runStreamEventSchema,
  serviceStatusSchema,
  sessionDetailResponseSchema,
  updateSessionResponseSchema,
} from '@harness/agent-protocol';
import type {
  CancelRunResponse,
  CreateRunResponse,
  DeleteSessionResponse,
  GenerateSessionTitleResponse,
  ProblemDetails,
  ServiceStatus,
  SessionDetailResponse,
  SessionSummary,
  RunSnapshot,
  RunControlCommand,
  RunStreamEvent,
  RunControlResponse,
  UpdateSessionRequest,
  ReasoningEffort,
  PublicAgentConfig,
  FileRef,
} from '@harness/agent-protocol';
import { publicAgentConfigSchema } from '@harness/agent-protocol';

type RunPayload = RunStreamEvent['payload'];
// 从统一 Run Event payload 中提取前端 Reducer 直接消费的工具生命周期事件。
export type ToolStreamEvent = Extract<
  RunPayload,
  { type: 'tool.started' | 'tool.completed' | 'tool.failed' | 'tool.cancelled' }
>;
// 文本增量单独导出，保证 Conversation Block 更新时保留稳定的 Round/Block 位置信息。
export type MessageDeltaEvent = Extract<RunPayload, { type: 'message.delta' }>;
export type ReasoningDeltaEvent = Extract<RunPayload, { type: 'reasoning.delta' }>;
export type ModelRoundCompletedEvent = Extract<RunPayload, { type: 'model.round.completed' }>;

// 为空时通过 Vite 反向代理访问同源 API，部署时可覆盖为独立服务地址。
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '';

export class ApiProblem extends Error {
  // 保留后端标准 Problem Details，供界面按稳定错误码和用户可读 detail 分别处理。
  constructor(readonly problem: ProblemDetails) {
    super(problem.detail);
    this.name = 'ApiProblem';
  }
}

// 读取 API 就绪状态，再启用生产 Composer 操作。
export async function getReadiness(signal?: AbortSignal): Promise<ServiceStatus> {
  const response = await fetch(`${apiBaseUrl}/readyz`, { signal });
  const data: unknown = await response.json();

  if (!response.ok) {
    throw new ApiProblem(problemDetailsSchema.parse(data));
  }

  return serviceStatusSchema.parse(data);
}

// 创建首次发送时才需要的持久化会话。
export async function createSession(title: string): Promise<SessionSummary> {
  const response = await fetch(`${apiBaseUrl}/api/agent/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  return createSessionResponseSchema.parse(await parseResponse(response)).session;
}

// 读取当前本地用户按更新时间排序的会话列表。
export async function listSessions(signal?: AbortSignal): Promise<SessionSummary[]> {
  const response = await fetch(`${apiBaseUrl}/api/agent/sessions`, { signal });
  return listSessionsResponseSchema.parse(await parseResponse(response)).sessions;
}

// 读取一个会话及其持久化消息。
export async function getSession(
  sessionId: string,
  signal?: AbortSignal,
): Promise<SessionDetailResponse> {
  const response = await fetch(`${apiBaseUrl}/api/agent/sessions/${sessionId}`, { signal });
  return sessionDetailResponseSchema.parse(await parseResponse(response));
}

// 删除指定会话及其级联消息。
export async function deleteSession(sessionId: string): Promise<DeleteSessionResponse> {
  const response = await fetch(`${apiBaseUrl}/api/agent/sessions/${sessionId}`, {
    method: 'DELETE',
  });
  return deleteSessionResponseSchema.parse(await parseResponse(response));
}

// 持久化会话名称或置顶状态。
export async function updateSession(
  sessionId: string,
  input: UpdateSessionRequest,
): Promise<SessionSummary> {
  const response = await fetch(`${apiBaseUrl}/api/agent/sessions/${sessionId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return updateSessionResponseSchema.parse(await parseResponse(response)).session;
}

// 请求模型根据首轮问答更新会话标题。
export async function generateSessionTitle(
  sessionId: string,
): Promise<GenerateSessionTitleResponse> {
  const response = await fetch(`${apiBaseUrl}/api/agent/sessions/${sessionId}/title/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  return generateSessionTitleResponseSchema.parse(await parseResponse(response));
}

// 可靠创建一次 Durable Run；幂等键限定本次提交，模型执行会在 HTTP 返回后继续进行。
export async function createRun(
  sessionId: string,
  content: string,
  model: string,
  reasoningEffort: ReasoningEffort,
  attachmentId?: string,
): Promise<CreateRunResponse> {
  const response = await fetch(`${apiBaseUrl}/api/agent/sessions/${sessionId}/runs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      content,
      model,
      reasoningEffort,
      idempotencyKey: crypto.randomUUID(),
      ...(attachmentId ? { attachmentId } : {}),
    }),
  });
  return createRunResponseSchema.parse(await parseResponse(response));
}

export async function uploadFile(sessionId: string, file: File): Promise<FileRef> {
  const body = new FormData();
  body.append('file', file);
  const response = await fetch(`${apiBaseUrl}/api/agent/sessions/${sessionId}/files`, {
    method: 'POST',
    body,
  });
  return (await parseResponse(response)) as FileRef;
}

export async function submitPendingInput(sessionId: string, content: string): Promise<unknown> {
  const response = await fetch(`${apiBaseUrl}/api/agent/sessions/${sessionId}/pending-inputs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content, idempotencyKey: crypto.randomUUID() }),
  });
  return parseResponse(response);
}
export async function promotePendingInput(inputId: string): Promise<unknown> {
  const response = await fetch(`${apiBaseUrl}/api/agent/pending-inputs/${inputId}/steer`, {
    method: 'POST',
  });
  return parseResponse(response);
}
export async function cancelPendingInput(inputId: string): Promise<unknown> {
  const response = await fetch(`${apiBaseUrl}/api/agent/pending-inputs/${inputId}/cancel`, {
    method: 'POST',
  });
  return parseResponse(response);
}
export async function resumePendingQueue(sessionId: string): Promise<CreateRunResponse> {
  const response = await fetch(
    `${apiBaseUrl}/api/agent/sessions/${sessionId}/pending-inputs/resume`,
    { method: 'POST' },
  );
  return createRunResponseSchema.parse(await parseResponse(response));
}

export async function sendPendingInput(inputId: string): Promise<CreateRunResponse> {
  const response = await fetch(`${apiBaseUrl}/api/agent/pending-inputs/${inputId}/send`, {
    method: 'POST',
  });
  return createRunResponseSchema.parse(await parseResponse(response));
}

export async function getPublicAgentConfig(signal?: AbortSignal): Promise<PublicAgentConfig> {
  const response = await fetch(`${apiBaseUrl}/api/agent/config/public`, { signal });
  return publicAgentConfigSchema.parse(await parseResponse(response));
}

// 获取 Run 的完整恢复快照；服务端优先返回 Live Snapshot，否则退回 PostgreSQL Checkpoint。
export async function getRun(runId: string, signal?: AbortSignal): Promise<RunSnapshot> {
  const response = await fetch(`${apiBaseUrl}/api/agent/runs/${runId}`, { signal });
  return runSnapshotSchema.parse(await parseResponse(response));
}

// 发送独立、幂等的取消命令；取消不依赖当前 SSE 连接是否仍然存在。
export async function cancelRun(runId: string): Promise<CancelRunResponse> {
  const response = await fetch(`${apiBaseUrl}/api/agent/runs/${runId}/cancel`, { method: 'POST' });
  return cancelRunResponseSchema.parse(await parseResponse(response));
}

export async function controlRun(
  runId: string,
  command: RunControlCommand,
): Promise<RunControlResponse> {
  const response = await fetch(`${apiBaseUrl}/api/agent/runs/${runId}/commands`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(command),
  });
  return runControlResponseSchema.parse(await parseResponse(response));
}

// 独立订阅 Run；连接关闭只结束观察，不向后端发送取消命令。
// lastEventId 是最后成功归约的 cursor，服务端据此选择 Tail replay 或完整 Snapshot fallback。
export async function subscribeRun(
  runId: string,
  lastEventId: number | undefined,
  onEvent: (event: RunStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/agent/runs/${runId}/events`, {
    headers: {
      accept: 'text/event-stream',
      ...(lastEventId !== undefined ? { 'Last-Event-ID': String(lastEventId) } : {}),
    },
    signal,
  });
  if (!response.ok) await parseResponse(response);
  if (!response.body) throw new Error('Run 事件流不可用。');
  // fetch 暴露的是字节流；这里跨网络分片累计文本，直到拼出完整的 SSE frame。
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';
    for (const frame of frames) {
      // 这里只负责协议解析；Event 是否连续、目标是否存在以及何时推进 cursor 由 app reducer 决定。
      const data = frame
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (data) onEvent(runStreamEventSchema.parse(JSON.parse(data)));
    }
    if (done) return;
  }
}

// 统一解析 JSON API，并将 Problem Details 转换为前端异常。
async function parseResponse(response: Response): Promise<unknown> {
  const data: unknown = await response.json();
  if (!response.ok) throw new ApiProblem(problemDetailsSchema.parse(data));
  return data;
}

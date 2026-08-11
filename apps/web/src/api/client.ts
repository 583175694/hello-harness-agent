import {
  cancelRunResponseSchema,
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
  RunStreamEvent,
  UpdateSessionRequest,
} from '@harness/agent-protocol';

type RunPayload = RunStreamEvent['payload'];
export type ToolStreamEvent = Extract<
  RunPayload,
  { type: 'tool.started' | 'tool.completed' | 'tool.failed' | 'tool.cancelled' }
>;
export type MessageDeltaEvent = Extract<RunPayload, { type: 'message.delta' }>;

// 为空时通过 Vite 反向代理访问同源 API，部署时可覆盖为独立服务地址。
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '';

export class ApiProblem extends Error {
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

export async function createRun(sessionId: string, content: string): Promise<CreateRunResponse> {
  const response = await fetch(`${apiBaseUrl}/api/agent/sessions/${sessionId}/runs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content, idempotencyKey: crypto.randomUUID() }),
  });
  return createRunResponseSchema.parse(await parseResponse(response));
}

export async function getRun(runId: string, signal?: AbortSignal): Promise<RunSnapshot> {
  const response = await fetch(`${apiBaseUrl}/api/agent/runs/${runId}`, { signal });
  return runSnapshotSchema.parse(await parseResponse(response));
}

export async function cancelRun(runId: string): Promise<CancelRunResponse> {
  const response = await fetch(`${apiBaseUrl}/api/agent/runs/${runId}/cancel`, { method: 'POST' });
  return cancelRunResponseSchema.parse(await parseResponse(response));
}

// 独立订阅 Run；连接关闭只结束观察，不向后端发送取消命令。
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
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';
    for (const frame of frames) {
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

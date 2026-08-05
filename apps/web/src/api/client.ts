import {
  chatStreamEventSchema,
  createSessionResponseSchema,
  deleteSessionResponseSchema,
  generateSessionTitleResponseSchema,
  listSessionsResponseSchema,
  problemDetailsSchema,
  serviceStatusSchema,
  sessionDetailResponseSchema,
  updateSessionResponseSchema,
} from '@harness/agent-protocol';
import type {
  DeleteSessionResponse,
  GenerateSessionTitleResponse,
  ProblemDetails,
  ServiceStatus,
  SessionDetailResponse,
  SessionSummary,
  UpdateSessionRequest,
} from '@harness/agent-protocol';

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

// 发送本轮内容并消费会话级标准聊天 SSE 事件。
export async function requestChatStream(
  sessionId: string,
  content: string,
  onDelta: (delta: string) => void,
): Promise<{ model: string; messageId: string }> {
  const response = await fetch(`${apiBaseUrl}/api/agent/sessions/${sessionId}/chat/stream`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify({ content }),
  });
  if (!response.ok) await parseResponse(response);
  if (!response.body) throw new Error('模型流式响应不可用。');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let model = '';
  let messageId = '';
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';
    for (const event of events) {
      const dataLine = event.split('\n').find((line) => line.startsWith('data: '));
      if (!dataLine) continue;
      const payload = chatStreamEventSchema.parse(JSON.parse(dataLine.slice(6)));
      if (payload.type === 'stream.failed') {
        throw new ApiProblem({
          type: 'https://hello-harness.local/problems/model-stream-failed',
          title: 'Model stream failed',
          status: 502,
          code: payload.code,
          detail: payload.detail,
        });
      } else if (payload.type === 'message.delta') onDelta(payload.delta);
      else if (payload.type === 'message.completed') {
        model = payload.model;
        messageId = payload.messageId;
      }
    }
    if (done) break;
  }
  if (!messageId) throw new Error('模型流没有返回完成事件。');
  return { model, messageId };
}

// 统一解析 JSON API，并将 Problem Details 转换为前端异常。
async function parseResponse(response: Response): Promise<unknown> {
  const data: unknown = await response.json();
  if (!response.ok) throw new ApiProblem(problemDetailsSchema.parse(data));
  return data;
}

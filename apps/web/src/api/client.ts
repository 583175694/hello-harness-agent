import {
  chatStreamEventSchema,
  problemDetailsSchema,
  serviceStatusSchema,
} from '@harness/agent-protocol';
import type { ChatMessage, ProblemDetails, ServiceStatus } from '@harness/agent-protocol';

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

// 发送对话历史并消费标准聊天 SSE 事件。
export async function requestChatStream(
  messages: ChatMessage[],
  onDelta: (delta: string) => void,
): Promise<{ model: string }> {
  const response = await fetch(`${apiBaseUrl}/api/agent/chat/stream`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify({ messages }),
  });
  if (!response.ok) {
    const data: unknown = await response.json();
    throw new ApiProblem(problemDetailsSchema.parse(data));
  }
  if (!response.body) throw new Error('模型流式响应不可用。');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let model = '';
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
      else if (payload.type === 'message.completed') model = payload.model;
    }
    if (done) break;
  }
  return { model };
}

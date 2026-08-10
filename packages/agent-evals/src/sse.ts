import { chatStreamEventSchema } from '@harness/agent-protocol';
import type { ChatStreamEvent } from '@harness/agent-protocol';

// 增量解析标准 SSE data 事件，正确处理网络半包和多事件 chunk。
export async function parseSseResponse(response: Response): Promise<ChatStreamEvent[]> {
  if (!response.body) throw new Error('评测 Chat 响应没有可读取的 SSE body。');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const events: ChatStreamEvent[] = [];
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const frames = buffer.split(/\r?\n\r?\n/u);
    buffer = frames.pop() ?? '';
    for (const frame of frames) {
      const data = frame.split(/\r?\n/u)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (!data) continue;
      events.push(chatStreamEventSchema.parse(JSON.parse(data)));
    }
    if (done) break;
  }
  if (buffer.trim()) throw new Error('SSE 流结束时仍存在不完整事件。');
  return events;
}

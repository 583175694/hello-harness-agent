import { runStreamEventSchema } from '@harness/agent-protocol';
import type { RunStreamEvent } from '@harness/agent-protocol';

export async function parseRunSse(
  response: Response,
  stopAfter?: (event: RunStreamEvent) => boolean,
): Promise<Array<{ event: RunStreamEvent; receivedAt: string }>> {
  if (!response.body) throw new Error('Run SSE 没有可读取的响应体。');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const observations: Array<{ event: RunStreamEvent; receivedAt: string }> = [];
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const frames = buffer.split(/\r?\n\r?\n/u);
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        const data = frame
          .split(/\r?\n/u)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        if (!data) continue;
        const event = runStreamEventSchema.parse(JSON.parse(data));
        observations.push({ event, receivedAt: new Date().toISOString() });
        if (stopAfter?.(event)) return observations;
      }
      if (done) break;
    }
    if (buffer.trim()) throw new Error('Run SSE 结束时存在不完整事件。');
    return observations;
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

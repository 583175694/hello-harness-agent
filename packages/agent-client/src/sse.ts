import { runStreamEventSchema, type RunStreamEvent } from '@harness/agent-protocol';
import type { ClientContext } from './types.js';

export function createSubscribeRun(ctx: ClientContext) {
  return async function subscribeRun(
    runId: string,
    lastEventId: number | undefined,
    onEvent: (event: RunStreamEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const response = await ctx.apiFetch(`${ctx.baseUrl}/api/agent/runs/${runId}/events`, {
      headers: {
        accept: 'text/event-stream',
        ...(lastEventId !== undefined ? { 'Last-Event-ID': String(lastEventId) } : {}),
      },
      signal,
    });
    if (!response.ok) await ctx.parseResponse(response);
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
  };
}

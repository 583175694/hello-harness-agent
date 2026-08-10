import { describe, expect, it } from 'vitest';
import { parseSseResponse } from '../src/sse.js';

describe('parseSseResponse', () => {
  it('parses split chunks and multiple standard events', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"message.delta","messageId":"m1","blockId":"b1","delta":"你'));
        controller.enqueue(encoder.encode('好"}\n\ndata: {"type":"message.completed","messageId":"m1","model":"test"}\n\n'));
        controller.close();
      },
    });
    const events = await parseSseResponse(new Response(stream));
    expect(events.map((event) => event.type)).toEqual(['message.delta', 'message.completed']);
  });

  it('rejects an incomplete final frame', async () => {
    const response = new Response('data: {"type":"message.completed"}');
    await expect(parseSseResponse(response)).rejects.toThrow('不完整事件');
  });

  it('rejects complete frames that do not match the shared protocol', async () => {
    const response = new Response('data: {"type":"unknown.event"}\n\n');
    await expect(parseSseResponse(response)).rejects.toThrow();
  });
});

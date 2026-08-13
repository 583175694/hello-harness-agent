import { describe, expect, it } from 'vitest';
import { parseSseResponse } from '../src/sse.js';

describe('parseSseResponse', () => {
  it('parses split chunks and multiple standard events', async () => {
    const encoder = new TextEncoder();
    const envelope = (seq: number, type: string, payload: object) =>
      JSON.stringify({
        version: '0.10.0',
        eventId: `run-1:${seq}`,
        seq,
        sessionId: 'session-1',
        runId: 'run-1',
        type,
        occurredAt: '2026-08-10T00:01:00.000Z',
        payload,
      });
    const delta = (text: string) => ({
      type: 'message.delta',
      messageId: 'm1',
      blockId: 'b1',
      delta: text,
      roundId: 'round-1',
      roundSequence: 1,
      blockSequence: 0,
    });
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(`data: ${envelope(1, 'message.delta', delta('你')).slice(0, 120)}`),
        );
        controller.enqueue(
          encoder.encode(
            `${envelope(1, 'message.delta', delta('你')).slice(120)}\n\ndata: ${envelope(2, 'message.delta', delta('好'))}\n\n`,
          ),
        );
        controller.close();
      },
    });
    const events = await parseSseResponse(new Response(stream));
    expect(events.map((event) => event.type)).toEqual(['message.delta', 'message.delta']);
  });

  it('rejects an incomplete final frame', async () => {
    const response = new Response('data: {"type":"message.completed"}');
    await expect(parseSseResponse(response)).rejects.toThrow('不完整事件');
  });

  it('rejects complete frames that do not match the shared protocol', async () => {
    const response = new Response(
      'data: {"version":"0.10.0","eventId":"x","seq":1,"sessionId":"s","runId":"r","type":"unknown.event","occurredAt":"2026-08-10T00:01:00.000Z","payload":{}}\n\n',
    );
    await expect(parseSseResponse(response)).rejects.toThrow();
  });
});

import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { EvalApiClient } from '../src/api-client.js';

const openedServers: Array<ReturnType<typeof createServer>> = [];

afterEach(async () => {
  await Promise.all(openedServers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

// 启动只服务于当前测试的本地 HTTP API，并返回随机监听端口。
async function startMockApi(): Promise<{ baseUrl: string; requests: Array<{ method?: string; url?: string; body: string }> }> {
  const requests: Array<{ method?: string; url?: string; body: string }> = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      requests.push({ method: request.method, url: request.url, body: Buffer.concat(chunks).toString('utf8') });
      response.setHeader('content-type', request.url?.endsWith('/stream') ? 'text/event-stream' : 'application/json');
      if (request.url === '/readyz') response.end(JSON.stringify({ status: 'ok', service: 'api', version: 'test' }));
      else if (request.method === 'POST' && request.url === '/api/agent/sessions') response.end(JSON.stringify({ session: sessionSummary() }));
      else if (request.method === 'POST' && request.url?.endsWith('/chat/stream')) {
        response.write('data: {"type":"message.delta","messageId":"assistant-1","blockId":"text-1","delta":"回');
        response.end('答"}\n\ndata: {"type":"message.completed","messageId":"assistant-1","model":"test-model"}\n\n');
      } else if (request.method === 'GET' && request.url === '/api/agent/sessions/session-1') {
        response.end(JSON.stringify({ session: { ...sessionSummary(), messages: [assistantMessage()] } }));
      } else if (request.method === 'DELETE' && request.url === '/api/agent/sessions/session-1') {
        response.end(JSON.stringify({ deletedSessionId: 'session-1' }));
      } else { response.statusCode = 404; response.end(JSON.stringify({ detail: 'not found' })); }
    });
  });
  openedServers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${address.port}`, requests };
}

// 构造符合共享协议的稳定 Session 摘要。
function sessionSummary() {
  return {
    id: 'session-1', title: '[EVAL] test', status: 'active', isPinned: false,
    createdAt: '2026-08-10T00:00:00.000Z', updatedAt: '2026-08-10T00:01:00.000Z',
  } as const;
}

// 构造已持久化的最小 assistant 消息。
function assistantMessage() {
  return {
    id: 'assistant-1', sessionId: 'session-1', role: 'assistant', kind: 'assistant_delivery',
    content: '回答', createdAt: '2026-08-10T00:01:00.000Z', metadata: {},
  } as const;
}

describe('EvalApiClient', () => {
  it('uses the production readiness, session, SSE, detail, and delete boundaries', async () => {
    const mock = await startMockApi();
    const client = new EvalApiClient(mock.baseUrl);
    await client.assertReady();
    const sessionId = await client.createSession('[EVAL] test');
    const events = await client.runChat(sessionId, '问题');
    const detail = await client.getSession(sessionId);
    await client.deleteSession(sessionId);

    expect(events.map((event) => event.type)).toEqual(['message.delta', 'message.completed']);
    expect(detail.messages[0]?.content).toBe('回答');
    expect(mock.requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      'GET /readyz',
      'POST /api/agent/sessions',
      'POST /api/agent/sessions/session-1/chat/stream',
      'GET /api/agent/sessions/session-1',
      'DELETE /api/agent/sessions/session-1',
    ]);
    expect(JSON.parse(mock.requests[2]!.body)).toEqual({ content: '问题' });
  });

  it('returns a concise Chinese readiness error when the API cannot be reached', async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    const client = new EvalApiClient(`http://127.0.0.1:${address.port}`);
    await expect(client.assertReady()).rejects.toThrow('无法连接评测 API');
  });
});

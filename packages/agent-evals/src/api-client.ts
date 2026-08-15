import {
  createRunResponseSchema,
  publicAgentConfigSchema,
  createSessionResponseSchema,
  deleteSessionResponseSchema,
  runSnapshotSchema,
  serviceStatusSchema,
  sessionDetailResponseSchema,
} from '@harness/agent-protocol';
import type {
  ChatStreamEvent,
  CreateRunResponse,
  RunSnapshot,
  RunStreamEvent,
  SessionDetail,
  PublicAgentConfig,
} from '@harness/agent-protocol';
import { parseSseResponse } from './sse.js';

export class EvalApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'EvalApiError';
  }
}

export class EvalApiClient {
  constructor(private readonly baseUrl: string) {}

  // 检查生产 API 是否就绪，评测 Runner 不隐式启动依赖服务。
  async assertReady(signal?: AbortSignal): Promise<void> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/readyz`, { signal });
    } catch (error) {
      if (error instanceof EvalApiError) throw error;
      throw new EvalApiError('无法连接评测 API，请先启动 API 并检查 --api-base-url。');
    }
    const body = await this.json(response);
    if (!response.ok)
      throw new EvalApiError('API 尚未就绪，请先启动 PostgreSQL 和 API。', response.status);
    const status = serviceStatusSchema.parse(body);
    if (status.status !== 'ok')
      throw new EvalApiError('API 尚未就绪，请先启动 PostgreSQL 和 API。', response.status);
  }

  async assertFixture(expectedHash: string, signal?: AbortSignal): Promise<void> {
    const response = await fetch(`${this.baseUrl}/readyz`, { signal });
    const status = serviceStatusSchema.parse(await this.requireJson(response));
    if (status.evalFixtureHash !== expectedHash)
      throw new EvalApiError(
        `API Fixture Hash 不匹配：expected=${expectedHash}, actual=${status.evalFixtureHash ?? 'disabled'}`,
      );
  }

  async getPublicConfig(signal?: AbortSignal): Promise<PublicAgentConfig> {
    const response = await fetch(`${this.baseUrl}/api/agent/config/public`, { signal });
    return publicAgentConfigSchema.parse(await this.requireJson(response));
  }

  // 创建一个带固定 EVAL 前缀的临时 Session。
  async createSession(title: string, signal?: AbortSignal): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/agent/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title }),
      signal,
    });
    return createSessionResponseSchema.parse(await this.requireJson(response)).session.id;
  }

  // 通过生产 Chat SSE 边界执行一道评测题并收集完整标准事件。
  async runChat(
    sessionId: string,
    content: string,
    signal?: AbortSignal,
  ): Promise<ChatStreamEvent[]> {
    const createResponse = await fetch(`${this.baseUrl}/api/agent/sessions/${sessionId}/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        content,
        idempotencyKey: crypto.randomUUID(),
        model: 'deepseek-v4-flash',
      }),
      signal,
    });
    const run = createRunResponseSchema.parse(await this.requireJson(createResponse));
    const eventsResponse = await fetch(`${this.baseUrl}${run.eventsUrl}`, {
      headers: { accept: 'text/event-stream' },
      signal,
    });
    if (!eventsResponse.ok) await this.requireJson(eventsResponse);
    return parseSseResponse(eventsResponse);
  }

  async createRun(
    sessionId: string,
    content: string,
    input: { model?: string; reasoningEffort?: 'off' | 'low' | 'high' | 'max' } = {},
    signal?: AbortSignal,
  ): Promise<CreateRunResponse> {
    const response = await fetch(`${this.baseUrl}/api/agent/sessions/${sessionId}/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        content,
        idempotencyKey: crypto.randomUUID(),
        model: input.model ?? 'deepseek-v4-flash',
        ...(input.reasoningEffort ? { reasoningEffort: input.reasoningEffort } : {}),
      }),
      signal,
    });
    return createRunResponseSchema.parse(await this.requireJson(response));
  }

  async subscribeRun(
    run: Pick<CreateRunResponse, 'eventsUrl'>,
    input: {
      lastEventId?: number;
      stopAfter?: (event: RunStreamEvent) => boolean;
      signal?: AbortSignal;
    } = {},
  ): Promise<Array<{ event: RunStreamEvent; receivedAt: string }>> {
    const response = await fetch(`${this.baseUrl}${run.eventsUrl}`, {
      headers: {
        accept: 'text/event-stream',
        ...(input.lastEventId !== undefined ? { 'last-event-id': String(input.lastEventId) } : {}),
      },
      signal: input.signal,
    });
    if (!response.ok) await this.requireJson(response);
    if (!response.body) throw new EvalApiError('Run SSE 没有可读取的响应体。');
    const { parseRunSse } = await import('./core/sse.js');
    return parseRunSse(response, input.stopAfter);
  }

  async getRun(runId: string, signal?: AbortSignal): Promise<RunSnapshot> {
    const response = await fetch(`${this.baseUrl}/api/agent/runs/${runId}`, { signal });
    return runSnapshotSchema.parse(await this.requireJson(response));
  }

  // 读取完成后的持久化消息、执行和来源快照。
  async getSession(sessionId: string, signal?: AbortSignal): Promise<SessionDetail> {
    const response = await fetch(`${this.baseUrl}/api/agent/sessions/${sessionId}`, { signal });
    return sessionDetailResponseSchema.parse(await this.requireJson(response)).session;
  }

  // 删除评测临时 Session，避免污染正常会话列表。
  async deleteSession(sessionId: string, signal?: AbortSignal): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/agent/sessions/${sessionId}`, {
      method: 'DELETE',
      signal,
    });
    deleteSessionResponseSchema.parse(await this.requireJson(response));
  }

  // 对 JSON API 统一处理非成功状态并避免输出敏感响应细节。
  private async requireJson(response: Response): Promise<unknown> {
    const body = await this.json(response);
    if (!response.ok) {
      const detail =
        typeof body === 'object' &&
        body !== null &&
        'detail' in body &&
        typeof body.detail === 'string'
          ? body.detail
          : `HTTP ${response.status}`;
      throw new EvalApiError(detail, response.status);
    }
    return body;
  }

  // 安全解析 JSON 响应，损坏响应只返回简洁错误。
  private async json(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      throw new EvalApiError(`API 返回了无效 JSON（HTTP ${response.status}）。`, response.status);
    }
  }
}

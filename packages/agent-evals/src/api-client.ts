import {
  createSessionResponseSchema,
  deleteSessionResponseSchema,
  serviceStatusSchema,
  sessionDetailResponseSchema,
} from '@harness/agent-protocol';
import type { ChatStreamEvent, SessionDetail } from '@harness/agent-protocol';
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
    const response = await fetch(`${this.baseUrl}/api/agent/sessions/${sessionId}/chat/stream`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify({ content }),
      signal,
    });
    if (!response.ok) await this.requireJson(response);
    return parseSseResponse(response);
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

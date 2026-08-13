import type { Response } from 'express';

// 统一 SSE 头、事件序列化和结束动作，Controller 不再拼接传输细节。
export class SseEventWriter {
  constructor(private readonly response: Response) {}

  // 写入标准 SSE 响应头并立即刷新给客户端。
  open(): void {
    this.response.status(200);
    this.response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    this.response.setHeader('Cache-Control', 'no-cache, no-transform');
    this.response.setHeader('Connection', 'keep-alive');
    this.response.setHeader('X-Accel-Buffering', 'no');
    this.response.flushHeaders();
  }

  // 序列化一条 data 事件，避免业务层重复处理换行边界。
  write(event: unknown): void {
    if (!this.response.writableEnded) this.response.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  writeEvent(event: { seq: number; type: string }): void {
    if (this.response.writableEnded) return;
    this.response.write(
      `id: ${event.seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
    );
  }

  comment(value: string): void {
    if (!this.response.writableEnded) this.response.write(`: ${value}\n\n`);
  }

  // 结束 SSE 响应。
  close(): void {
    if (!this.response.writableEnded) this.response.end();
  }
}

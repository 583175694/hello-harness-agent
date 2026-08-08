import { ConflictException, Injectable } from '@nestjs/common';
import { AGENT_ERROR_CODES } from '@harness/agent-protocol';

@Injectable()
export class SessionExecutionRegistry {
  // 记录当前进程内正在生成回复的会话，用于阻止同会话并发和执行中删除。
  private readonly activeSessionIds = new Set<string>();

  // 获取会话执行权，同一会话只允许一个活跃聊天流。
  acquire(sessionId: string): void {
    if (this.activeSessionIds.has(sessionId)) {
      throw new ConflictException({
        code: AGENT_ERROR_CODES.sessionBusy,
        detail: '该会话正在生成回复，请等待完成后再操作。',
      });
    }
    this.activeSessionIds.add(sessionId);
  }

  // 释放会话执行权，允许后续发送或删除。
  release(sessionId: string): void {
    this.activeSessionIds.delete(sessionId);
  }

  // 判断会话是否仍有活跃的模型流。
  isActive(sessionId: string): boolean {
    return this.activeSessionIds.has(sessionId);
  }
}

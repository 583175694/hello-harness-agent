import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AGENT_PROTOCOL_LIMITS } from '@harness/agent-protocol';
import { ENV_KEYS } from '../bootstrap/env.constants';
import { ModelAdapter } from '../model/model-adapter';

@Injectable()
export class SessionTitleService {
  constructor(
    private readonly config: ConfigService,
    private readonly model: ModelAdapter,
  ) {}

  // 使用主模型将首轮问答压缩为单行短标题。
  async generate(userContent: string, assistantContent: string): Promise<string> {
    const content = await this.model.generateText(
      this.config.getOrThrow<string>(ENV_KEYS.openAiModel),
      [
        {
          role: 'system',
          content: `根据首轮对话生成简体中文会话标题。只输出标题，不加引号或标点，最多 ${AGENT_PROTOCOL_LIMITS.sessionTitleMaxLength} 个字符。`,
        },
        { role: 'user', content: `用户：${userContent}\n助手：${assistantContent}` },
      ],
    );
    const title = content
      .replace(/[\r\n]+/g, ' ')
      .replace(/^[\s"“”'‘’]+|[\s"“”'‘’]+$/g, '')
      .replace(/\s+/g, ' ')
      .slice(0, AGENT_PROTOCOL_LIMITS.sessionTitleMaxLength);
    if (!title) throw new Error('EmptyGeneratedTitle');
    return title;
  }
}

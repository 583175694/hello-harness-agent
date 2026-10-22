import type { PersistedMessage } from '@harness/agent-protocol';

import type { MobileConversationItem } from '../fixtures/mobile-preview.types';

/** P1：历史消息最小映射；P2+ 与共享 reducer / map-conversation 对齐。 */
export function mapPersistedMessagesToMobileConversation(
  messages: PersistedMessage[],
): MobileConversationItem[] {
  const items: MobileConversationItem[] = [];
  for (const message of messages) {
    if (message.role === 'user') {
      items.push({ kind: 'user', content: message.content });
      continue;
    }
    items.push({
      kind: 'assistant',
      deliveryStatus: message.deliveryStatus ?? 'completed',
      blocks: message.content.trim()
        ? [{ type: 'text', content: message.content }]
        : [],
    });
  }
  return items;
}

import { memo } from 'react';

import type { MobileConversationItem } from '../fixtures/mobile-preview.types';
import type { WorkbenchOpenRequest } from './workbench-activity-view';
import { UserMessageBubble } from './agent-elements/user-message-bubble';
import { AssistantTurnContent } from './assistant-turn-content';

type ConversationTurnRowProps = {
  item: MobileConversationItem;
  apiBaseUrl: string;
  previewLegacyBlocks: boolean;
  onOpenWorkbench?: (request?: WorkbenchOpenRequest) => void;
};

function ConversationTurnRowInner({
  item,
  apiBaseUrl,
  previewLegacyBlocks,
  onOpenWorkbench,
}: ConversationTurnRowProps) {
  if (item.kind === 'user') {
    return (
      <UserMessageBubble
        content={item.content}
        pendingState={item.pendingState}
        attachmentHint={item.attachmentHint}
        attachments={item.attachments}
        apiBaseUrl={apiBaseUrl}
        skillNames={item.skillNames}
      />
    );
  }
  return (
    <AssistantTurnContent
      deliveryStatus={item.deliveryStatus}
      streaming={item.streaming}
      errorDetail={item.errorDetail}
      process={item.process}
      pendingText={item.pendingText}
      finalText={item.finalText}
      blocks={item.blocks}
      showQuickActions={item.showQuickActions}
      previewLegacyBlocks={previewLegacyBlocks}
      onOpenWorkbench={onOpenWorkbench}
    />
  );
}

export const ConversationTurnRow = memo(
  ConversationTurnRowInner,
  (prev, next) =>
    prev.item === next.item &&
    prev.apiBaseUrl === next.apiBaseUrl &&
    prev.previewLegacyBlocks === next.previewLegacyBlocks &&
    prev.onOpenWorkbench === next.onOpenWorkbench,
);

import { ScrollView, View } from 'react-native';
import { Text } from '@/components/ui/text';
import type { MobileConversationItem } from '../fixtures/mobile-preview.types';
import { defaultAuthRefactorFixture } from '../fixtures/mobile-preview';
import type { WorkspaceView } from '../fixtures/ui-fixtures';
import { UserMessageBubble } from './agent-elements/user-message-bubble';
import { AssistantTurnContent } from './assistant-turn-content';

type ConversationPanelProps = {
  conversation?: MobileConversationItem[];
  bottomInset?: number;
  onOpenWorkbench?: (view?: WorkspaceView) => void;
};

export function ConversationPanel({
  conversation = defaultAuthRefactorFixture().conversation,
  bottomInset = 24,
  onOpenWorkbench,
}: ConversationPanelProps) {
  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerStyle={{ gap: 24, paddingHorizontal: 16, paddingTop: 8, paddingBottom: bottomInset }}
      showsVerticalScrollIndicator={false}
    >
      {conversation.length === 0 ? (
        <View className="items-center py-20">
          <Text variant="body-sm" className="text-muted">
            描述任务即可开始
          </Text>
        </View>
      ) : null}

      {conversation.map((item, index) => {
        if (item.kind === 'user') {
          return (
            <UserMessageBubble
              key={`user-${index}`}
              content={item.content}
              pendingState={item.pendingState}
              attachmentHint={item.attachmentHint}
            />
          );
        }
        return (
          <AssistantTurnContent
            key={`assistant-${index}`}
            deliveryStatus={item.deliveryStatus}
            streaming={item.streaming}
            errorDetail={item.errorDetail}
            blocks={item.blocks}
            showQuickActions={item.showQuickActions}
            onOpenWorkbench={onOpenWorkbench}
          />
        );
      })}
    </ScrollView>
  );
}

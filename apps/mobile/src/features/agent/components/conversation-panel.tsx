import { FlashList } from '@shopify/flash-list';
import { useCallback } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import type { MobileConversationItem } from '../fixtures/mobile-preview.types';
import { defaultAuthRefactorFixture } from '../fixtures/mobile-preview';
import type { WorkspaceView } from '../fixtures/ui-fixtures';
import { UserMessageBubble } from './agent-elements/user-message-bubble';
import { AssistantTurnContent } from './assistant-turn-content';

const TURN_GAP = 24;

type ConversationPanelProps = {
  conversation?: MobileConversationItem[];
  bottomInset?: number;
  scrollEnabled?: boolean;
  onOpenWorkbench?: (view?: WorkspaceView) => void;
};

function ConversationEmpty() {
  return (
    <View className="items-center py-20">
      <Text variant="body-sm" className="text-muted">
        描述任务即可开始
      </Text>
    </View>
  );
}

function TurnSeparator() {
  return <View style={{ height: TURN_GAP }} />;
}

export function ConversationPanel({
  conversation = defaultAuthRefactorFixture().conversation,
  bottomInset = 24,
  scrollEnabled = true,
  onOpenWorkbench,
}: ConversationPanelProps) {
  const keyExtractor = useCallback(
    (item: MobileConversationItem, index: number) => `${item.kind}-${index}`,
    [],
  );

  const getItemType = useCallback((item: MobileConversationItem) => item.kind, []);

  const renderItem = useCallback(
    ({ item }: { item: MobileConversationItem }) => {
      if (item.kind === 'user') {
        return (
          <UserMessageBubble
            content={item.content}
            pendingState={item.pendingState}
            attachmentHint={item.attachmentHint}
            skillNames={item.skillNames}
          />
        );
      }
      return (
        <AssistantTurnContent
          deliveryStatus={item.deliveryStatus}
          streaming={item.streaming}
          errorDetail={item.errorDetail}
          blocks={item.blocks}
          showQuickActions={item.showQuickActions}
          onOpenWorkbench={onOpenWorkbench}
        />
      );
    },
    [onOpenWorkbench],
  );

  return (
    <View className="flex-1 bg-canvas">
      <FlashList
        data={conversation}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemType={getItemType}
        ItemSeparatorComponent={TurnSeparator}
        ListEmptyComponent={ConversationEmpty}
        scrollEnabled={scrollEnabled}
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: bottomInset,
        }}
      />
    </View>
  );
}

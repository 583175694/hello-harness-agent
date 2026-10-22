import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import type { MobileConversationItem } from '../fixtures/mobile-preview.types';
import { defaultAuthRefactorFixture } from '../fixtures/mobile-preview';
import { AGENT_UI_BEHAVIOR } from '../config/ui.constants';
import type { WorkbenchOpenRequest } from './workbench-activity-view';
import { UserMessageBubble } from './agent-elements/user-message-bubble';
import { AssistantTurnContent } from './assistant-turn-content';
import { ConversationEmptyHero } from './conversation-empty-hero';

const TURN_GAP = 24;

type ConversationPanelProps = {
  conversation?: MobileConversationItem[];
  apiBaseUrl?: string;
  bottomInset?: number;
  scrollEnabled?: boolean;
  /** 无消息时展示 Web 同款 landing（品牌 + 欢迎语）。 */
  landingLayout?: boolean;
  onOpenWorkbench?: (request?: WorkbenchOpenRequest) => void;
};

function TurnSeparator() {
  return <View style={{ height: TURN_GAP }} />;
}

function distanceFromBottom(event: NativeScrollEvent): number {
  return event.contentSize.height - event.contentOffset.y - event.layoutMeasurement.height;
}

export function ConversationPanel({
  conversation = defaultAuthRefactorFixture().conversation,
  apiBaseUrl = '',
  bottomInset = 24,
  scrollEnabled = true,
  landingLayout = false,
  onOpenWorkbench,
}: ConversationPanelProps) {
  const listRef = useRef<FlashListRef<MobileConversationItem>>(null);
  const stickToBottomRef = useRef(true);

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
          onOpenWorkbench={onOpenWorkbench}
        />
      );
    },
    [apiBaseUrl, onOpenWorkbench],
  );

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    stickToBottomRef.current =
      distanceFromBottom(event.nativeEvent) < AGENT_UI_BEHAVIOR.stickToBottomThresholdPx;
  }, []);

  const assistantTailStreaming = useMemo(() => {
    const tail = conversation.at(-1);
    if (tail?.kind !== 'assistant') return false;
    return tail.streaming === true || tail.deliveryStatus === 'streaming';
  }, [conversation]);

  useEffect(() => {
    if (!stickToBottomRef.current || conversation.length === 0) return;
    /** Mobile：流式生成时不强制吸底，避免长回复把用户正在阅读的内容顶走（Web 仍吸底）。 */
    if (assistantTailStreaming) return;
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: false });
    });
  }, [conversation, assistantTailStreaming]);

  return (
    <View className="flex-1 bg-canvas">
      <FlashList
        ref={listRef}
        data={conversation}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemType={getItemType}
        ItemSeparatorComponent={TurnSeparator}
        ListEmptyComponent={landingLayout ? ConversationEmptyHero : undefined}
        scrollEnabled={scrollEnabled}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
        contentContainerStyle={
          landingLayout && conversation.length === 0
            ? {
                flexGrow: 1,
                justifyContent: 'center',
                paddingHorizontal: 16,
                paddingBottom: bottomInset,
              }
            : {
                paddingHorizontal: 16,
                paddingTop: 12,
                paddingBottom: bottomInset,
              }
        }
      />
    </View>
  );
}

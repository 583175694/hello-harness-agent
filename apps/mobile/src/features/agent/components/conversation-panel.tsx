import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { conversationScrollGuard } from '../lib/conversation-scroll-guard';
import type { MobileConversationItem } from '../fixtures/mobile-preview.types';
import { defaultAuthRefactorFixture } from '../fixtures/mobile-preview';
import { AGENT_UI_BEHAVIOR } from '../config/ui.constants';
import type { WorkbenchOpenRequest } from './workbench-activity-view';
import { ConversationEmptyHero } from './conversation-empty-hero';
import { ConversationTurnRow } from './conversation-turn-row';

const TURN_GAP = 24;

type ConversationPanelProps = {
  conversation?: MobileConversationItem[];
  apiBaseUrl?: string;
  bottomInset?: number;
  scrollEnabled?: boolean;
  /** 无消息时展示 Web 同款 landing（品牌 + 欢迎语）。 */
  landingLayout?: boolean;
  previewLegacyBlocks?: boolean;
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
  previewLegacyBlocks = false,
  onOpenWorkbench,
}: ConversationPanelProps) {
  const listRef = useRef<FlashListRef<MobileConversationItem>>(null);
  const stickToBottomRef = useRef(true);
  const userScrollingRef = useRef(false);

  const keyExtractor = useCallback((item: MobileConversationItem, index: number) => {
    if (item.id) return item.id;
    return `${item.kind}-${index}`;
  }, []);

  const getItemType = useCallback((item: MobileConversationItem) => item.kind, []);

  const renderItem = useCallback(
    ({ item }: { item: MobileConversationItem }) => (
      <ConversationTurnRow
        item={item}
        apiBaseUrl={apiBaseUrl}
        previewLegacyBlocks={previewLegacyBlocks}
        onOpenWorkbench={onOpenWorkbench}
      />
    ),
    [apiBaseUrl, onOpenWorkbench, previewLegacyBlocks],
  );

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    stickToBottomRef.current =
      distanceFromBottom(event.nativeEvent) < AGENT_UI_BEHAVIOR.stickToBottomThresholdPx;
  }, []);

  const tail = conversation.at(-1);
  const assistantTailStreaming =
    tail?.kind === 'assistant' &&
    (tail.streaming === true || tail.deliveryStatus === 'streaming');

  const listExtraData = useMemo(() => {
    if (tail?.kind === 'assistant') {
      return `${tail.pendingText ?? ''}|${tail.finalText ?? ''}|${tail.deliveryStatus ?? ''}`;
    }
    return conversation.length;
  }, [conversation.length, tail]);

  useEffect(() => {
    if (userScrollingRef.current || !stickToBottomRef.current || conversation.length === 0) return;
    /** Mobile：流式生成时不强制吸底，避免长回复把用户正在阅读的内容顶走（Web 仍吸底）。 */
    if (assistantTailStreaming) return;
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: false });
    });
  }, [conversation.length, listExtraData, assistantTailStreaming]);

  const handleScrollBeginDrag = useCallback(() => {
    userScrollingRef.current = true;
    conversationScrollGuard.setScrolling(true);
  }, []);

  const endUserScroll = useCallback(() => {
    userScrollingRef.current = false;
    conversationScrollGuard.setScrolling(false);
  }, []);

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
        onScrollBeginDrag={handleScrollBeginDrag}
        onScrollEndDrag={endUserScroll}
        onMomentumScrollEnd={endUserScroll}
        scrollEventThrottle={16}
        extraData={listExtraData}
        maintainVisibleContentPosition={
          assistantTailStreaming ? { autoscrollToBottomThreshold: 48 } : undefined
        }
        drawDistance={280}
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
                paddingTop: 6,
                paddingBottom: bottomInset,
              }
        }
      />
    </View>
  );
}

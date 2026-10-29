import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';
import { conversationScrollGuard } from '../lib/conversation-scroll-guard';
import type { MobileConversationItem } from '../fixtures/mobile-preview.types';
import { defaultAuthRefactorFixture } from '../fixtures/mobile-preview';
import type { WorkbenchOpenRequest } from './workbench-activity-view';
import { ConversationEmptyHero } from './conversation-empty-hero';
import { ConversationTurnRow } from './conversation-turn-row';

const TURN_GAP = 24;

type ConversationPanelProps = {
  conversation?: MobileConversationItem[];
  /** 切换会话时滚到底部 */
  sessionScrollKey?: string;
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

export function ConversationPanel({
  conversation = defaultAuthRefactorFixture().conversation,
  sessionScrollKey = 'default',
  apiBaseUrl = '',
  bottomInset = 0,
  scrollEnabled = true,
  landingLayout = false,
  previewLegacyBlocks = false,
  onOpenWorkbench,
}: ConversationPanelProps) {
  const listRef = useRef<FlashListRef<MobileConversationItem>>(null);
  const userScrollingRef = useRef(false);
  const trackedUserTurnsRef = useRef(0);
  const trackedSessionKeyRef = useRef(sessionScrollKey);

  const userTurnCount = useMemo(
    () => conversation.filter((item) => item.kind === 'user').length,
    [conversation],
  );

  const scrollToBottom = useCallback(() => {
    if (conversation.length === 0) return;
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: false });
    });
  }, [conversation.length]);

  useEffect(() => {
    if (sessionScrollKey !== trackedSessionKeyRef.current) {
      trackedSessionKeyRef.current = sessionScrollKey;
      trackedUserTurnsRef.current = userTurnCount;
      scrollToBottom();
      return;
    }
  }, [sessionScrollKey, scrollToBottom, userTurnCount]);

  useEffect(() => {
    if (userTurnCount <= trackedUserTurnsRef.current) return;
    trackedUserTurnsRef.current = userTurnCount;
    if (conversation.at(-1)?.kind !== 'user') return;
    if (userScrollingRef.current) return;
    scrollToBottom();
  }, [conversation, scrollToBottom, userTurnCount]);

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
        onScrollBeginDrag={handleScrollBeginDrag}
        onScrollEndDrag={endUserScroll}
        onMomentumScrollEnd={endUserScroll}
        scrollEventThrottle={16}
        extraData={conversation.length}
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

import { FlashList } from '@shopify/flash-list';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { UI_HIT_SLOP, UI_HIT_SLOP_ICON } from '@/lib/ui-hit-slop';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { SessionSummary } from '@harness/agent-protocol';
import { ChevronLeft, Plus, Search, Settings } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/cn';
import { OVERLAY_MOTION_MS, OVERLAY_REDUCE_OPACITY_MS } from '@/lib/use-modal-animation-type';
import { useReducedMotion } from '@/lib/use-reduced-motion';
import { useThemeColors } from '@/lib/use-theme-colors';
import { AGENT_UI_COPY } from '../config/ui.constants';
import { sessionSummaryToDrawerItem } from '../lib/session-utils';
import { sessionDrawerFixture, type SessionDrawerItemFixture } from '../fixtures/ui-fixtures';
import { SessionDrawerMenu } from './session-drawer-menu';

const PANEL_WIDTH_RATIO = 0.78;
const MOTION_EASING = Easing.out(Easing.quad);
type SessionDrawerProps = {
  visible: boolean;
  /** Skip slide-out when navigating forward (e.g. Settings push). */
  exitInstant?: boolean;
  onClose?: () => void;
  onOpenSettings?: () => void;
  /** 生产路径：API 会话列表；缺省为 fixture（Preview）。 */
  dataSource?: 'api' | 'fixture';
  sessions?: SessionSummary[];
  selectedSessionId?: string | null;
  onSelectSession?: (sessionId: string) => void;
  onCreateSession?: () => void;
  onRenameSession?: (sessionId: string, title: string) => void;
  onTogglePinSession?: (sessionId: string, isPinned: boolean) => void;
  onDeleteSession?: (sessionId: string) => void;
  /** 有进行中 Run 的 sessionId（Drawer 绿点） */
  activeRunSessionId?: string | null;
  /** 下拉刷新会话列表（打开 Drawer 不自动请求，由用户主动刷新）。 */
  onRefreshSessions?: () => void | Promise<void>;
  sessionsRefreshing?: boolean;
};

type DrawerFlashItem =
  | { kind: 'section'; id: string; label: string }
  | { kind: 'draft'; id: 'draft' }
  | { kind: 'session'; id: string; item: SessionDrawerItemFixture }
  | { kind: 'empty'; id: 'empty' };

const SessionDrawerRow = memo(function SessionDrawerRow({
  item,
  onPress,
  onLongPress,
}: {
  item: SessionDrawerItemFixture;
  onPress?: () => void;
  onLongPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      hitSlop={UI_HIT_SLOP}
      className={cn(
        'relative min-h-12 justify-center rounded-xl px-3 py-2.5',
        item.active ? 'bg-surface-hover' : 'active:bg-subtle-pressed',
      )}
    >
      <View className="flex-row items-center gap-2">
        {item.running ? <View className="h-2 w-2 shrink-0 rounded-full bg-approval-text" /> : null}
        <View className="min-w-0 flex-1 flex-row items-baseline justify-between gap-2">
          <Text
            variant="body-sm"
            className={cn('flex-1 truncate', item.active ? 'font-semibold' : 'font-medium')}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          <Text variant="caption" className="shrink-0 text-muted">
            {item.time}
          </Text>
        </View>
      </View>
    </Pressable>
  );
});

function SessionDrawerInner({
  visible,
  exitInstant = false,
  onClose,
  onOpenSettings,
  dataSource = 'fixture',
  sessions = [],
  selectedSessionId = null,
  onSelectSession,
  onCreateSession,
  onRenameSession,
  onTogglePinSession,
  onDeleteSession,
  activeRunSessionId = null,
  onRefreshSessions,
  sessionsRefreshing = false,
}: SessionDrawerProps) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const panelWidth = useMemo(() => windowWidth * PANEL_WIDTH_RATIO, [windowWidth]);
  const reduceMotion = useReducedMotion();
  const themeColors = useThemeColors();

  const [modalShown, setModalShown] = useState(false);
  const modalMountedRef = useRef(false);
  const openMotionFrameRef = useRef<number | null>(null);
  const panelTranslateX = useSharedValue(-panelWidth);
  const scrimOpacity = useSharedValue(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [menuSession, setMenuSession] = useState<SessionSummary | null>(null);
  const hideModal = useCallback(() => {
    modalMountedRef.current = false;
    setModalShown(false);
  }, []);

  const startOpenMotion = useCallback(() => {
    if (!modalMountedRef.current) return;
    if (reduceMotion) {
      panelTranslateX.value = 0;
      scrimOpacity.value = withTiming(1, {
        duration: OVERLAY_REDUCE_OPACITY_MS,
        easing: MOTION_EASING,
      });
      return;
    }
    scrimOpacity.value = withTiming(1, {
      duration: OVERLAY_MOTION_MS,
      easing: MOTION_EASING,
    });
    panelTranslateX.value = withTiming(0, {
      duration: OVERLAY_MOTION_MS,
      easing: MOTION_EASING,
    });
  }, [panelTranslateX, reduceMotion, scrimOpacity]);

  useEffect(() => {
    panelTranslateX.value = -panelWidth;
  }, [panelWidth, panelTranslateX]);

  useEffect(() => {
    if (visible) {
      modalMountedRef.current = true;
      setModalShown(true);
      panelTranslateX.value = -panelWidth;
      scrimOpacity.value = 0;
      if (openMotionFrameRef.current !== null) {
        cancelAnimationFrame(openMotionFrameRef.current);
      }
      openMotionFrameRef.current = requestAnimationFrame(() => {
        openMotionFrameRef.current = requestAnimationFrame(() => {
          openMotionFrameRef.current = null;
          startOpenMotion();
        });
      });
      return () => {
        if (openMotionFrameRef.current !== null) {
          cancelAnimationFrame(openMotionFrameRef.current);
          openMotionFrameRef.current = null;
        }
      };
    }

    if (!modalMountedRef.current) {
      return;
    }

    if (exitInstant) {
      panelTranslateX.value = -panelWidth;
      scrimOpacity.value = 0;
      hideModal();
      return;
    }

    if (reduceMotion) {
      scrimOpacity.value = withTiming(
        0,
        { duration: OVERLAY_REDUCE_OPACITY_MS, easing: MOTION_EASING },
        (finished) => {
          if (finished) {
            panelTranslateX.value = -panelWidth;
            runOnJS(hideModal)();
          }
        },
      );
    } else {
      panelTranslateX.value = withTiming(
        -panelWidth,
        { duration: OVERLAY_MOTION_MS, easing: MOTION_EASING },
        (finished) => {
          if (finished) runOnJS(hideModal)();
        },
      );
      scrimOpacity.value = withTiming(0, {
        duration: OVERLAY_MOTION_MS,
        easing: MOTION_EASING,
      });
    }
  }, [
    visible,
    exitInstant,
    panelWidth,
    reduceMotion,
    hideModal,
    panelTranslateX,
    scrimOpacity,
    startOpenMotion,
  ]);

  const panelAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: panelTranslateX.value }],
  }));

  const scrimAnimatedStyle = useAnimatedStyle(() => ({
    opacity: scrimOpacity.value,
  }));

  const drawerItems = useMemo((): SessionDrawerItemFixture[] => {
    if (dataSource === 'fixture') {
      return sessionDrawerFixture;
    }
    const query = searchQuery.trim().toLowerCase();
    const filtered = query
      ? sessions.filter((session) => session.title.toLowerCase().includes(query))
      : sessions;
    return filtered.map((session) =>
      sessionSummaryToDrawerItem(session, {
        active: session.id === selectedSessionId,
        running: Boolean(activeRunSessionId && session.id === activeRunSessionId),
      }),
    );
  }, [activeRunSessionId, dataSource, searchQuery, sessions, selectedSessionId]);

  const pinned = useMemo(() => drawerItems.filter((item) => item.pinned), [drawerItems]);
  const recent = useMemo(() => drawerItems.filter((item) => !item.pinned), [drawerItems]);

  const inDraftMode = dataSource === 'api' && selectedSessionId === null;

  const flashListData = useMemo((): DrawerFlashItem[] => {
    if (dataSource === 'api' && sessions.length === 0 && !searchQuery.trim() && !inDraftMode) {
      return [{ kind: 'empty', id: 'empty' }];
    }
    const items: DrawerFlashItem[] = [];
    if (inDraftMode && !searchQuery.trim()) {
      items.push({ kind: 'draft', id: 'draft' });
    }
    if (pinned.length > 0) {
      items.push({ kind: 'section', id: 'sec-pinned', label: '置顶' });
      for (const item of pinned) {
        items.push({ kind: 'session', id: item.id, item });
      }
    }
    items.push({ kind: 'section', id: 'sec-recent', label: '最近' });
    for (const item of recent) {
      items.push({ kind: 'session', id: item.id, item });
    }
    return items;
  }, [dataSource, inDraftMode, pinned, recent, searchQuery, sessions.length]);

  const sessionById = useMemo(() => new Map(sessions.map((s) => [s.id, s])), [sessions]);

  const handleSelect = useCallback(
    (sessionId: string) => {
      onSelectSession?.(sessionId);
      onClose?.();
    },
    [onClose, onSelectSession],
  );

  const openRowMenu = useCallback(
    (sessionId: string) => {
      const session = sessionById.get(sessionId);
      if (session) setMenuSession(session);
    },
    [sessionById],
  );

  const renderFlashItem = useCallback(
    ({ item }: { item: DrawerFlashItem }) => {
      if (item.kind === 'section') {
        return (
          <Text variant="caption" className="mb-1 px-1 pt-1 text-muted">
            {item.label}
          </Text>
        );
      }
      if (item.kind === 'draft') {
        return (
          <View className="mb-1 min-h-11 justify-center rounded-lg bg-surface-hover px-3 py-2.5">
            <Text variant="body-sm" className="font-semibold text-primary" numberOfLines={1}>
              {AGENT_UI_COPY.defaultSessionTitle}
            </Text>
          </View>
        );
      }
      if (item.kind === 'empty') {
        return (
          <Text variant="body-sm" className="px-1 py-4 text-muted">
            暂无会话，点击「新对话」创建。
          </Text>
        );
      }
      return (
        <SessionDrawerRow
          item={item.item}
          onPress={dataSource === 'api' ? () => handleSelect(item.item.id) : undefined}
          onLongPress={dataSource === 'api' ? () => openRowMenu(item.item.id) : undefined}
        />
      );
    },
    [dataSource, handleSelect, openRowMenu],
  );

  const flashKeyExtractor = useCallback((item: DrawerFlashItem) => item.id, []);

  const flashGetItemType = useCallback((item: DrawerFlashItem) => item.kind, []);

  const refreshControl =
    dataSource === 'api' && onRefreshSessions ? (
      <RefreshControl
        refreshing={sessionsRefreshing}
        onRefresh={() => void onRefreshSessions()}
        tintColor={themeColors.secondary}
        colors={[themeColors.primary]}
      />
    ) : undefined;

  if (!modalShown) {
    return dataSource === 'api' ? (
      <SessionDrawerMenu
        session={menuSession}
        visible={menuSession !== null}
        onClose={() => setMenuSession(null)}
        onRename={(sessionId, title) => onRenameSession?.(sessionId, title)}
        onTogglePin={(sessionId, isPinned) => onTogglePinSession?.(sessionId, isPinned)}
        onDelete={(sessionId) => onDeleteSession?.(sessionId)}
      />
    ) : null;
  }

  return (
    <>
      <View
        pointerEvents="box-none"
        style={[StyleSheet.absoluteFill, { zIndex: 360, elevation: 28 }]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="关闭会话列表"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        >
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: themeColors.overlayScrim },
              scrimAnimatedStyle,
            ]}
          />
        </Pressable>

          <Pressable
            className="absolute bottom-0 right-0 top-0 items-center active:opacity-90"
            style={{ left: panelWidth, paddingTop: insets.top }}
            onPress={onClose}
            hitSlop={UI_HIT_SLOP_ICON}
            accessibilityRole="button"
            accessibilityLabel="关闭会话列表"
          >
            <View className="mt-2 h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/40">
              <Icon icon={ChevronLeft} tone="overlayInverse" size={18} />
            </View>
          </Pressable>

          <Animated.View
            className="border-r border-composer-border bg-drawer"
            style={[
              {
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: panelWidth,
                paddingTop: insets.top,
              },
              panelAnimatedStyle,
            ]}
          >
            <View className="min-h-0 flex-1 px-4 pt-3">
              <Pressable
                hitSlop={UI_HIT_SLOP}
                className={`mb-3 min-h-12 flex-row items-center gap-2 rounded-xl bg-surface px-2 active:bg-subtle-pressed ${
                  inDraftMode ? 'opacity-45' : ''
                }`}
                accessibilityRole="button"
                accessibilityLabel="新建会话"
                accessibilityState={{ disabled: inDraftMode }}
                disabled={inDraftMode}
                onPress={() => {
                  if (inDraftMode) return;
                  onCreateSession?.();
                  onClose?.();
                }}
              >
                <Icon icon={Plus} tone="primary" size={20} textWeight="semibold" />
                <Text variant="body" className="font-semibold text-primary">
                  新对话
                </Text>
              </Pressable>

              <View className="relative mb-3">
                <View className="pointer-events-none absolute bottom-0 left-3 top-0 justify-center">
                  <Icon icon={Search} tone="muted" size={16} />
                </View>
                <Input
                  className="h-10 pl-9"
                  placeholder="搜索会话"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
              </View>

              <View className="min-h-0 flex-1">
                <FlashList
                  data={flashListData}
                  renderItem={renderFlashItem}
                  keyExtractor={flashKeyExtractor}
                  getItemType={flashGetItemType}
                  refreshControl={refreshControl}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  overScrollMode="never"
                  style={{ flex: 1 }}
                />
              </View>
            </View>

            <View
              className="border-t border-composer-border px-4 pt-2"
              style={{ paddingBottom: Math.max(insets.bottom, 12) }}
            >
              <Pressable
                onPress={onOpenSettings}
                hitSlop={UI_HIT_SLOP}
                className="min-h-12 flex-row items-center gap-2.5 rounded-xl px-1 active:bg-subtle"
                accessibilityRole="button"
                accessibilityLabel="设置"
                testID="session-drawer-settings"
              >
                <Icon icon={Settings} tone="secondary" size={20} />
                <Text variant="body-sm" className="font-medium text-primary">
                  设置
                </Text>
              </Pressable>
            </View>
          </Animated.View>
      </View>

      {dataSource === 'api' ? (
        <SessionDrawerMenu
          session={menuSession}
          visible={menuSession !== null}
          onClose={() => setMenuSession(null)}
          onRename={(sessionId, title) => onRenameSession?.(sessionId, title)}
          onTogglePin={(sessionId, isPinned) => onTogglePinSession?.(sessionId, isPinned)}
          onDelete={(sessionId) => onDeleteSession?.(sessionId)}
        />
      ) : null}
    </>
  );
}

export const SessionDrawer = memo(SessionDrawerInner);

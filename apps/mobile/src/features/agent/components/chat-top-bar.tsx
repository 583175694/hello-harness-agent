import { Image, Pressable, View } from 'react-native';
import { UI_HIT_SLOP_ICON } from '@/lib/ui-hit-slop';
import { Text } from '@/components/ui/text';
import { sessionFixture } from '../fixtures/ui-fixtures';
import { ConnectionPill, type ConnectionState } from './connection-pill';
import { CHAT_TOP_BAR_ICONS } from './chat-top-bar-icons';
import {
  AGENT_UI_BUTTON,
  CHAT_TOP_BAR_ACTION_CAPSULE,
  CHAT_TOP_BAR_CHROME_SHADOW,
} from '../config/ui.constants';

const TOP_BAR_ICON_PX = 22;
const CAPSULE = CHAT_TOP_BAR_ACTION_CAPSULE;
const CHROME_SHADOW = CHAT_TOP_BAR_CHROME_SHADOW;

function chatTopBarChromeShadowStyle() {
  return {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: CHROME_SHADOW.shadowOffsetY },
    shadowOpacity: CHROME_SHADOW.shadowOpacity,
    shadowRadius: CHROME_SHADOW.shadowRadius,
    elevation: CHROME_SHADOW.androidElevation,
  } as const;
}

type ChatTopBarProps = {
  title?: string;
  runSummary?: string;
  workbenchBadge?: number;
  connectionState?: ConnectionState;
  onOpenDrawer?: () => void;
  onNewConversation?: () => void;
  onOpenWorkbench?: () => void;
};

function ChatTopBarPngIcon({ source }: { source: number }) {
  return (
    <Image
      source={source}
      style={{ width: TOP_BAR_ICON_PX, height: TOP_BAR_ICON_PX }}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
    />
  );
}

function ChatTopBarCircleChrome({
  source,
  accessibilityLabel,
  onPress,
}: {
  source: number;
  accessibilityLabel: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={UI_HIT_SLOP_ICON}
      className="h-10 w-10 items-center justify-center rounded-full bg-surface active:opacity-80"
      style={chatTopBarChromeShadowStyle()}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <ChatTopBarPngIcon source={source} />
    </Pressable>
  );
}

function ChatTopBarCapsuleIcon({
  source,
  accessibilityLabel,
  onPress,
}: {
  source: number;
  accessibilityLabel: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={UI_HIT_SLOP_ICON}
      className={`${AGENT_UI_BUTTON.classNames.iconToolbar} active:opacity-80`}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <ChatTopBarPngIcon source={source} />
    </Pressable>
  );
}

export function ChatTopBar({
  title = sessionFixture.title,
  runSummary: _runSummary,
  workbenchBadge = 0,
  connectionState = 'live',
  onOpenDrawer,
  onNewConversation,
  onOpenWorkbench,
}: ChatTopBarProps) {
  const showConnectionIndicator =
    connectionState !== 'live' && connectionState !== 'idle';
  return (
    <View className="bg-canvas px-3 pb-1.5 pt-0.5">
      <View className="h-10 flex-row items-center">
        <ChatTopBarCircleChrome
          source={CHAT_TOP_BAR_ICONS.sessions}
          accessibilityLabel="打开会话列表"
          onPress={onOpenDrawer}
        />

        <Text
          variant="body-sm"
          className="min-w-0 flex-1 truncate pl-3 pr-2 text-left font-semibold text-primary"
          numberOfLines={1}
        >
          {title}
        </Text>

        {showConnectionIndicator ? <ConnectionPill state={connectionState} compact /> : null}

        <View
          className="ml-0.5 flex-row items-center rounded-full bg-surface"
          style={{
            paddingHorizontal: CAPSULE.paddingHorizontalPx,
            gap: CAPSULE.iconGapPx,
            ...chatTopBarChromeShadowStyle(),
          }}
        >
          <ChatTopBarCapsuleIcon
            source={CHAT_TOP_BAR_ICONS.newChat}
            accessibilityLabel="新建会话"
            onPress={onNewConversation}
          />
          <View className="relative">
            <ChatTopBarCapsuleIcon
              source={CHAT_TOP_BAR_ICONS.more}
              accessibilityLabel={
                workbenchBadge > 0 ? `打开工作台，${workbenchBadge} 项更新` : '打开工作台'
              }
              onPress={onOpenWorkbench}
            />
            {workbenchBadge > 0 ? (
              <View className="absolute -right-0.5 -top-0.5 min-h-[16px] min-w-[16px] items-center justify-center rounded-full bg-primary px-1">
                <Text variant="caption" className="text-[10px] font-semibold text-primary-foreground">
                  {workbenchBadge > 99 ? '99+' : workbenchBadge}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

import { Link, useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { Brain, ChevronRight, Server, Type } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { ICON_CHEVRON_TONE } from '@/lib/theme';
import type { ThemeMode } from '@/lib/preferences';
import { clampFontSize } from '@/lib/preferences';
import { useAppPreferences } from '@/providers/app-preferences-provider';

const THEME_OPTIONS: { id: ThemeMode; label: string }[] = [
  { id: 'system', label: '跟随系统' },
  { id: 'light', label: '浅色' },
  { id: 'dark', label: '深色' },
];

export default function SettingsScreen() {
  const router = useRouter();
  const { preferences, updatePreferences } = useAppPreferences();

  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-4 p-4">
      <View className="rounded-panel border border-border bg-surface p-4">
        <Text variant="headline" className="mb-3 text-[15px]" fixedSize>
          通用
        </Text>
        <Text variant="body-sm" className="mb-2 font-medium" fixedSize>
          主题
        </Text>
        <View className="mb-4 flex-row flex-wrap gap-2">
          {THEME_OPTIONS.map((opt) => (
            <Pressable
              key={opt.id}
              onPress={() => void updatePreferences({ themeMode: opt.id })}
              className={`rounded-full border px-3 py-1.5 ${
                preferences.themeMode === opt.id ? 'border-primary bg-subtle' : 'border-border'
              }`}
            >
              <Text variant="caption" fixedSize>
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <View className="flex-row items-center justify-between border-t border-composer-border pt-3">
          <View className="flex-row items-center gap-3">
            <Icon icon={Type} tone="secondary" size={18} />
            <Text variant="body-sm" fixedSize>
              正文字号
            </Text>
          </View>
          <View className="flex-row items-center gap-3">
            <Pressable
              onPress={() =>
                void updatePreferences({
                  contentFontSize: clampFontSize(preferences.contentFontSize - 1),
                })
              }
              className="h-8 w-8 items-center justify-center rounded-control border border-border active:bg-subtle"
            >
              <Text fixedSize>−</Text>
            </Pressable>
            <Text variant="body-sm" fixedSize>
              {preferences.contentFontSize}px
            </Text>
            <Pressable
              onPress={() =>
                void updatePreferences({
                  contentFontSize: clampFontSize(preferences.contentFontSize + 1),
                })
              }
              className="h-8 w-8 items-center justify-center rounded-control border border-border active:bg-subtle"
            >
              <Text fixedSize>+</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View className="rounded-panel border border-border bg-surface p-4">
        <Text variant="headline" className="mb-3 text-[15px]" fixedSize>
          Agent
        </Text>
        <Link href="/settings/memory" asChild>
          <Pressable className="flex-row items-center justify-between border-b border-composer-border py-3 active:opacity-70">
            <View className="flex-row items-center gap-3">
              <Icon icon={Brain} tone="secondary" size={18} />
              <Text variant="body-sm">记忆</Text>
            </View>
            <Icon icon={ChevronRight} tone={ICON_CHEVRON_TONE.push} size={18} />
          </Pressable>
        </Link>
        <Link href="/settings/mcp" asChild>
          <Pressable className="flex-row items-center justify-between py-3 active:opacity-70">
            <View className="flex-row items-center gap-3">
              <Icon icon={Server} tone="secondary" size={18} />
              <Text variant="body-sm">MCP 服务器</Text>
            </View>
            <Icon icon={ChevronRight} tone={ICON_CHEVRON_TONE.push} size={18} />
          </Pressable>
        </Link>
      </View>

      <View className="rounded-panel border border-border bg-surface p-4">
        <Text variant="headline" className="mb-2 text-[15px]" fixedSize>
          连接
        </Text>
        <Text variant="body-sm" className="text-secondary" fixedSize>
          API Base URL
        </Text>
        <View className="mt-2 rounded-control border border-composer-border bg-canvas px-3 py-1">
          <Input
            value={preferences.apiBaseUrl}
            onChangeText={(apiBaseUrl) => void updatePreferences({ apiBaseUrl })}
            placeholder="http://192.168.x.x:4318"
            autoCapitalize="none"
            autoCorrect={false}
            className="border-0 bg-transparent px-0"
          />
        </View>
      </View>

      <Pressable
        onPress={() => router.push('/preview')}
        className="items-center rounded-panel border border-dashed border-border py-3 active:bg-subtle"
      >
        <Text variant="body-sm" className="text-link">
          打开 Stitch 设计帧预览
        </Text>
      </Pressable>
    </ScrollView>
  );
}

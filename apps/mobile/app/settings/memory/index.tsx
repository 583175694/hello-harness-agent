import { Link } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { SettingsSwitch } from '@/components/ui/settings-switch';
import { Text } from '@/components/ui/text';
import { ICON_CHEVRON_TONE } from '@/lib/theme';
import { useMemoryLocal } from '@/features/agent/providers/memory-local-provider';
import { useAppPreferences } from '@/providers/app-preferences-provider';

export default function MemoryHubScreen() {
  const { preferences, updatePreferences } = useAppPreferences();
  const { memories } = useMemoryLocal();
  const activeCount = memories.filter((m) => m.indexingStatus !== 'failed').length;

  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-4 p-4">
      <View className="rounded-panel border border-border bg-surface p-4">
        <SettingsSwitch
          label="允许 Agent 写入记忆"
          description="开启后，对话中 Agent 可调用 memory_write 保存长期记忆；关闭后仅能在条目中手动维护。"
          value={preferences.allowAgentMemoryWrite}
          onValueChange={(next) => void updatePreferences({ allowAgentMemoryWrite: next })}
        />
      </View>

      <View className="rounded-panel border border-border bg-surface p-4">
        <Link href="/settings/memory/list" asChild>
          <Pressable className="flex-row items-center justify-between py-2 active:opacity-70">
            <Text variant="body-sm" className="font-medium">
              记忆条目
            </Text>
            <View className="flex-row items-center gap-1">
              <Text variant="body-sm" className="text-secondary">
                已保存 {activeCount} 条
              </Text>
              <Icon icon={ChevronRight} tone={ICON_CHEVRON_TONE.push} size={18} />
            </View>
          </Pressable>
        </Link>
      </View>
    </ScrollView>
  );
}

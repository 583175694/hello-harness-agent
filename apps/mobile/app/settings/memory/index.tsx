import { Link } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { SettingsSwitch } from '@/components/ui/settings-switch';
import { Text } from '@/components/ui/text';
import { ICON_CHEVRON_TONE } from '@/lib/theme';
import { useMemoryApi } from '@/features/agent/providers/memory-api-provider';

export default function MemoryHubScreen() {
  const { activeCount, allowAgentWrite, settingsLoading, loading, setAllowAgentWrite } =
    useMemoryApi();

  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-4 p-4">
      <View className="rounded-panel border border-border bg-surface p-4">
        <SettingsSwitch
          label="允许 Agent 写入记忆"
          description="与服务端 memory-settings 同步；开启后 Agent 可调用 memory_write。"
          value={allowAgentWrite}
          onValueChange={(next) => {
            if (!settingsLoading) void setAllowAgentWrite(next);
          }}
        />
      </View>

      <View className="rounded-panel border border-border bg-surface p-4">
        <Link href="/settings/memory/list" asChild>
          <Pressable className="flex-row items-center justify-between py-2 active:opacity-70">
            <Text variant="body-sm" className="font-medium">
              记忆条目
            </Text>
            <View className="flex-row items-center gap-1">
              {loading ? <ActivityIndicator size="small" /> : null}
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

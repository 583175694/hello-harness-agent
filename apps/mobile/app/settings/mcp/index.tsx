import { Link, useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { ChevronRight, Plus } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { ICON_CHEVRON_TONE } from '@/lib/theme';
import { mcpServerFixtures } from '@/features/agent/fixtures/mcp-fixtures';

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'connected'
      ? 'bg-approval text-approval-text'
      : status === 'degraded'
        ? 'bg-amber-100 text-amber-800'
        : 'bg-rejection text-rejection-text';
  const label =
    status === 'connected' ? '已连接' : status === 'degraded' ? '降级' : '未连接';
  return (
    <View className={`rounded-full px-2 py-0.5 ${tone}`}>
      <Text variant="caption" className="font-medium">
        {label}
      </Text>
    </View>
  );
}

export default function McpSettingsScreen() {
  const router = useRouter();

  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-3 p-4">
      <Text variant="body-sm" className="text-secondary">
        对齐 Web Settings MCP 列表；保存与测试为本地演示，不调 API。
      </Text>
      {mcpServerFixtures.map((server) => (
        <Pressable
          key={server.id}
          onPress={() => router.push(`/settings/mcp/${server.id}`)}
          className="rounded-panel border border-border bg-surface p-4 active:bg-subtle"
        >
          <View className="flex-row items-center justify-between">
            <Text variant="body" className="font-semibold">
              {server.serverName}
            </Text>
            <StatusBadge status={server.status} />
          </View>
          <Text variant="mono" className="mt-2 text-muted">
            {server.url}
          </Text>
          <View className="mt-2 flex-row items-center justify-end gap-1">
            <Text variant="caption" className="text-muted">
              编辑
            </Text>
            <Icon icon={ChevronRight} tone={ICON_CHEVRON_TONE.push} size={16} />
          </View>
        </Pressable>
      ))}

      <Link href="/settings/mcp/new" asChild>
        <Pressable className="flex-row items-center justify-center gap-2 rounded-panel border border-dashed border-border bg-subtle/50 py-4 active:bg-subtle">
          <Icon icon={Plus} tone="secondary" size={18} />
          <Text variant="body-sm" className="text-secondary">
            添加 MCP 服务器
          </Text>
        </Pressable>
      </Link>
    </ScrollView>
  );
}

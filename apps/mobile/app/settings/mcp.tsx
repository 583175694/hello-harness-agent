import { ScrollView, View } from 'react-native';
import { Text } from '@/components/ui/text';

const servers = [
  { name: 'filesystem-local', status: 'connected', url: 'stdio://local-fs' },
  { name: 'web-search', status: 'degraded', url: 'https://mcp.example/search' },
  { name: 'postgres-readonly', status: 'disconnected', url: 'https://mcp.example/pg' },
];

export default function McpSettingsScreen() {
  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-3 p-4">
      <Text variant="body-sm" className="text-secondary">
        对齐 Web Settings MCP 列表；表单 CRUD 在后续里程碑接入。
      </Text>
      {servers.map((server) => (
        <View key={server.name} className="rounded-panel border border-border bg-surface p-4">
          <View className="flex-row items-center justify-between">
            <Text variant="body" className="font-semibold">
              {server.name}
            </Text>
            <StatusBadge status={server.status} />
          </View>
          <Text variant="mono" className="mt-2 text-muted">
            {server.url}
          </Text>
        </View>
      ))}
      <View className="rounded-panel border border-dashed border-border bg-subtle/50 p-4">
        <Text variant="body-sm" className="text-center text-secondary">
          + 添加 MCP 服务器
        </Text>
      </View>
    </ScrollView>
  );
}

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

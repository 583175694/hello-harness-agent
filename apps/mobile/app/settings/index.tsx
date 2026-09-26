import { Link, useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { ChevronRight, Palette, Server, Type } from 'lucide-react-native';
import { Text } from '@/components/ui/text';

export default function SettingsScreen() {
  const router = useRouter();

  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-4 p-4">
      <View className="rounded-panel border border-border bg-surface p-4">
        <Text variant="headline" className="mb-3 text-[15px]">
          通用
        </Text>
        <SettingsRow icon={<Palette size={18} color="#555551" />} label="主题" value="跟随系统" />
        <SettingsRow icon={<Type size={18} color="#555551" />} label="正文字号" value="14px" />
      </View>

      <View className="rounded-panel border border-border bg-surface p-4">
        <Text variant="headline" className="mb-3 text-[15px]">
          Agent
        </Text>
        <Link href="/settings/mcp" asChild>
          <Pressable className="flex-row items-center justify-between py-3 active:opacity-70">
            <View className="flex-row items-center gap-3">
              <Server size={18} color="#555551" />
              <Text variant="body-sm">MCP 服务器</Text>
            </View>
            <ChevronRight size={18} color="#898986" />
          </Pressable>
        </Link>
      </View>

      <View className="rounded-panel border border-border bg-surface p-4">
        <Text variant="headline" className="mb-2 text-[15px]">
          连接
        </Text>
        <Text variant="body-sm" className="text-secondary">
          API Base URL
        </Text>
        <View className="mt-2 rounded-control border border-composer-border bg-canvas px-3 py-2.5">
          <Text variant="mono" className="text-muted">
            http://192.168.x.x:4318
          </Text>
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

function SettingsRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <View className="flex-row items-center justify-between border-b border-composer-border py-3 last:border-b-0">
      <View className="flex-row items-center gap-3">
        {icon}
        <Text variant="body-sm">{label}</Text>
      </View>
      <Text variant="body-sm" className="text-secondary">
        {value}
      </Text>
    </View>
  );
}

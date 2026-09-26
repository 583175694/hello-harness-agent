import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { ChevronRight, LoaderCircle } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import type { ToolActivityFixture } from '../fixtures/ui-fixtures';

function groupSummary(items: ToolActivityFixture[]): string {
  const names = new Set(items.map((i) => i.name));
  const parts: string[] = [];
  if (names.has('read_file_lines') || names.has('search_file') || names.has('create_file')) {
    parts.push('读取/写入文件');
  }
  if (names.has('bash') || names.has('execute_command')) parts.push('运行命令');
  if (names.has('web_search') || names.has('web_fetch')) parts.push('检索网页');
  if (names.has('external_tool')) parts.push('MCP 工具');
  if (parts.length === 0) return `${items.length} 次工具调用`;
  return parts.join(' · ');
}

type ToolActivityGroupProps = {
  items: ToolActivityFixture[];
  onOpenWorkbench?: () => void;
};

export function ToolActivityGroup({ items, onOpenWorkbench }: ToolActivityGroupProps) {
  const [open, setOpen] = useState(false);
  const running = items.some((i) => (i.status ?? 'completed') === 'running');
  const summary = useMemo(() => groupSummary(items), [items]);

  return (
    <View className="gap-0.5">
      <Pressable
        onPress={() => setOpen((v) => !v)}
        className="flex-row items-center gap-1 py-1 active:opacity-70"
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        {running ? <LoaderCircle size={14} color="#898986" /> : null}
        <Text variant="body-sm" className="text-muted">
          {summary}
        </Text>
        <ChevronRight
          size={14}
          color="#898986"
          style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}
        />
      </Pressable>
      {open ? (
        <View className="gap-1 pb-1 pl-1">
          {items.map((item) => {
            const status = item.status ?? 'completed';
            return (
              <Pressable
                key={item.id}
                onPress={onOpenWorkbench}
                className="flex-row items-start gap-2 py-0.5 active:opacity-70"
              >
                <Text variant="caption" className="font-mono text-muted">
                  {item.name}
                </Text>
                <Text variant="caption" className="flex-1 text-muted" numberOfLines={2}>
                  {item.summary}
                  {item.statusLabel ? ` · ${item.statusLabel}` : item.duration ? ` · ${item.duration}` : ''}
                </Text>
                {status === 'running' ? (
                  <LoaderCircle size={12} color="#898986" />
                ) : null}
              </Pressable>
            );
          })}
          <Pressable onPress={onOpenWorkbench} className="py-1 active:opacity-70">
            <Text variant="caption" className="text-link">在工作台查看详情</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

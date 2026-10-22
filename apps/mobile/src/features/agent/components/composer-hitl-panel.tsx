import { Pressable, ScrollView, View } from 'react-native';
import type { PendingInterruptSnapshot } from '@harness/agent-protocol';
import { Check, Gavel, Terminal, X } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { hitlApprovalFixture } from '../fixtures/ui-fixtures';
import { formatApprovalItem } from '../lib/hitl-tool-copy';

type ComposerHitlPanelProps = {
  interrupt?: Extract<PendingInterruptSnapshot, { kind: 'tool_approval' }>;
  submitting?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
  onCancelRun?: () => void;
};

export function ComposerHitlPanel({
  interrupt,
  submitting = false,
  onApprove,
  onReject,
  onCancelRun,
}: ComposerHitlPanelProps) {
  const items = interrupt?.payload.items ?? [];
  const primary = items[0];
  const primaryCopy = primary
    ? formatApprovalItem(primary.toolName, primary.input)
    : {
        title: hitlApprovalFixture.title,
        detail: hitlApprovalFixture.command,
      };

  return (
    <View className="rounded-bubble border border-composer-border bg-surface p-3.5">
      <View className="flex-row items-center justify-between border-b border-composer-border pb-2">
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          <View className="h-6 w-6 items-center justify-center rounded-md bg-amber-500/15">
            <Icon icon={Gavel} tone="warning" size={16} textWeight="semibold" />
          </View>
          <Text variant="body" className="shrink font-semibold" numberOfLines={1}>
            {items.length > 1 ? `需要批准 ${items.length} 项工具` : '需要批准工具调用'}
          </Text>
        </View>
        <Pressable
          onPress={onCancelRun}
          className="flex-row items-center gap-1 rounded px-1.5 py-0.5 active:bg-subtle"
        >
          <Icon icon={X} tone="secondary" size={14} />
          <Text variant="caption" className="text-secondary">
            取消运行
          </Text>
        </Pressable>
      </View>

      <ScrollView className="mt-3 max-h-40" nestedScrollEnabled>
        {(items.length ? items : [{ itemId: 'demo', toolCallId: 'demo', toolName: 'bash', input: { command: hitlApprovalFixture.command }, argumentsHash: 'demo' }]).map(
          (item, index) => {
            const copy = formatApprovalItem(item.toolName, item.input);
            return (
              <View key={item.itemId} className="mb-2 gap-1.5 rounded-panel bg-terminal p-3">
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-1.5">
                    <Icon icon={Terminal} tone="terminalAccent" size={14} />
                    <Text variant="mono" className="text-terminal-muted">
                      {item.toolName}
                    </Text>
                  </View>
                  {items.length > 1 ? (
                    <Text variant="caption" className="text-terminal-muted">
                      {index + 1}/{items.length}
                    </Text>
                  ) : null}
                </View>
                <Text variant="mono" className="font-medium text-terminal-fg">
                  {copy.title}
                </Text>
                {copy.detail ? (
                  <Text variant="caption" className="font-mono text-terminal-muted">
                    {copy.detail}
                  </Text>
                ) : null}
              </View>
            );
          },
        )}
      </ScrollView>

      {!interrupt ? (
        <Text variant="caption" className="mt-1 text-muted">
          {primaryCopy.detail || hitlApprovalFixture.sandboxNote}
        </Text>
      ) : null}

      <View className="mt-2.5 flex-row gap-2.5">
        <PressableScale
          className="h-10 flex-1 flex-row items-center justify-center gap-1 rounded-control bg-rejection"
          onPress={onReject}
          disabled={submitting || !interrupt}
        >
          <Icon icon={X} tone="rejection" size={16} />
          <Text variant="body-sm" className="font-medium text-rejection-text">
            拒绝
          </Text>
        </PressableScale>
        <PressableScale
          className="h-10 flex-1 flex-row items-center justify-center gap-1 rounded-control bg-primary"
          onPress={onApprove}
          disabled={submitting || !interrupt}
        >
          <Icon icon={Check} tone="onPrimary" size={16} />
          <Text variant="body-sm" className="font-medium text-primary-foreground">
            批准执行
          </Text>
        </PressableScale>
      </View>
    </View>
  );
}

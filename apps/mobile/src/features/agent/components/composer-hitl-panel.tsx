import { View } from 'react-native';
import { Check, Gavel, Terminal, X } from 'lucide-react-native';
import { Pressable } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { hitlApprovalFixture } from '../fixtures/ui-fixtures';

export function ComposerHitlPanel() {
  return (
    <View className="rounded-bubble border border-composer-border bg-surface p-3.5 shadow-sm">
      <View className="flex-row items-center justify-between border-b border-composer-border pb-2">
        <View className="flex-row items-center gap-2">
          <View className="h-6 w-6 items-center justify-center rounded-md bg-amber-500/15">
            <Icon icon={Gavel} tone="warning" size={16} textWeight="semibold" />
          </View>
          <Text variant="body" className="font-semibold">
            {hitlApprovalFixture.title}
          </Text>
          <View className="rounded border border-red-200 bg-[#fef2f2] px-1.5 py-0.5">
            <Text variant="caption" className="font-medium text-[#b91c1c]">
              {hitlApprovalFixture.shellBadge}
            </Text>
          </View>
        </View>
        <Pressable className="flex-row items-center gap-1 rounded px-1.5 py-0.5 active:bg-subtle">
          <Icon icon={X} tone="secondary" size={14} />
          <Text variant="caption" className="text-secondary">
            取消运行
          </Text>
        </Pressable>
      </View>

      <View className="mt-3 gap-1.5 rounded-xl bg-terminal p-3">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-1.5">
            <Icon icon={Terminal} tone="terminalAccent" size={14} />
            <Text variant="mono" className="text-zinc-300">
              bash
            </Text>
          </View>
          <Text variant="caption" className="text-emerald-400">
            只读挂载
          </Text>
        </View>
        <Text variant="mono" className="text-zinc-100" selectable>
          <Text className="font-bold text-emerald-400">$ </Text>
          {hitlApprovalFixture.command}
        </Text>
        <Text variant="caption" className="border-t border-white/10 pt-1 font-mono text-zinc-400">
          {hitlApprovalFixture.sandboxNote}
        </Text>
      </View>

      <View className="mt-2.5 flex-row gap-2.5">
        <PressableScale className="h-10 flex-1 flex-row items-center justify-center gap-1 rounded-xl bg-rejection">
          <Icon icon={X} tone="rejection" size={16} />
          <Text variant="body-sm" className="font-medium text-rejection-text">
            拒绝
          </Text>
        </PressableScale>
        <PressableScale className="h-10 flex-1 flex-row items-center justify-center gap-1 rounded-xl bg-primary">
          <Icon icon={Check} tone="onPrimary" size={16} />
          <Text variant="body-sm" className="font-medium text-primary-foreground">
            批准执行
          </Text>
        </PressableScale>
      </View>
    </View>
  );
}

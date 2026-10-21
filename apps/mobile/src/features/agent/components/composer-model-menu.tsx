import { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

export type ReasoningEffort = 'off' | 'low' | 'high' | 'max';

export type ModelFixture = {
  id: string;
  label: string;
  reasoningLevels: ReasoningEffort[];
};

export const modelFixtures: ModelFixture[] = [
  { id: 'deepseek-chat', label: 'DeepSeek Chat', reasoningLevels: ['off', 'low', 'high'] },
  { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner', reasoningLevels: ['low', 'high', 'max'] },
];

const REASONING_LABEL: Record<ReasoningEffort, string> = {
  off: '无',
  low: '轻',
  high: '中',
  max: '高',
};

type ComposerModelMenuProps = {
  modelId: string;
  reasoningEffort: ReasoningEffort;
  onModelChange: (id: string) => void;
  onReasoningChange: (effort: ReasoningEffort) => void;
  disabled?: boolean;
};

export function ComposerModelMenu({
  modelId,
  reasoningEffort,
  onModelChange,
  onReasoningChange,
  disabled,
}: ComposerModelMenuProps) {
  const [open, setOpen] = useState(false);
  const model = modelFixtures.find((m) => m.id === modelId) ?? modelFixtures[0]!;

  return (
    <>
      <Pressable
        disabled={disabled}
        onPress={() => setOpen(true)}
        className="max-w-[140px] flex-row items-center gap-0.5 rounded-control px-1 py-1 active:bg-subtle"
      >
        <Text variant="caption" className="truncate text-secondary" numberOfLines={1}>
          {model.label.split(' ')[0]} · {REASONING_LABEL[reasoningEffort]}
        </Text>
        <Icon icon={ChevronDown} tone="muted" size={14} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable className="flex-1 bg-overlay-scrim" onPress={() => setOpen(false)} />
        <View className="max-h-[50%] rounded-t-panel bg-surface p-4">
          <Text variant="body-sm" className="mb-3 font-semibold">
            模型
          </Text>
          <ScrollView className="max-h-32">
            {modelFixtures.map((m) => (
              <Pressable
                key={m.id}
                onPress={() => {
                  onModelChange(m.id);
                  if (!m.reasoningLevels.includes(reasoningEffort)) {
                    onReasoningChange(m.reasoningLevels[0] ?? 'off');
                  }
                }}
                className={`mb-2 rounded-control border px-3 py-2 ${
                  m.id === modelId ? 'border-primary bg-subtle' : 'border-border'
                }`}
              >
                <Text variant="body-sm">{m.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Text variant="body-sm" className="mb-2 mt-3 font-semibold">
            推理强度
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {(['off', 'low', 'high', 'max'] as const).map((level) => {
              const enabled = model.reasoningLevels.includes(level);
              return (
                <Pressable
                  key={level}
                  disabled={!enabled}
                  onPress={() => onReasoningChange(level)}
                  className={`rounded-full border px-3 py-1 ${
                    reasoningEffort === level ? 'border-primary bg-subtle' : 'border-border'
                  } ${!enabled ? 'opacity-40' : ''}`}
                >
                  <Text variant="caption">{REASONING_LABEL[level]}</Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            onPress={() => setOpen(false)}
            className="mt-4 items-center rounded-control bg-primary py-2.5"
          >
            <Text variant="body-sm" className="font-semibold text-primary-foreground">
              完成
            </Text>
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

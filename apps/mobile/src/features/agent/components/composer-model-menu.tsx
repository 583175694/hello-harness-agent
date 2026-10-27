import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Check, ChevronDown } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/lib/use-theme-colors';
import { ComposerBottomDrawer } from './composer-bottom-drawer';
import { ComposerSegmentedControl } from './composer-segmented-control';
import {
  ComposerSheetCancelRow,
  ComposerSheetFloatingCard,
  ComposerSheetGrabHandle,
  ComposerSheetHeader,
} from './composer-sheet-chrome';

export type ReasoningEffort = 'off' | 'low' | 'high' | 'max';

const REASONING_LEVELS: ReasoningEffort[] = ['off', 'low', 'high', 'max'];

export type ModelFixture = {
  id: string;
  label: string;
  reasoningLevels: ReasoningEffort[];
  defaultReasoning?: ReasoningEffort;
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
  models?: ModelFixture[];
  onModelChange: (id: string) => void;
  onReasoningChange: (effort: ReasoningEffort) => void;
  disabled?: boolean;
  /** overlay：与 Workbench BottomSheet 并存；modal：Preview / Catalog */
  presentation?: 'overlay' | 'modal';
};

function ModelMenuBody({
  catalog,
  modelId,
  model,
  reasoningEffort,
  onClose,
  selectModel,
  onReasoningChange,
}: {
  catalog: ModelFixture[];
  modelId: string;
  model: ModelFixture;
  reasoningEffort: ReasoningEffort;
  onClose: () => void;
  selectModel: (id: string) => void;
  onReasoningChange: (effort: ReasoningEffort) => void;
}) {
  return (
    <>
      <ComposerSheetGrabHandle />
      <ComposerSheetHeader title="模型" actionLabel="完成" onAction={onClose} />

      <ScrollView className="max-h-40" showsVerticalScrollIndicator={false}>
        {catalog.map((m, index) => {
          const active = m.id === modelId;
          return (
            <Pressable
              key={m.id}
              onPress={() => selectModel(m.id)}
              className={`min-h-[48px] flex-row items-center gap-2 px-4 active:bg-subtle ${
                index < catalog.length - 1 ? 'border-b border-composer-border' : ''
              }`}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={m.label}
            >
              <Text
                variant="body"
                className={`min-w-0 flex-1 font-normal ${active ? 'text-primary' : 'text-secondary'}`}
                numberOfLines={1}
              >
                {m.label}
              </Text>
              {active ? (
                <Icon icon={Check} tone="primary" size={20} strokeWidth={2.25} />
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      <View className="border-t border-composer-border px-4 pb-1 pt-3">
        <Text variant="caption" className="mb-2.5 font-medium text-muted">
          推理强度
        </Text>
        <ComposerSegmentedControl
          value={reasoningEffort}
          onChange={onReasoningChange}
          options={REASONING_LEVELS.map((level) => ({
            value: level,
            label: REASONING_LABEL[level],
            disabled: !model.reasoningLevels.includes(level),
          }))}
        />
      </View>
    </>
  );
}

export function ComposerModelMenu({
  modelId,
  reasoningEffort,
  models,
  onModelChange,
  onReasoningChange,
  disabled,
  presentation = 'modal',
}: ComposerModelMenuProps) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const themeColors = useThemeColors();
  const catalog = models?.length ? models : modelFixtures;
  const model = catalog.find((m) => m.id === modelId) ?? catalog[0]!;
  const bottomPad = Math.max(insets.bottom, 10);

  const selectModel = (id: string) => {
    onModelChange(id);
    const next = catalog.find((m) => m.id === id);
    if (next) {
      const preferred = next.defaultReasoning ?? 'high';
      onReasoningChange(
        next.reasoningLevels.includes(preferred)
          ? preferred
          : (next.reasoningLevels[0] ?? 'off'),
      );
    }
  };

  const close = () => setOpen(false);

  return (
    <>
      <Pressable
        disabled={disabled}
        onPress={() => setOpen(true)}
        hitSlop={8}
        className={`max-w-[140px] min-h-11 flex-row items-center gap-0.5 rounded-control px-2 py-1 active:bg-subtle ${
          disabled ? 'opacity-40' : ''
        }`}
        accessibilityRole="button"
        accessibilityLabel="切换模型与推理强度"
        accessibilityState={{ disabled: !!disabled }}
      >
        <Text variant="caption" className="truncate text-secondary" numberOfLines={1}>
          {model.label.split(' ')[0]} · {REASONING_LABEL[reasoningEffort]}
        </Text>
        <Icon icon={ChevronDown} tone="muted" size={14} />
      </Pressable>

      {presentation === 'modal' ? (
        <ComposerBottomDrawer
          visible={open}
          onClose={close}
          panelMaxHeightClassName="max-h-[55%]"
        >
          <ModelMenuBody
            catalog={catalog}
            modelId={modelId}
            model={model}
            reasoningEffort={reasoningEffort}
            onClose={close}
            selectModel={selectModel}
            onReasoningChange={onReasoningChange}
          />
        </ComposerBottomDrawer>
      ) : open ? (
        <View className="absolute inset-0 z-[120] justify-end" pointerEvents="box-none">
          <Pressable
            className="absolute inset-0"
            style={{ backgroundColor: themeColors.overlayScrim }}
            onPress={close}
            accessibilityLabel="关闭"
          />
          <View
            className="gap-2 px-3"
            style={{ paddingBottom: bottomPad }}
            pointerEvents="box-none"
          >
            <ComposerSheetFloatingCard>
              <ModelMenuBody
                catalog={catalog}
                modelId={modelId}
                model={model}
                reasoningEffort={reasoningEffort}
                onClose={close}
                selectModel={selectModel}
                onReasoningChange={onReasoningChange}
              />
            </ComposerSheetFloatingCard>
            <ComposerSheetFloatingCard>
              <ComposerSheetCancelRow label="取消" onPress={close} />
            </ComposerSheetFloatingCard>
          </View>
        </View>
      ) : null}
    </>
  );
}

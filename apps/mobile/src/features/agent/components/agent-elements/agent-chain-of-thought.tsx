import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { ChevronDown, ChevronUp, Search } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { ICON_CHEVRON_TONE } from '@/lib/theme';
import type { CotStepFixture } from '../../fixtures/cot-fixtures';
import { catalogCotFixture } from '../../fixtures/cot-fixtures';

type AgentChainOfThoughtProps = {
  elapsedLabel?: string;
  steps?: CotStepFixture[];
  running?: boolean;
};

export function AgentChainOfThought({
  elapsedLabel = catalogCotFixture.elapsedLabel,
  steps = catalogCotFixture.steps,
  running = false,
}: AgentChainOfThoughtProps) {
  const [open, setOpen] = useState(true);

  return (
    <View className="mb-2 rounded-panel border border-composer-border bg-surface">
      <Pressable
        onPress={() => setOpen((v) => !v)}
        className="flex-row items-center justify-between px-3 py-2.5 active:bg-subtle"
      >
        <View className="flex-row items-center gap-2">
          <Icon icon={Search} tone="secondary" size={16} />
          <Text variant="body-sm" className="font-medium">
            执行过程
          </Text>
          {running ? (
            <Text variant="caption" className="text-muted">
              进行中
            </Text>
          ) : null}
        </View>
        <View className="flex-row items-center gap-2">
          <Text variant="caption" className="text-muted">
            {elapsedLabel}
          </Text>
          <Icon
            icon={open ? ChevronUp : ChevronDown}
            tone={ICON_CHEVRON_TONE.disclosure}
            size={16}
          />
        </View>
      </Pressable>
      {open ? (
        <View className="gap-2 border-t border-composer-border px-3 py-2">
          {steps.map((step, index) => (
            <View key={step.id} className="gap-1">
              <View className="flex-row items-start gap-2">
                <Text variant="caption" className="mt-0.5 w-4 text-muted">
                  {index + 1}.
                </Text>
                <View className="min-w-0 flex-1">
                  <Text variant="body-sm">{step.title}</Text>
                  {step.domains?.length ? (
                    <View className="mt-1 flex-row flex-wrap gap-1">
                      {step.domains.map((d) => (
                        <View key={d} className="rounded bg-subtle px-1.5 py-0.5">
                          <Text variant="caption" className="font-mono text-secondary">
                            {d}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                  {step.tool ? (
                    <Text variant="caption" className="mt-1 font-mono text-muted">
                      {step.tool.name} {step.tool.summary}
                    </Text>
                  ) : null}
                </View>
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

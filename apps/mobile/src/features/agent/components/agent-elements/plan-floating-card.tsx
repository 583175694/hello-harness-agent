import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Check, LoaderCircle } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { catalogPlanFixture } from '../../fixtures/ui-catalog-fixtures';

type PlanStep = { step: string; status: 'pending' | 'in_progress' | 'completed' };

export function PlanFloatingCard({
  plan = catalogPlanFixture.plan,
  explanation = catalogPlanFixture.explanation,
}: {
  plan?: PlanStep[];
  explanation?: string;
}) {
  const [open, setOpen] = useState(false);
  const activeIndex = Math.max(0, plan.findIndex((s) => s.status === 'in_progress'));

  if (!plan.length || plan.every((step) => step.status === 'completed')) {
    return null;
  }

  return (
    <View className="w-full items-center" accessibilityRole="summary">
      {open ? (
        <View
          className="mb-2 w-full max-w-[360px] rounded-[14px] bg-surface px-3.5 py-3 shadow-lg"
          style={{
            shadowColor: '#000',
            shadowOpacity: 0.12,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 8 },
            elevation: 8,
          }}
        >
          {explanation ? (
            <Text variant="caption" className="mb-2.5 text-muted">
              {explanation}
            </Text>
          ) : null}
          {plan.map((step, index) => (
            <View key={`${index}-${step.step}`} className="flex-row items-start gap-2 py-1">
              <View className="mt-0.5 w-4 items-center">
                {step.status === 'completed' ? (
                  <Check size={14} color="#4f8a64" />
                ) : step.status === 'in_progress' ? (
                  <LoaderCircle size={14} color="#555551" />
                ) : (
                  <View className="mt-0.5 h-2.5 w-2.5 rounded-full border border-muted" />
                )}
              </View>
              <Text
                variant="body-sm"
                className={
                  step.status === 'completed'
                    ? 'flex-1 text-muted'
                    : step.status === 'in_progress'
                      ? 'flex-1 text-primary'
                      : 'flex-1 text-secondary'
                }
              >
                {step.step}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <Pressable
        onPress={() => setOpen((v) => !v)}
        className="min-h-[38px] flex-row items-center gap-2 rounded-full border border-composer-border bg-surface/95 px-4 py-2 shadow-md active:opacity-90"
        accessibilityRole="button"
        accessibilityLabel={`执行计划，第 ${activeIndex + 1} / ${plan.length} 步`}
        accessibilityState={{ expanded: open }}
      >
        <LoaderCircle size={14} color="#171717" />
        <Text variant="body-sm" className="font-semibold text-primary">
          第 {activeIndex + 1} / {plan.length} 步
        </Text>
      </Pressable>
    </View>
  );
}

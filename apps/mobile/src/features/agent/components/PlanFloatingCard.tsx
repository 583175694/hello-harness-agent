import type { PlanSnapshot } from '@harness/agent-protocol';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/theme/tokens';

export function PlanFloatingCard({
  plan,
  visible,
}: {
  plan?: PlanSnapshot;
  visible: boolean;
}) {
  if (!visible || !plan?.plan.length || plan.plan.every((step) => step.status === 'completed')) {
    return null;
  }
  const activeIndex = Math.max(0, plan.plan.findIndex((step) => step.status === 'in_progress'));
  return (
    <View style={styles.wrap} accessibilityRole="summary">
      <Text style={styles.trigger}>
        第 {activeIndex + 1} / {plan.plan.length} 步
      </Text>
      {plan.explanation ? <Text style={styles.explanation}>{plan.explanation}</Text> : null}
      {plan.plan.map((step, index) => (
        <Text
          key={`${index}-${step.step}`}
          style={[styles.step, step.status === 'in_progress' && styles.stepActive]}
        >
          {step.status === 'completed' ? '✓ ' : step.status === 'in_progress' ? '● ' : '○ '}
          {step.step}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: 4,
  },
  trigger: { fontWeight: '600', color: colors.textPrimary },
  explanation: { color: colors.textSecondary, fontSize: 13 },
  step: { color: colors.textMuted, fontSize: 13 },
  stepActive: { color: colors.accent, fontWeight: '600' },
});

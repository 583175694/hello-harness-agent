import type { RunContextDebug } from '@harness/agent-protocol';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/theme/tokens';

export function ContextRing({ context }: { context?: RunContextDebug }) {
  const [open, setOpen] = useState(false);
  if (!context?.promptBudget) return null;
  const used = context.estimatedInputTokens ?? 0;
  const budget = context.promptBudget;
  const percentage = budget > 0 ? Math.min(100, (used / budget) * 100) : 0;

  return (
    <>
      <Pressable
        style={styles.trigger}
        accessibilityLabel={`上下文已使用 ${percentage.toFixed(0)}%`}
        onPress={() => setOpen(true)}
      >
        <Text style={styles.triggerText}>{percentage.toFixed(0)}%</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            <Text style={styles.title}>上下文使用量</Text>
            <Text style={styles.row}>已使用：{used.toLocaleString()} tokens</Text>
            <Text style={styles.row}>输入预算：{budget.toLocaleString()} tokens</Text>
            <Text style={styles.row}>
              剩余：{Math.max(0, budget - used).toLocaleString()} tokens
            </Text>
            {context.compactionTriggered ? (
              <Text style={styles.hint}>本轮已执行上下文压缩</Text>
            ) : null}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  triggerText: { fontSize: 12, fontWeight: '600', color: colors.textPrimary },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    padding: spacing.xl,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    gap: spacing.sm,
  },
  title: { fontWeight: '700', fontSize: 17 },
  row: { color: colors.textSecondary },
  hint: { color: colors.accent, marginTop: spacing.sm },
});

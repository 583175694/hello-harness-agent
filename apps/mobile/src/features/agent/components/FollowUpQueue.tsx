import type { PendingUserInputView } from '@harness/agent-protocol';
import type { AgentUiState } from '@harness/agent-ui-types';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/theme/tokens';

export function FollowUpQueue({
  state,
  pendingInputs,
  submitting,
  onPromotePending,
  onCancelPending,
  onSendPending,
}: {
  state: AgentUiState;
  pendingInputs: PendingUserInputView[];
  submitting: boolean;
  onPromotePending?: (inputId: string) => void;
  onCancelPending?: (inputId: string) => void;
  onSendPending?: (inputId: string) => void;
}) {
  const queuedInputs = pendingInputs.filter(
    (item) => item.status === 'pending' && item.kind === 'follow_up',
  );
  const canSendPending =
    !submitting &&
    Boolean(onSendPending) &&
    !state.activeRunId &&
    (state.workbench?.activityStatus === 'failed' ||
      state.workbench?.activityStatus === 'cancelled' ||
      state.workbench?.activityStatus === 'completed');

  if (!queuedInputs.length) return null;

  return (
    <View style={styles.stack}>
      {queuedInputs.map((item) => (
        <View key={item.id} style={styles.card}>
          <Text style={styles.content}>{item.content}</Text>
          <View style={styles.actions}>
            {canSendPending ? (
              <Pressable style={styles.btn} onPress={() => onSendPending?.(item.id)}>
                <Text style={styles.btnText}>发送</Text>
              </Pressable>
            ) : null}
            {onPromotePending ? (
              <Pressable style={styles.btn} onPress={() => onPromotePending(item.id)}>
                <Text style={styles.btnText}>调整方向</Text>
              </Pressable>
            ) : null}
            {onCancelPending ? (
              <Pressable style={styles.btnDanger} onPress={() => onCancelPending(item.id)}>
                <Text style={styles.btnDangerText}>删除</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm, marginBottom: spacing.sm },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    backgroundColor: colors.surface,
  },
  content: { color: colors.textPrimary, marginBottom: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  btn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    minHeight: 36,
    justifyContent: 'center',
  },
  btnText: { color: colors.accent, fontSize: 13 },
  btnDanger: { paddingHorizontal: spacing.md, paddingVertical: 6, minHeight: 36, justifyContent: 'center' },
  btnDangerText: { color: colors.danger, fontSize: 13 },
});

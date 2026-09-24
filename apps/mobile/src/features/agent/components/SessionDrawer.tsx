import type { SessionSummary } from '@harness/agent-protocol';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/theme/tokens';
import { AGENT_UI_COPY } from '../config/ui.constants';
import { useAgentSession } from '../context/agent-session-context';

export function SessionDrawer() {
  const {
    sessionDrawerOpen,
    setSessionDrawerOpen,
    sessionGroups,
    selectedSessionId,
    selectSession,
    createNewSession,
    deleteSessionById,
    updateSessionMeta,
  } = useAgentSession();

  function confirmDelete(session: SessionSummary) {
    Alert.alert('删除会话', AGENT_UI_COPY.deleteSessionConfirm, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => void deleteSessionById(session),
      },
    ]);
  }

  function promptRename(sessionId: string, currentTitle: string) {
    Alert.prompt('重命名会话', undefined, (title) => {
      const trimmed = title?.trim();
      if (trimmed) void updateSessionMeta(sessionId, { title: trimmed });
    }, 'plain-text', currentTitle);
  }

  return (
    <Modal visible={sessionDrawerOpen} animationType="slide" onRequestClose={() => setSessionDrawerOpen(false)}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.title}>会话</Text>
          <Pressable onPress={() => setSessionDrawerOpen(false)}>
            <Text style={styles.close}>关闭</Text>
          </Pressable>
        </View>
        <Pressable style={styles.newBtn} onPress={createNewSession}>
          <Text style={styles.newBtnText}>新会话</Text>
        </Pressable>
        <ScrollView>
          {sessionGroups.map((group) => (
            <View key={group.label}>
              <Text style={styles.groupLabel}>{group.label}</Text>
              {group.sessions.map((session) => (
                <View key={session.id} style={styles.row}>
                  <Pressable
                    style={[
                      styles.sessionItem,
                      selectedSessionId === session.id && styles.sessionActive,
                    ]}
                    onPress={() => selectSession(session.id)}
                    onLongPress={() => promptRename(session.id, session.title)}
                  >
                    <Text numberOfLines={1}>{session.title}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() =>
                      void updateSessionMeta(session.id, { isPinned: !session.isPinned })
                    }
                  >
                    <Text style={styles.action}>{session.isPinned ? '取消置顶' : '置顶'}</Text>
                  </Pressable>
                  <Pressable onPress={() => confirmDelete(session)}>
                    <Text style={[styles.action, styles.danger]}>删除</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas, paddingTop: 56 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  title: { fontSize: 20, fontWeight: '700' },
  close: { color: colors.accent, fontSize: 16 },
  newBtn: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    backgroundColor: colors.accent,
    borderRadius: 12,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newBtnText: { color: '#fff', fontWeight: '600' },
  groupLabel: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    color: colors.textMuted,
    fontSize: 13,
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, gap: spacing.sm },
  sessionItem: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  sessionActive: { backgroundColor: colors.surfaceHover, borderRadius: 8, paddingHorizontal: spacing.sm },
  action: { color: colors.accent, fontSize: 12 },
  danger: { color: colors.danger },
});

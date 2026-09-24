import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '@/theme/tokens';
import { ACTIVITY_STATUS_COPY } from '../config/ui.constants';
import { useAgentSession } from '../context/agent-session-context';
import { Composer } from './Composer';
import { ConversationPanel } from './ConversationPanel';
import { SessionDrawer } from './SessionDrawer';
import { WorkbenchPanel } from './WorkbenchPanel';

export function AgentShell() {
  const {
    uiState,
    serviceState,
    connectionState,
    error,
    dismissError,
    primaryPanel,
    setPrimaryPanel,
    setSessionDrawerOpen,
    reloadService,
    submitting,
  } = useAgentSession();
  const { width } = useWindowDimensions();
  const split = width >= 768;
  const wb = uiState.workbench;
  const runSummary =
    wb && submitting
      ? (ACTIVITY_STATUS_COPY[wb.activityStatus ?? 'running']?.title ?? '执行中')
      : null;

  const header = (
    <View style={styles.header}>
      <Pressable style={styles.menuBtn} onPress={() => setSessionDrawerOpen(true)}>
        <Text>会话</Text>
      </Pressable>
      <View style={styles.titleBlock}>
        <Text style={styles.title} numberOfLines={1}>
          {uiState.label}
        </Text>
        <Text style={styles.meta}>
          {serviceState === 'ready' ? connectionState : serviceState}
        </Text>
      </View>
      <Link href="/settings" asChild>
        <Pressable style={styles.menuBtn}>
          <Text>设置</Text>
        </Pressable>
      </Link>
    </View>
  );

  const segmented = (
    <View style={styles.segmented}>
      {(['conversation', 'workbench'] as const).map((panel) => (
        <Pressable
          key={panel}
          style={[styles.segment, primaryPanel === panel && styles.segmentActive]}
          onPress={() => setPrimaryPanel(panel)}
        >
          <Text style={primaryPanel === panel ? styles.segmentTextActive : styles.segmentText}>
            {panel === 'conversation' ? '对话' : '工作台'}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {header}
      {error ? (
        <Pressable style={styles.banner} onPress={dismissError}>
          <Text style={styles.bannerText}>{error}</Text>
          <Pressable onPress={() => reloadService()}>
            <Text style={styles.bannerAction}>重新连接</Text>
          </Pressable>
        </Pressable>
      ) : null}
      {runSummary && !split ? (
        <Pressable style={styles.runBar} onPress={() => setPrimaryPanel('workbench')}>
          <Text style={styles.runBarText}>{runSummary} · 点击查看工作台</Text>
        </Pressable>
      ) : null}
      {!split ? segmented : null}
      <View style={[styles.main, split && styles.mainSplit]}>
        {(split || primaryPanel === 'conversation') && (
          <View style={[styles.column, styles.flexColumn, split && styles.splitColumn]}>
            <ConversationPanel />
            <Composer />
          </View>
        )}
        {(split || primaryPanel === 'workbench') && (
          <View style={[styles.column, split && styles.splitColumn, styles.workbenchColumn]}>
            <WorkbenchPanel />
          </View>
        )}
      </View>
      <SessionDrawer />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  menuBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm },
  titleBlock: { flex: 1 },
  title: { fontSize: 17, fontWeight: '600', color: colors.textPrimary },
  meta: { fontSize: 12, color: colors.textMuted },
  segmented: {
    flexDirection: 'row',
    margin: spacing.lg,
    backgroundColor: colors.surfaceHover,
    borderRadius: 12,
    padding: 4,
  },
  segment: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  segmentActive: { backgroundColor: colors.surface },
  segmentText: { color: colors.textSecondary },
  segmentTextActive: { color: colors.textPrimary, fontWeight: '600' },
  main: { flex: 1 },
  mainSplit: { flexDirection: 'row' },
  column: { flex: 1 },
  flexColumn: { minHeight: 0 },
  splitColumn: { borderRightWidth: 1, borderRightColor: colors.border },
  workbenchColumn: { flex: 1.1 },
  banner: {
    backgroundColor: '#fef2f2',
    padding: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bannerText: { color: colors.danger, flex: 1 },
  bannerAction: { color: colors.accent, fontWeight: '600' },
  runBar: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    minHeight: 44,
    justifyContent: 'center',
  },
  runBarText: { color: colors.textPrimary, fontSize: 14 },
});

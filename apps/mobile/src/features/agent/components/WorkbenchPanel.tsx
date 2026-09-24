import type { WorkspaceView } from '@harness/agent-ui-types';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { getAgentClient } from '@/lib/api';
import { colors, spacing } from '@/theme/tokens';
import { ACTIVITY_STATUS_COPY } from '../config/ui.constants';
import { useAgentSession } from '../context/agent-session-context';
import { formatBashTerminalOutput } from '../lib/bash-terminal';

export function WorkbenchPanel() {
  const {
    uiState,
    setWorkbenchView,
    pauseActiveRun,
    resumeActiveRun,
    beginArtifactRevision,
    focusWorkbench,
    restoreArtifactVersion,
  } = useAgentSession();
  const wb = uiState.workbench;

  const views = useMemo(() => {
    if (!wb) return [] as { id: WorkspaceView; label: string }[];
    const result: { id: WorkspaceView; label: string }[] = [{ id: 'activity', label: 'Activity' }];
    if (wb.artifacts?.length || wb.artifactSeries?.length) {
      result.push({ id: 'artifact', label: 'Artifact' });
    }
    if (wb.sources.length) result.push({ id: 'sources', label: 'Sources' });
    result.push({ id: 'context', label: 'Context' });
    if (wb.report) result.push({ id: 'report', label: 'Report' });
    return result;
  }, [wb]);

  if (!wb) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>暂无工作台数据</Text>
      </View>
    );
  }

  const statusCopy =
    ACTIVITY_STATUS_COPY[wb.activityStatus ?? 'running'] ?? ACTIVITY_STATUS_COPY.running;
  const client = getAgentClient();
  const focus = wb.focusTarget;
  const selectedExec =
    focus?.kind === 'tool_call'
      ? wb.executions.find((item) => item.toolCallId === focus.toolCallId)
      : wb.executions[wb.executions.length - 1];

  return (
    <View style={styles.root}>
      <View style={styles.progressStrip}>
        <Text style={styles.progressTitle}>{statusCopy.title}</Text>
        <Text style={styles.progressSubtitle}>{statusCopy.subtitle}</Text>
        {wb.plan && wb.activityStatus === 'running' ? (
          <Text style={styles.planBadge}>
            第{' '}
            {Math.max(1, wb.plan.plan.findIndex((step) => step.status === 'in_progress') + 1)} /{' '}
            {wb.plan.plan.length} 步
          </Text>
        ) : null}
        <View style={styles.row}>
          <Pressable style={styles.controlBtn} onPress={() => void pauseActiveRun()}>
            <Text>暂停</Text>
          </Pressable>
          <Pressable style={styles.controlBtn} onPress={() => void resumeActiveRun()}>
            <Text>继续</Text>
          </Pressable>
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs}>
        {views.map((tab) => (
          <Pressable
            key={tab.id}
            style={[styles.tab, wb.activeView === tab.id && styles.tabActive]}
            onPress={() => setWorkbenchView(tab.id)}
          >
            <Text style={wb.activeView === tab.id ? styles.tabTextActive : styles.tabText}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <ScrollView style={styles.body}>
        {wb.activeView === 'activity' ? (
          <>
            {selectedExec?.terminal ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Bash</Text>
                <Text style={styles.mono}>
                  {formatBashTerminalOutput(
                    selectedExec.terminal,
                    selectedExec.status === 'running' || selectedExec.status === 'cancelling',
                  )}
                </Text>
              </View>
            ) : null}
            {wb.executions.map((exec) => (
              <Pressable
                key={exec.toolCallId}
                style={[
                  styles.card,
                  focus?.kind === 'tool_call' && focus.toolCallId === exec.toolCallId && styles.cardFocus,
                ]}
                onPress={() =>
                  focusWorkbench({
                    kind: 'tool_call',
                    runId: exec.runId,
                    stepId: exec.stepId,
                    toolCallId: exec.toolCallId,
                  })
                }
              >
                <Text style={styles.cardTitle}>{exec.title}</Text>
                <Text style={styles.cardMeta}>{exec.status}</Text>
                {exec.outputSummary || exec.detail ? (
                  <Text style={styles.mono}>{(exec.outputSummary ?? exec.detail).slice(0, 800)}</Text>
                ) : null}
              </Pressable>
            ))}
          </>
        ) : null}
        {wb.activeView === 'sources'
          ? wb.sources.map((source) => (
              <View key={source.id} style={styles.card}>
                <Text style={styles.cardTitle}>{source.title}</Text>
                <Text style={styles.cardMeta}>{source.url}</Text>
                <Text style={styles.mono}>{source.excerpt}</Text>
              </View>
            ))
          : null}
        {wb.activeView === 'report' && wb.report ? (
          <WebView
            style={styles.webview}
            originWhitelist={['*']}
            source={{
              html: `<html><body style="font-family: -apple-system; padding: 16px;">${
                wb.report.markdown ?? wb.report.title
              }</body></html>`,
            }}
          />
        ) : null}
        {wb.activeView === 'artifact'
          ? (wb.artifactSeries ?? []).flatMap((series) =>
              series.versions.map((version) => (
                <View key={version.artifactId} style={styles.card}>
                  <Text style={styles.cardTitle}>{version.fileName}</Text>
                  <Text style={styles.cardMeta}>v{version.versionNumber}</Text>
                  <View style={styles.row}>
                    <Pressable
                      onPress={() => router.push(`/preview/${version.artifactId}` as never)}
                    >
                      <Text style={styles.link}>预览</Text>
                    </Pressable>
                    <Pressable onPress={() => beginArtifactRevision(version)}>
                      <Text style={styles.link}>Revise</Text>
                    </Pressable>
                    <Pressable
                      onPress={() =>
                        Alert.alert('恢复版本', '将系列当前指针恢复到此版本？', [
                          { text: '取消', style: 'cancel' },
                          {
                            text: '恢复',
                            onPress: () => void restoreArtifactVersion(version),
                          },
                        ])
                      }
                    >
                      <Text style={styles.link}>Restore</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        const url = client.getArtifactDownloadUrl(version.artifactId);
                        void import('expo-linking').then((Linking) => Linking.openURL(url));
                      }}
                    >
                      <Text style={styles.link}>下载</Text>
                    </Pressable>
                  </View>
                </View>
              )),
            )
          : null}
        {wb.activeView === 'context' ? (
          <Text style={styles.mono}>{JSON.stringify(uiState.context ?? wb.context ?? {}, null, 2)}</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: colors.textMuted },
  progressStrip: {
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
    gap: 4,
  },
  progressTitle: { fontWeight: '700', fontSize: 16, color: colors.textPrimary },
  progressSubtitle: { color: colors.textSecondary, fontSize: 13 },
  planBadge: { color: colors.accent, fontSize: 13, marginTop: 4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  controlBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    justifyContent: 'center',
  },
  tabs: { maxHeight: 48, borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  tabActive: { borderBottomWidth: 2, borderBottomColor: colors.accent },
  tabText: { color: colors.textSecondary },
  tabTextActive: { color: colors.accent, fontWeight: '600' },
  body: { flex: 1, padding: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  cardFocus: { borderColor: colors.accent },
  cardTitle: { fontWeight: '600', color: colors.textPrimary },
  cardMeta: { color: colors.textMuted, fontSize: 13 },
  mono: { fontFamily: 'Menlo', fontSize: 12, color: colors.textPrimary },
  link: { color: colors.accent, marginRight: spacing.md },
  webview: { height: 420 },
});

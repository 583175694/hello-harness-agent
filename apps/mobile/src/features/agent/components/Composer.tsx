import type { ToolApprovalDecision } from '@harness/agent-protocol';
import * as Clipboard from 'expo-clipboard';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, spacing } from '@/theme/tokens';
import { AGENT_UI_BEHAVIOR, AGENT_UI_COPY } from '../config/ui.constants';
import { useAgentSession } from '../context/agent-session-context';
import { ContextRing } from './ContextRing';
import { FollowUpQueue } from './FollowUpQueue';
import { PlanFloatingCard } from './PlanFloatingCard';

function nextPastedTextFileName(existing: { fileName: string }[]): string {
  const used = new Set(
    existing.map((item) => item.fileName).filter((name) => /^pasted-text(?:-\d+)?\.txt$/u.test(name)),
  );
  if (!used.has('pasted-text.txt')) return 'pasted-text.txt';
  for (let index = 2; index < 100; index += 1) {
    const fileName = `pasted-text-${index}.txt`;
    if (!used.has(fileName)) return fileName;
  }
  return `pasted-text-${Date.now()}.txt`;
}

export function Composer() {
  const {
    prompt,
    setPrompt,
    submitPrompt,
    cancelActiveRun,
    submitting,
    composerMode,
    serviceState,
    attachments,
    pickDocument,
    pickImage,
    removeAttachment,
    retryAttachment,
    models,
    selectedModel,
    setSelectedModel,
    reasoningEffort,
    setReasoningEffort,
    uiState,
    respondClarification,
    approveToolDecisions,
    pendingInputs,
    promotePending,
    cancelPending,
    sendPending,
    pasteAttachments,
    clearRevisionContext,
  } = useAgentSession();

  const interrupt = uiState.activeInterrupt ?? uiState.workbench?.activeInterrupt;
  const context = uiState.context ?? uiState.workbench?.context;
  const [expandedTool, setExpandedTool] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, ToolApprovalDecision['decision']>>(
    {},
  );

  const selectedModelConfig = models.find((model) => model.id === selectedModel);
  const reasoningLevels = selectedModelConfig?.reasoning.levels ?? ['off', 'low', 'high', 'max'];

  const placeholder = useMemo(() => {
    if (composerMode === 'steer') return AGENT_UI_COPY.composerPlaceholders.steer;
    if (composerMode === 'disabled') return AGENT_UI_COPY.composerPlaceholders.disabled;
    if (composerMode === 'clarification') return AGENT_UI_COPY.composerPlaceholders.clarification;
    return AGENT_UI_COPY.composerPlaceholders.newRun;
  }, [composerMode]);

  const planVisible =
    submitting &&
    ['running', 'queued', 'cancel_requested'].includes(
      uiState.workbench?.activityStatus ?? 'running',
    );

  async function handlePaste() {
    const text = await Clipboard.getStringAsync();
    if (!text) return;
    if ([...text].length > AGENT_UI_BEHAVIOR.longPasteThresholdCodePoints) {
      await pasteAttachments([
        new File([text], nextPastedTextFileName(attachments), { type: 'text/plain' }),
      ]);
      return;
    }
    setPrompt(prompt ? `${prompt}\n${text}` : text);
  }

  return (
    <View style={styles.wrap}>
      <PlanFloatingCard plan={uiState.workbench?.plan} visible={planVisible} />
      <FollowUpQueue
        state={uiState}
        pendingInputs={pendingInputs}
        submitting={submitting}
        onPromotePending={(id) => void promotePending(id)}
        onCancelPending={(id) => void cancelPending(id)}
        onSendPending={(id) => void sendPending(id)}
      />
      {uiState.revisionContext ? (
        <View style={styles.revisionBanner}>
          <Text style={styles.revisionText}>正在基于 Artifact 版本发起修改</Text>
          <Pressable onPress={clearRevisionContext}>
            <Text style={styles.revisionClear}>清除</Text>
          </Pressable>
        </View>
      ) : null}
      {interrupt?.kind === 'clarification' ? (
        <View style={styles.hitlBox}>
          <Text style={styles.hitlTitle}>{interrupt.payload.question}</Text>
          {interrupt.payload.options.map((option) => (
            <Pressable
              key={option}
              style={styles.optionBtn}
              onPress={() => void respondClarification(interrupt.interruptId, option)}
            >
              <Text>{option}</Text>
            </Pressable>
          ))}
          {interrupt.payload.allowFreeText ? (
            <>
              <TextInput
                style={styles.input}
                value={prompt}
                onChangeText={setPrompt}
                placeholder="自由回答"
              />
              <Pressable
                style={styles.primaryBtn}
                onPress={() => void respondClarification(interrupt.interruptId, prompt.trim())}
              >
                <Text style={styles.primaryBtnText}>提交澄清</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      ) : null}
      {interrupt?.kind === 'tool_approval' ? (
        <View style={styles.hitlBox}>
          <Text style={styles.hitlTitle}>工具调用待审批</Text>
          {interrupt.payload.items.map((item) => {
            const decision = decisions[item.toolCallId] ?? 'approve';
            const expanded = expandedTool === item.toolCallId;
            return (
              <View key={item.toolCallId} style={styles.approvalCard}>
                <Pressable onPress={() => setExpandedTool(expanded ? null : item.toolCallId)}>
                  <Text style={styles.approvalTitle}>{item.toolName}</Text>
                </Pressable>
                {expanded ? (
                  <Text style={styles.approvalDetail}>{JSON.stringify(item.input, null, 2)}</Text>
                ) : null}
                <View style={styles.row}>
                  <Pressable
                    style={[styles.chip, decision === 'reject' && styles.chipActive]}
                    onPress={() =>
                      setDecisions((current) => ({ ...current, [item.toolCallId]: 'reject' }))
                    }
                  >
                    <Text>拒绝</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.chip, decision === 'approve' && styles.chipActive]}
                    onPress={() =>
                      setDecisions((current) => ({ ...current, [item.toolCallId]: 'approve' }))
                    }
                  >
                    <Text>批准</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
          <View style={styles.row}>
            <Pressable style={styles.secondaryBtn} onPress={() => void cancelActiveRun()}>
              <Text>取消 Run</Text>
            </Pressable>
            <Pressable
              style={[styles.primaryBtn, styles.flex]}
              onPress={() =>
                void approveToolDecisions(
                  interrupt.interruptId,
                  interrupt.payload.items.map((item) => ({
                    itemId: item.itemId,
                    toolCallId: item.toolCallId,
                    argumentsHash: item.argumentsHash,
                    decision: decisions[item.toolCallId] ?? 'approve',
                  })),
                )
              }
            >
              <Text style={styles.primaryBtnText}>提交审批</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {!interrupt ? (
        <>
          {composerMode === 'steer' ? (
            <Text style={styles.steerHint}>{AGENT_UI_COPY.steerAcceptedHint}</Text>
          ) : null}
          <View style={styles.row}>
            {composerMode === 'new-run' ? (
              <>
                <Pressable
                  style={styles.chip}
                  onPress={() => void pickDocument()}
                  disabled={serviceState !== 'ready'}
                >
                  <Text style={styles.chipText}>文档</Text>
                </Pressable>
                <Pressable
                  style={styles.chip}
                  onPress={() => void pickImage()}
                  disabled={serviceState !== 'ready'}
                >
                  <Text style={styles.chipText}>图片</Text>
                </Pressable>
                <Pressable
                  style={styles.chip}
                  onPress={() => void handlePaste()}
                  disabled={serviceState !== 'ready'}
                >
                  <Text style={styles.chipText}>粘贴</Text>
                </Pressable>
              </>
            ) : null}
            {composerMode !== 'steer' && composerMode !== 'clarification'
              ? models.map((model) => (
                  <Pressable
                    key={model.id}
                    style={[styles.chip, selectedModel === model.id && styles.chipActive]}
                    onPress={() => setSelectedModel(model.id)}
                  >
                    <Text style={styles.chipText}>{model.label}</Text>
                  </Pressable>
                ))
              : null}
            {composerMode !== 'steer' && composerMode !== 'clarification'
              ? reasoningLevels.map((level) => (
                  <Pressable
                    key={level}
                    style={[styles.chip, reasoningEffort === level && styles.chipActive]}
                    onPress={() => setReasoningEffort(level)}
                  >
                    <Text style={styles.chipText}>{level}</Text>
                  </Pressable>
                ))
              : null}
            <ContextRing context={context} />
          </View>
          {attachments.length ? (
            <View style={styles.attachRow}>
              {attachments.map((file) => (
                <View key={file.fileId} style={styles.attachItem}>
                  <Text style={styles.attachChip}>
                    {file.fileName} ({file.status})
                  </Text>
                  {file.status === 'failed' ? (
                    <Pressable onPress={() => void retryAttachment(file.fileId)}>
                      <Text style={styles.link}>重试</Text>
                    </Pressable>
                  ) : null}
                  <Pressable onPress={() => removeAttachment(file.fileId)}>
                    <Text style={styles.link}>移除</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
          <TextInput
            style={styles.input}
            multiline
            value={prompt}
            onChangeText={setPrompt}
            placeholder={placeholder}
            editable={composerMode !== 'disabled' && serviceState === 'ready'}
          />
          <View style={styles.row}>
            {submitting && !prompt.trim() ? (
              <Pressable style={styles.secondaryBtn} onPress={() => void cancelActiveRun()}>
                <Text>停止</Text>
              </Pressable>
            ) : null}
            <Pressable
              style={[
                styles.primaryBtn,
                styles.flex,
                (composerMode === 'disabled' || serviceState !== 'ready') && styles.disabled,
              ]}
              disabled={
                composerMode === 'disabled' ||
                serviceState !== 'ready' ||
                (!prompt.trim() && !(submitting && !prompt.trim())) ||
                attachments.some((item) => item.status !== 'ready')
              }
              onPress={() => {
                if (submitting && !prompt.trim()) void cancelActiveRun();
                else void submitPrompt();
              }}
            >
              <Text style={styles.primaryBtnText}>
                {submitting && !prompt.trim()
                  ? '停止'
                  : composerMode === 'steer'
                    ? '发送 Steer'
                    : '发送'}
              </Text>
            </Pressable>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  input: {
    minHeight: 44,
    maxHeight: 140,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
    color: colors.textPrimary,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' },
  flex: { flex: 1 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    minHeight: 44,
    justifyContent: 'center',
  },
  chipActive: { borderColor: colors.accent, backgroundColor: '#eff6ff' },
  chipText: { fontSize: 13, color: colors.textSecondary },
  attachRow: { gap: spacing.sm },
  attachItem: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' },
  attachChip: { fontSize: 13, color: colors.textPrimary },
  link: { color: colors.accent, fontSize: 13 },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  primaryBtnText: { color: '#fff', fontWeight: '600' },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  disabled: { opacity: 0.5 },
  hitlBox: { gap: spacing.sm },
  hitlTitle: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  optionBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: spacing.md,
    minHeight: 44,
    justifyContent: 'center',
  },
  approvalCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    gap: spacing.sm,
  },
  approvalTitle: { fontWeight: '600' },
  approvalDetail: { fontFamily: 'Menlo', fontSize: 11, color: colors.textMuted },
  steerHint: { color: colors.textMuted, fontSize: 13 },
  revisionBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#eff6ff',
    padding: spacing.sm,
    borderRadius: 8,
  },
  revisionText: { color: colors.accent, fontSize: 13 },
  revisionClear: { color: colors.textSecondary, fontSize: 13 },
});

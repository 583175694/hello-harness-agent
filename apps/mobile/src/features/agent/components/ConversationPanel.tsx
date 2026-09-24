import { presentAssistantBlocks, toolTitle } from '@harness/agent-conversation';
import type { ConversationItem } from '@harness/agent-ui-types';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import * as Clipboard from 'expo-clipboard';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/theme/tokens';
import { AGENT_UI_BEHAVIOR } from '../config/ui.constants';
import { useAgentSession } from '../context/agent-session-context';

function UserBubble({
  item,
  fontSize,
  onCopy,
}: {
  item: Extract<ConversationItem, { kind: 'user' }>;
  fontSize: number;
  onCopy: (text: string) => void;
}) {
  return (
    <Pressable style={styles.userRow} onLongPress={() => onCopy(item.content)}>
      <View style={styles.userBubble}>
        <Text style={[styles.userText, { fontSize }]}>{item.content}</Text>
        {item.attachments?.map((file) => (
          <Text key={file.fileId} style={styles.attachMeta}>
            📎 {file.fileName}
          </Text>
        ))}
        {item.pendingState ? (
          <Text style={styles.attachMeta}>{item.pendingState.replace('_', ' ')}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function AssistantMessage({
  item,
  runId,
  fontSize,
  onFocusTool,
  onCopy,
}: {
  item: Extract<ConversationItem, { kind: 'assistant' }>;
  runId: string;
  fontSize: number;
  onFocusTool: (toolCallId: string) => void;
  onCopy: (text: string) => void;
}) {
  const presentation = presentAssistantBlocks(item.blocks);
  const copyText = `${presentation.finalText}\n${presentation.pendingText}`.trim();
  return (
    <Pressable style={styles.assistantRow} onLongPress={() => copyText && onCopy(copyText)}>
      {presentation.process.map((entry) => {
        if (entry.kind === 'text') {
          return (
            <Text key={entry.block.id} style={[styles.assistantText, { fontSize }]}>
              {entry.block.content}
            </Text>
          );
        }
        if (entry.kind === 'reasoning') {
          return (
            <View key={entry.block.id} style={styles.reasoning}>
              <Text style={styles.reasoningLabel}>推理</Text>
              <Text style={[styles.assistantText, { fontSize: fontSize - 1 }]}>
                {entry.block.content}
              </Text>
            </View>
          );
        }
        if (entry.kind === 'tool') {
          const block = entry.block;
          return (
            <Pressable
              key={block.id}
              style={styles.toolChip}
              onPress={() => onFocusTool(block.toolCallId)}
            >
              <Text style={styles.toolChipTitle}>
                {block.title || toolTitle(block.toolName, {})}
              </Text>
              <Text style={styles.toolChipMeta}>{block.status}</Text>
            </Pressable>
          );
        }
        return null;
      })}
      {presentation.artifacts.map((artifact) => (
        <View key={artifact.id} style={styles.artifactCard}>
          <Text style={styles.toolChipTitle}>{artifact.fileName ?? 'Artifact'}</Text>
        </View>
      ))}
      {presentation.pendingText ? (
        <Text style={[styles.assistantText, { fontSize }]}>{presentation.pendingText}</Text>
      ) : null}
      {presentation.finalText ? (
        <Text style={[styles.assistantText, styles.finalText, { fontSize }]}>
          {presentation.finalText}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function ConversationPanel() {
  const { uiState, focusWorkbench, contentFontSize } = useAgentSession();
  const runId = uiState.activeRunId ?? uiState.workbench?.runId ?? 'run-unknown';
  const data = uiState.conversation;
  const listRef = useRef<FlashListRef<ConversationItem>>(null);
  const stickRef = useRef(true);
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(async (text: string) => {
    await Clipboard.setStringAsync(text);
    setCopied(true);
    setTimeout(() => setCopied(false), AGENT_UI_BEHAVIOR.copyFeedbackDurationMs);
  }, []);

  return (
    <View style={styles.flex}>
      {copied ? <Text style={styles.copyToast}>已复制</Text> : null}
      <FlashList
        ref={listRef}
        style={styles.listFlex}
        data={data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        onScroll={(event) => {
          const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
          stickRef.current =
            contentSize.height - (contentOffset.y + layoutMeasurement.height) <
            AGENT_UI_BEHAVIOR.stickToBottomThresholdPx;
        }}
        onContentSizeChange={() => {
          if (stickRef.current && data.length) {
            listRef.current?.scrollToEnd({ animated: true });
          }
        }}
        renderItem={({ item }) => {
          if (item.kind === 'user') {
            return <UserBubble item={item} fontSize={contentFontSize} onCopy={onCopy} />;
          }
          return (
            <AssistantMessage
              item={item}
              runId={runId}
              fontSize={contentFontSize}
              onCopy={onCopy}
              onFocusTool={(toolCallId) =>
                focusWorkbench({ kind: 'tool_call', runId, stepId: toolCallId, toolCallId })
              }
            />
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  listFlex: { flex: 1 },
  list: { padding: spacing.lg, paddingBottom: 120 },
  copyToast: {
    textAlign: 'center',
    color: colors.success,
    paddingVertical: 4,
    backgroundColor: colors.surface,
  },
  userRow: { alignItems: 'flex-end', marginBottom: spacing.md },
  userBubble: {
    maxWidth: '88%',
    backgroundColor: colors.accent,
    borderRadius: 16,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: 4,
  },
  userText: { color: '#fff', lineHeight: 22 },
  attachMeta: { color: '#dbeafe', fontSize: 12 },
  assistantRow: { marginBottom: spacing.lg, gap: spacing.sm },
  assistantText: { color: colors.textPrimary, lineHeight: 22 },
  finalText: { fontWeight: '600' },
  reasoning: {
    borderLeftWidth: 3,
    borderLeftColor: colors.border,
    paddingLeft: spacing.md,
    gap: 4,
  },
  reasoningLabel: { fontSize: 12, color: colors.textMuted },
  toolChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    backgroundColor: colors.surface,
  },
  artifactCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    backgroundColor: colors.surfaceHover,
  },
  toolChipTitle: { color: colors.textPrimary, fontWeight: '600' },
  toolChipMeta: { color: colors.textMuted, marginTop: 4, fontSize: 13 },
});

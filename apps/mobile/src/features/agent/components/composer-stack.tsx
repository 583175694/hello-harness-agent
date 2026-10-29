import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { showAppAlert } from '@/lib/app-alert';
import { ArrowUp, Plus, Square } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { useComposerPlaceholderColor } from '@/lib/use-composer-placeholder';
import { AGENT_UI_COPY, AGENT_UI_LAYOUT } from '../config/ui.constants';
import type { MobileComposerFixture } from '../fixtures/mobile-preview.types';
import type { ComposerAttachmentFixture } from '../fixtures/ui-fixtures';
import { catalogPlanFixture } from '../fixtures/ui-catalog-fixtures';
import { composerAttachmentsFixture } from '../fixtures/ui-fixtures';
import { SkillMentionChip } from './agent-elements/skill-mention-chip';
import { FollowUpQueuePanel } from './agent-elements/follow-up-queue-panel';
import { PlanFloatingCard } from './agent-elements/plan-floating-card';
import { ComposerAttachmentSheet } from './composer-attachment-sheet';
import { ComposerAttachments } from './composer-attachments';
import { ComposerClarificationPanel } from './composer-clarification-panel';
import { ComposerHitlPanel } from './composer-hitl-panel';
import type { PendingInterruptSnapshot } from '@harness/agent-protocol';
import type { ComposerSubmitPayload } from '../model/composer-submit.types';
import {
  ComposerModelMenu,
  type ModelFixture,
  type ReasoningEffort,
  modelFixtures,
} from './composer-model-menu';
import { ComposerSkillPickerSheet } from './composer-skill-picker-sheet';

type ComposerStackProps = MobileComposerFixture & {
  bottomInset?: number;
  /** UI Catalog：外部控制附件 Sheet 可见性 */
  attachmentSheetOpen?: boolean;
  onAttachmentSheetOpenChange?: (open: boolean) => void;
  /** 预览页等无全屏 relative 容器时用 `modal` */
  attachmentSheetPresentation?: 'overlay' | 'modal';
  skillPickerOpen?: boolean;
  onSkillPickerOpenChange?: (open: boolean) => void;
  /** 由 Chat 根层渲染附件/Skill overlay 时设为 true */
  hideInlineOverlays?: boolean;
  /** Plan 由 Chat 根层 overlay 渲染，避免被 Composer 气泡 clip */
  planHostOverlay?: boolean;
  onChromeLayout?: (height: number) => void;
  onToggleSkill?: (name: string) => void;
  onSubmit?: (payload: ComposerSubmitPayload) => void;
  composerModels?: ModelFixture[];
  defaultModelId?: string | null;
  defaultReasoningEffort?: ReasoningEffort;
  composerPlan?: { step: string; status: 'pending' | 'in_progress' | 'completed' }[];
  composerPlanExplanation?: string;
  followUpItems?: { id: string; content: string }[];
  followUpSubmittingId?: string | null;
  onFollowUpSend?: (inputId: string) => void;
  onFollowUpDismiss?: (inputId: string) => void;
  composerRevisionSeed?: string | null;
  activeInterrupt?: PendingInterruptSnapshot | null;
  hitlSubmitting?: boolean;
  onClarificationRespond?: (answer: string) => void;
  onToolApproval?: (approve: boolean) => void;
  composerAttachments?: ComposerAttachmentFixture[];
  onPickImages?: () => void;
  onPickFiles?: () => void;
  onRemoveAttachment?: (id: string) => void;
  onRetryAttachment?: (id: string) => void;
  onReconcileDraftChange?: (before: string, after: string) => string;
  onCancelRun?: () => void;
};

export function ComposerStack({
  mode = 'default',
  bottomInset = 0,
  showAttachmentSamples = false,
  showPlan = false,
  showFollowUp = false,
  submitting = false,
  selectedSkills: selectedSkillsProp,
  composerTextMode = 'new-run',
  attachmentSheetOpen: attachmentSheetOpenProp,
  onAttachmentSheetOpenChange,
  attachmentSheetPresentation = 'overlay',
  skillPickerOpen: skillPickerOpenProp,
  onSkillPickerOpenChange,
  hideInlineOverlays = false,
  planHostOverlay = false,
  onChromeLayout,
  onToggleSkill,
  onSubmit,
  onCancelRun,
  composerModels,
  defaultModelId,
  defaultReasoningEffort = 'high',
  composerPlan,
  composerPlanExplanation,
  followUpItems: followUpItemsProp,
  followUpSubmittingId = null,
  onFollowUpSend,
  onFollowUpDismiss,
  composerRevisionSeed = null,
  activeInterrupt = null,
  hitlSubmitting = false,
  onClarificationRespond,
  onToolApproval,
  composerAttachments,
  onPickImages,
  onPickFiles,
  onRemoveAttachment,
  onRetryAttachment,
  onReconcileDraftChange,
}: ComposerStackProps) {
  const safeBottom = Math.max(bottomInset, 8);
  const composerPlaceholderColor = useComposerPlaceholderColor();
  const [attachmentSheetOpenLocal, setAttachmentSheetOpenLocal] = useState(false);
  const [skillPickerOpenLocal, setSkillPickerOpenLocal] = useState(false);
  const afterAttachmentSheetCloseRef = useRef<(() => void) | null>(null);
  const [selectedSkillsLocal, setSelectedSkillsLocal] = useState<string[]>(
    selectedSkillsProp ?? [],
  );
  const [draft, setDraft] = useState('');
  const catalog = composerModels?.length ? composerModels : modelFixtures;
  const [modelId, setModelId] = useState(defaultModelId ?? catalog[0]?.id ?? 'deepseek-chat');
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>(defaultReasoningEffort);

  useEffect(() => {
    if (defaultModelId) setModelId(defaultModelId);
  }, [defaultModelId]);

  useEffect(() => {
    setReasoningEffort(defaultReasoningEffort);
  }, [defaultReasoningEffort]);

  useEffect(() => {
    if (composerRevisionSeed) {
      setDraft(composerRevisionSeed);
    }
  }, [composerRevisionSeed]);

  const selectedSkills = selectedSkillsProp ?? selectedSkillsLocal;

  const skillPickerControlled = skillPickerOpenProp !== undefined;
  const skillPickerOpen = skillPickerControlled ? skillPickerOpenProp : skillPickerOpenLocal;
  const setSkillPickerOpen = (open: boolean) => {
    if (skillPickerControlled) {
      onSkillPickerOpenChange?.(open);
    } else {
      setSkillPickerOpenLocal(open);
    }
  };

  const attachmentSheetControlled = attachmentSheetOpenProp !== undefined;
  const attachmentSheetOpen = attachmentSheetControlled
    ? attachmentSheetOpenProp
    : attachmentSheetOpenLocal;

  const setAttachmentSheetOpen = (open: boolean) => {
    if (attachmentSheetControlled) {
      onAttachmentSheetOpenChange?.(open);
    } else {
      setAttachmentSheetOpenLocal(open);
    }
  };

  const closeAttachmentSheetThen = (next: () => void) => {
    afterAttachmentSheetCloseRef.current = next;
    setAttachmentSheetOpen(false);
  };

  const handleAttachmentSheetDidClose = useCallback(() => {
    const next = afterAttachmentSheetCloseRef.current;
    afterAttachmentSheetCloseRef.current = null;
    next?.();
  }, []);

  const toggleSkill = useCallback(
    (name: string) => {
      if (selectedSkillsProp !== undefined && onToggleSkill) {
        onToggleSkill(name);
        return;
      }
      setSelectedSkillsLocal((prev) =>
        prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name],
      );
    },
    [onToggleSkill, selectedSkillsProp],
  );

  const removeSkill = useCallback(
    (name: string) => {
      toggleSkill(name);
    },
    [toggleSkill],
  );

  const attachments =
    composerAttachments ??
    (showAttachmentSamples
      ? [
          ...composerAttachmentsFixture,
          {
            id: 'demo-file',
            fileName: 'requirements.md',
            size: 4_096,
            kind: 'file' as const,
            status: 'ready' as const,
          },
        ]
      : composerAttachmentsFixture);

  const queuedFollowUps = followUpItemsProp ?? [];
  const livePlan = composerPlan;
  const planVisible =
    !planHostOverlay &&
    (showPlan || Boolean(livePlan?.length)) &&
    submitting &&
    !attachmentSheetOpen &&
    !skillPickerOpen;
  const followUpVisible = (showFollowUp || queuedFollowUps.length > 0) && queuedFollowUps.length > 0;

  const placeholder = useMemo(() => {
    if (composerTextMode === 'steer') return AGENT_UI_COPY.composerPlaceholders.steer;
    if (composerTextMode === 'clarification') return AGENT_UI_COPY.composerPlaceholders.clarification;
    if (composerTextMode === 'disabled') return AGENT_UI_COPY.composerPlaceholders.disabled;
    return AGENT_UI_COPY.composerPlaceholders.newRun;
  }, [composerTextMode]);

  const inputDisabled = composerTextMode === 'disabled';

  const effectiveMode =
    activeInterrupt?.kind === 'clarification'
      ? 'clarification'
      : activeInterrupt?.kind === 'tool_approval'
        ? 'hitl'
        : mode;

  const handleSend = useCallback(() => {
    const text = draft.trim();
    if (!text || inputDisabled || submitting) return;
    const blocked = attachments.filter(
      (item) => item.status === 'processing' || item.status === 'failed',
    );
    if (blocked.length > 0) {
      showAppAlert({
        title: '附件未就绪',
        message: blocked.some((item) => item.status === 'failed')
          ? '请先重试或移除上传失败的附件。'
          : '请等待附件上传完成。',
      });
      return;
    }
    const attachmentIds = attachments
      .filter((item) => item.status === 'ready')
      .map((item) => item.id);
    onSubmit?.({
      content: text,
      modelId,
      reasoningEffort,
      skillNames: selectedSkills.length ? selectedSkills : undefined,
      attachmentIds: attachmentIds.length ? attachmentIds : undefined,
    });
    setDraft('');
  }, [attachments, draft, inputDisabled, modelId, onSubmit, reasoningEffort, selectedSkills, submitting]);

  if (effectiveMode === 'clarification') {
    const clarificationInterrupt =
      activeInterrupt?.kind === 'clarification' ? activeInterrupt : undefined;
    return (
      <View className="bg-canvas px-3" style={{ paddingBottom: safeBottom }}>
        <ComposerClarificationPanel
          interrupt={clarificationInterrupt}
          submitting={hitlSubmitting}
          onSubmit={(answer) => {
            if (clarificationInterrupt) {
              onClarificationRespond?.(answer);
            }
          }}
          onCancelRun={onCancelRun}
        />
      </View>
    );
  }

  if (effectiveMode === 'hitl') {
    const approvalInterrupt =
      activeInterrupt?.kind === 'tool_approval' ? activeInterrupt : undefined;
    return (
      <View
        className="border-t border-composer-border bg-canvas px-3 pt-2"
        style={{ paddingBottom: safeBottom }}
      >
        <ComposerHitlPanel
          interrupt={approvalInterrupt}
          submitting={hitlSubmitting}
          onApprove={() => onToolApproval?.(true)}
          onReject={() => onToolApproval?.(false)}
          onCancelRun={onCancelRun}
        />
      </View>
    );
  }

  const showStop = submitting && !draft.trim();

  return (
    <>
      <View
        className="bg-canvas px-3"
        style={{ paddingBottom: safeBottom }}
        onLayout={
          onChromeLayout
            ? (e) => onChromeLayout(e.nativeEvent.layout.height)
            : undefined
        }
      >
        {followUpVisible ? (
          <View className="mb-2">
            <FollowUpQueuePanel
              items={queuedFollowUps}
              submittingId={followUpSubmittingId}
              onSend={onFollowUpSend}
              onDismiss={onFollowUpDismiss}
            />
          </View>
        ) : null}

        <View className="relative">
          <View className="gap-2 rounded-bubble border border-composer-border bg-surface px-3 py-2.5">
            {selectedSkills.length > 0 ? (
              <View className="flex-row flex-wrap">
                {selectedSkills.map((name) => (
                  <SkillMentionChip
                    key={name}
                    name={name}
                    mode="editable"
                    onRemove={() => removeSkill(name)}
                  />
                ))}
              </View>
            ) : null}
            {attachments.length > 0 ? (
              <ComposerAttachments
                items={attachments}
                onRemove={onRemoveAttachment}
                onRetry={onRetryAttachment}
              />
            ) : null}

            <View className="relative w-full">
              {planVisible ? (
                <View
                  className="absolute bottom-full mb-2.5 w-full items-center"
                  style={{ zIndex: AGENT_UI_LAYOUT.composerPlanZIndex }}
                >
                  <PlanFloatingCard
                    plan={livePlan ?? catalogPlanFixture.plan}
                    explanation={composerPlanExplanation ?? catalogPlanFixture.explanation}
                  />
                </View>
              ) : null}
              <TextInput
                multiline
                scrollEnabled
                editable={!inputDisabled}
                accessibilityLabel="任务输入"
                value={draft}
                onChangeText={(text) => {
                  setDraft((before) =>
                    onReconcileDraftChange ? onReconcileDraftChange(before, text) : text,
                  );
                  if (text.startsWith('/')) setSkillPickerOpen(true);
                }}
                placeholder={placeholder}
                placeholderTextColor={composerPlaceholderColor}
                className="w-full px-0 py-1 text-[14px] leading-[22px] text-primary"
                style={{
                  minHeight: AGENT_UI_LAYOUT.composerInputMinHeightPx,
                  maxHeight: AGENT_UI_LAYOUT.composerInputMaxHeightPx,
                }}
                textAlignVertical="top"
              />
            </View>

            <View className="flex-row items-center justify-between gap-2">
              <Pressable
                className="h-11 w-11 items-center justify-center rounded-control active:bg-subtle"
                accessibilityRole="button"
                accessibilityLabel="添加附件与 Skill"
                onPress={() => setAttachmentSheetOpen(true)}
              >
                <Icon icon={Plus} tone="primary" size={20} />
              </Pressable>

              <View className="flex-1 flex-row items-center justify-end gap-1">
                {composerTextMode !== 'clarification' ? (
                  <ComposerModelMenu
                    presentation={hideInlineOverlays ? 'overlay' : 'modal'}
                    modelId={modelId}
                    reasoningEffort={reasoningEffort}
                    models={composerModels}
                    onModelChange={setModelId}
                    onReasoningChange={setReasoningEffort}
                    disabled={inputDisabled}
                  />
                ) : null}
                <PressableScale
                  className={`h-8 w-8 items-center justify-center rounded-full ${
                    showStop ? 'bg-primary' : submitting ? 'bg-muted' : 'bg-primary'
                  }`}
                  accessibilityLabel={showStop ? '停止运行' : submitting ? '停止运行' : '发送任务'}
                  onPress={showStop ? onCancelRun : handleSend}
                >
                  {showStop ? (
                    <Icon icon={Square} tone="onPrimary" size={14} />
                  ) : (
                    <Icon icon={ArrowUp} tone="onPrimary" size={18} />
                  )}
                </PressableScale>
              </View>
            </View>
          </View>
        </View>
      </View>

      {!hideInlineOverlays ? (
        <>
          <ComposerAttachmentSheet
            presentation={attachmentSheetPresentation}
            visible={attachmentSheetOpen}
            onClose={() => setAttachmentSheetOpen(false)}
            onDidClose={handleAttachmentSheetDidClose}
            onOpenSkills={() => closeAttachmentSheetThen(() => setSkillPickerOpen(true))}
            onPickImages={onPickImages}
            onPickFiles={onPickFiles}
          />
          <ComposerSkillPickerSheet
            visible={skillPickerOpen}
            selected={selectedSkills}
            onClose={() => setSkillPickerOpen(false)}
            onToggleSkill={toggleSkill}
          />
        </>
      ) : null}
    </>
  );
}

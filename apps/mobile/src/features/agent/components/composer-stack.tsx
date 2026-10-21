import { useCallback, useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { ArrowUp, Plus, Square } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { AGENT_UI_COPY } from '../config/ui.constants';
import type { MobileComposerFixture } from '../fixtures/mobile-preview.types';
import { catalogContextFixture, catalogPlanFixture } from '../fixtures/ui-catalog-fixtures';
import { composerAttachmentsFixture } from '../fixtures/ui-fixtures';
import { ComposerContextRing } from './agent-elements/composer-context-ring';
import { SkillMentionChip } from './agent-elements/skill-mention-chip';
import { FollowUpQueuePanel } from './agent-elements/follow-up-queue-panel';
import { PlanFloatingCard } from './agent-elements/plan-floating-card';
import { ComposerAttachmentSheet } from './composer-attachment-sheet';
import { ComposerAttachments } from './composer-attachments';
import { ComposerClarificationPanel } from './composer-clarification-panel';
import { ComposerHitlPanel } from './composer-hitl-panel';
import {
  ComposerModelMenu,
  type ReasoningEffort,
  modelFixtures,
} from './composer-model-menu';
import { ComposerSkillPickerSheet } from './composer-skill-picker-sheet';

type ComposerStackProps = MobileComposerFixture & {
  bottomInset?: number;
  suppressPlanOverlay?: boolean;
  attachmentSheetOpen?: boolean;
  onAttachmentSheetOpenChange?: (open: boolean) => void;
  onOpenAttachmentSheet?: () => void;
  onCancelRun?: () => void;
};

export function ComposerStack({
  mode = 'default',
  bottomInset = 0,
  showAttachmentSamples = false,
  showPlan = false,
  showFollowUp = false,
  followUpItems = [],
  submitting = false,
  selectedSkills: selectedSkillsProp,
  showContextRing = true,
  composerTextMode = 'new-run',
  suppressPlanOverlay = false,
  attachmentSheetOpen: attachmentSheetOpenProp,
  onAttachmentSheetOpenChange,
  onOpenAttachmentSheet,
  onCancelRun,
}: ComposerStackProps) {
  const safeBottom = Math.max(bottomInset, 8);
  const [attachmentSheetOpenLocal, setAttachmentSheetOpenLocal] = useState(false);
  const [skillPickerOpen, setSkillPickerOpen] = useState(false);
  const [selectedSkillsLocal, setSelectedSkillsLocal] = useState<string[]>(
    selectedSkillsProp ?? [],
  );
  const [draft, setDraft] = useState('');
  const [modelId, setModelId] = useState(modelFixtures[0]?.id ?? 'deepseek-chat');
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>('high');

  const selectedSkills = selectedSkillsProp ?? selectedSkillsLocal;

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

  const handleOpenAttachmentSheet = () => {
    if (onOpenAttachmentSheet) {
      onOpenAttachmentSheet();
      return;
    }
    setAttachmentSheetOpen(true);
  };

  const toggleSkill = useCallback(
    (name: string) => {
      if (selectedSkillsProp) return;
      setSelectedSkillsLocal((prev) =>
        prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name],
      );
    },
    [selectedSkillsProp],
  );

  const removeSkill = useCallback(
    (name: string) => {
      if (selectedSkillsProp) return;
      setSelectedSkillsLocal((prev) => prev.filter((s) => s !== name));
    },
    [selectedSkillsProp],
  );

  const attachments = showAttachmentSamples
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
    : composerAttachmentsFixture;

  const planVisible = showPlan && submitting && !suppressPlanOverlay;

  const placeholder = useMemo(() => {
    if (composerTextMode === 'steer') return AGENT_UI_COPY.composerPlaceholders.steer;
    if (composerTextMode === 'clarification') return AGENT_UI_COPY.composerPlaceholders.clarification;
    if (composerTextMode === 'disabled') return AGENT_UI_COPY.composerPlaceholders.disabled;
    return AGENT_UI_COPY.composerPlaceholders.newRun;
  }, [composerTextMode]);

  const inputDisabled = composerTextMode === 'disabled';

  if (mode === 'clarification') {
    return (
      <View className="bg-canvas px-3 pt-1" style={{ paddingBottom: safeBottom }}>
        <ComposerClarificationPanel submitting={submitting} onCancelRun={onCancelRun} />
      </View>
    );
  }

  if (mode === 'hitl') {
    return (
      <View
        className="border-t border-composer-border bg-canvas px-3 pt-2"
        style={{ paddingBottom: safeBottom }}
      >
        <ComposerHitlPanel />
      </View>
    );
  }

  const showStop = submitting && !draft.trim();

  return (
    <>
      <View
        className="bg-canvas px-3 pt-1"
        style={{ paddingBottom: safeBottom, paddingTop: planVisible ? 8 : 4 }}
      >
        {showFollowUp && followUpItems.length > 0 ? (
          <View className="mb-2">
            <FollowUpQueuePanel items={followUpItems} />
          </View>
        ) : null}

        <View className="relative">
          {planVisible ? (
            <View className="absolute bottom-full z-10 mb-2.5 w-full items-center">
              <PlanFloatingCard
                plan={catalogPlanFixture.plan}
                explanation={catalogPlanFixture.explanation}
              />
            </View>
          ) : null}

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
            {attachments.length > 0 ? <ComposerAttachments items={attachments} /> : null}

            <TextInput
              multiline
              editable={!inputDisabled}
              value={draft}
              onChangeText={(text) => {
                setDraft(text);
                if (text.startsWith('/')) setSkillPickerOpen(true);
              }}
              placeholder={placeholder}
              placeholderTextColor="#898986"
              className="min-h-[44px] max-h-24 flex-1 px-0 py-1 text-[14px] leading-[22px] text-primary"
              textAlignVertical="top"
            />

            <View className="flex-row items-center justify-between gap-2">
              <Pressable
                className="h-11 w-11 items-center justify-center rounded-control active:bg-subtle"
                accessibilityRole="button"
                accessibilityLabel="添加附件与 Skill"
                onPress={handleOpenAttachmentSheet}
              >
                <Icon icon={Plus} tone="primary" size={20} />
              </Pressable>

              <View className="flex-1 flex-row items-center justify-end gap-1">
                {showContextRing ? (
                  <ComposerContextRing
                    usedTokens={catalogContextFixture.estimatedInputTokens}
                    budgetTokens={catalogContextFixture.promptBudget}
                    compactionTriggered={catalogContextFixture.compactionTriggered}
                  />
                ) : null}
                {composerTextMode !== 'steer' && composerTextMode !== 'clarification' ? (
                  <ComposerModelMenu
                    modelId={modelId}
                    reasoningEffort={reasoningEffort}
                    onModelChange={setModelId}
                    onReasoningChange={setReasoningEffort}
                    disabled={submitting || inputDisabled}
                  />
                ) : null}
                <PressableScale
                  className={`h-8 w-8 items-center justify-center rounded-full ${
                    showStop ? 'bg-primary' : submitting ? 'bg-muted' : 'bg-primary'
                  }`}
                  accessibilityLabel={showStop ? '停止运行' : submitting ? '停止运行' : '发送任务'}
                  onPress={showStop ? onCancelRun : undefined}
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

      <ComposerAttachmentSheet
        visible={attachmentSheetOpen}
        onClose={() => setAttachmentSheetOpen(false)}
        onOpenSkills={() => setSkillPickerOpen(true)}
      />
      <ComposerSkillPickerSheet
        visible={skillPickerOpen}
        selected={selectedSkills}
        onClose={() => setSkillPickerOpen(false)}
        onToggleSkill={toggleSkill}
      />
    </>
  );
}

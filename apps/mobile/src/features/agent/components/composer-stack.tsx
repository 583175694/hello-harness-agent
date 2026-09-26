import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { ArrowUp, Plus } from 'lucide-react-native';
import { AGENT_UI_COPY } from '../config/ui.constants';
import type { MobileComposerFixture } from '../fixtures/mobile-preview.types';
import { catalogPlanFixture } from '../fixtures/ui-catalog-fixtures';
import { composerAttachmentsFixture } from '../fixtures/ui-fixtures';
import { FollowUpQueuePanel } from './agent-elements/follow-up-queue-panel';
import { PlanFloatingCard } from './agent-elements/plan-floating-card';
import { ComposerAttachmentSheet } from './composer-attachment-sheet';
import { ComposerAttachments } from './composer-attachments';
import { ComposerClarificationPanel } from './composer-clarification-panel';
import { ComposerHitlPanel } from './composer-hitl-panel';

type ComposerStackProps = MobileComposerFixture & {
  bottomInset?: number;
};

export function ComposerStack({
  mode = 'default',
  bottomInset = 0,
  showAttachmentSamples = false,
  showPlan = false,
  showFollowUp = false,
  followUpItems = [],
  submitting = false,
}: ComposerStackProps) {
  const safeBottom = Math.max(bottomInset, 8);
  const [attachmentSheetOpen, setAttachmentSheetOpen] = useState(false);
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
        {
          id: 'demo-image',
          fileName: 'wireframe.png',
          size: 248_000,
          kind: 'image' as const,
          status: 'ready' as const,
        },
      ]
    : composerAttachmentsFixture;

  const planVisible = showPlan && submitting;

  if (mode === 'clarification') {
    return (
      <View className="bg-canvas px-3 pt-1" style={{ paddingBottom: safeBottom }}>
        <ComposerClarificationPanel />
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

          <View className="gap-2 rounded-[22px] border border-composer-border bg-surface px-3 py-2.5">
          {attachments.length > 0 ? <ComposerAttachments items={attachments} /> : null}

          <TextInput
            multiline
            placeholder={AGENT_UI_COPY.composerPlaceholders.newRun}
            placeholderTextColor="#898986"
            className="min-h-[44px] max-h-24 flex-1 px-0 py-1 text-[14px] leading-[22px] text-primary"
            textAlignVertical="top"
          />

          <View className="flex-row items-center justify-between">
            <Pressable
              className="h-11 w-11 items-center justify-center rounded-control active:bg-subtle"
              accessibilityRole="button"
              accessibilityLabel="添加附件"
              onPress={() => setAttachmentSheetOpen(true)}
            >
              <Plus size={20} color="#171717" />
            </Pressable>

            <Pressable
              className={`h-8 w-8 items-center justify-center rounded-full active:scale-95 ${
                submitting ? 'bg-muted' : 'bg-primary'
              }`}
              accessibilityLabel={submitting ? '停止运行' : '发送任务'}
            >
              <ArrowUp size={18} color="#ffffff" />
            </Pressable>
          </View>
          </View>
        </View>
      </View>

      <ComposerAttachmentSheet
        visible={attachmentSheetOpen}
        onClose={() => setAttachmentSheetOpen(false)}
      />
    </>
  );
}

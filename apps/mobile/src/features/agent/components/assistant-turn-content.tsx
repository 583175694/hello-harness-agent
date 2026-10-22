import { useMemo } from 'react';
import { View } from 'react-native';
import type { MobileAssistantBlock } from '../fixtures/mobile-preview.types';
import type { WorkbenchOpenRequest } from './workbench-activity-view';
import { ArtifactConversationCard } from './agent-elements/artifact-conversation-card';
import { AssistantMessageBlock } from './agent-elements/assistant-message-block';
import { AssistantProcessTimeline } from './agent-elements/assistant-process-timeline';
import { UserInterventionRow } from './agent-elements/user-intervention-row';
import { AgentChainOfThought } from './agent-elements/agent-chain-of-thought';
import { AssistantTextBlock } from './assistant-text-block';
import { ReasoningBlock } from './agent-elements/reasoning-block';
import { ToolActivityGroup } from './tool-activity-group';

type AssistantTurnContentProps = {
  deliveryStatus?: 'streaming' | 'completed' | 'failed' | 'cancelled';
  streaming?: boolean;
  errorDetail?: string;
  process?: MobileAssistantBlock[];
  pendingText?: string;
  finalText?: string;
  blocks: MobileAssistantBlock[];
  showQuickActions?: boolean;
  onOpenWorkbench?: (request?: WorkbenchOpenRequest) => void;
};

function legacyRenderBlock(
  unit: MobileAssistantBlock,
  key: string,
  streaming: boolean | undefined,
  onOpenWorkbench?: (request?: WorkbenchOpenRequest) => void,
) {
  if (unit.type === 'tool_activity') {
    return (
      <ToolActivityGroup
        key={key}
        items={[unit.item]}
        onOpenWorkbench={(toolCallId) => onOpenWorkbench?.({ view: 'activity', toolCallId })}
      />
    );
  }
  if (unit.type === 'reasoning') {
    return (
      <ReasoningBlock
        key={key}
        content={unit.content}
        durationMs={unit.durationMs}
        streaming={unit.streaming}
      />
    );
  }
  if (unit.type === 'text') {
    return (
      <AssistantTextBlock
        key={key}
        content={unit.content}
        onSourcePress={() => onOpenWorkbench?.({ view: 'activity', emphasis: 'sources' })}
      />
    );
  }
  if (unit.type === 'chain_of_thought') {
    return <AgentChainOfThought key={key} running={streaming} />;
  }
  if (unit.type === 'artifact') {
    return (
      <ArtifactConversationCard
        key={key}
        fileName={unit.fileName}
        versionNumber={unit.versionNumber}
        fileKind={unit.fileKind}
        onPress={() => onOpenWorkbench?.({ view: 'artifact' })}
      />
    );
  }
  if (unit.type === 'user_intervention') {
    return <UserInterventionRow key={key} content={unit.content} />;
  }
  return null;
}

export function AssistantTurnContent({
  deliveryStatus,
  streaming,
  errorDetail,
  process,
  pendingText,
  finalText,
  blocks,
  showQuickActions,
  onOpenWorkbench,
}: AssistantTurnContentProps) {
  const usePresentation = process !== undefined;
  const processItems = process ?? [];
  const artifactBlocks = useMemo(
    () => blocks.filter((b): b is Extract<MobileAssistantBlock, { type: 'artifact' }> => b.type === 'artifact'),
    [blocks],
  );
  /** 对齐 Web `hasVisibleBlocks`：有过程/正文/产物时不再展示「思考中…」（仅链头「已用时」等）。 */
  const hasVisibleAssistantBlocks = useMemo(() => {
    if (usePresentation) {
      return (
        processItems.length > 0 ||
        Boolean(pendingText?.trim()) ||
        Boolean(finalText?.trim()) ||
        artifactBlocks.length > 0
      );
    }
    return blocks.some(
      (b) =>
        b.type === 'tool_activity' ||
        b.type === 'reasoning' ||
        b.type === 'text' ||
        b.type === 'chain_of_thought' ||
        b.type === 'artifact',
    );
  }, [usePresentation, processItems, pendingText, finalText, artifactBlocks.length, blocks]);
  const finalVisible = Boolean(finalText?.trim() || pendingText?.trim());
  const completed = !streaming && (showQuickActions || deliveryStatus === 'completed');

  const legacyExtras = useMemo(() => {
    if (usePresentation) return [];
    return blocks.filter((b) => b.type !== 'artifact');
  }, [blocks, usePresentation]);

  return (
    <AssistantMessageBlock
      deliveryStatus={deliveryStatus}
      streaming={streaming}
      showStreamingHint={Boolean(streaming && !hasVisibleAssistantBlocks)}
      errorDetail={errorDetail}
      completed={completed && deliveryStatus !== 'failed' && deliveryStatus !== 'cancelled'}
    >
      <View className="gap-2.5">
        {usePresentation ? (
          <>
            <AssistantProcessTimeline
              items={processItems}
              running={streaming}
              finalOutputVisible={finalVisible}
            />
            {pendingText?.trim() ? (
              <AssistantTextBlock content={pendingText} />
            ) : null}
            {finalText?.trim() ? (
              <AssistantTextBlock
                content={finalText}
                onSourcePress={() =>
                  onOpenWorkbench?.({ view: 'activity', emphasis: 'sources' })
                }
              />
            ) : null}
          </>
        ) : (
          legacyExtras.map((unit, index) =>
            legacyRenderBlock(unit, `legacy-${index}`, streaming, onOpenWorkbench),
          )
        )}

        {artifactBlocks.map((unit, index) => (
          <ArtifactConversationCard
            key={`artifact-${index}`}
            fileName={unit.fileName}
            versionNumber={unit.versionNumber}
            fileKind={unit.fileKind}
            onPress={() => onOpenWorkbench?.({ view: 'artifact' })}
          />
        ))}
      </View>
    </AssistantMessageBlock>
  );
}

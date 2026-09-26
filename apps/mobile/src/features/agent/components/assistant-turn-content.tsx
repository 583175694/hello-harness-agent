import { useMemo } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import type { MobileAssistantBlock } from '../fixtures/mobile-preview.types';
import type { ToolActivityFixture } from '../fixtures/ui-fixtures';
import type { WorkspaceView } from '../fixtures/ui-fixtures';
import { ArtifactConversationCard } from './agent-elements/artifact-conversation-card';
import { AssistantMessageBlock } from './agent-elements/assistant-message-block';
import { ReasoningBlock } from './agent-elements/reasoning-block';
import { UserInterventionRow } from './agent-elements/user-intervention-row';
import { ToolActivityGroup } from './tool-activity-group';

type RenderUnit =
  | MobileAssistantBlock
  | { type: 'tool_group'; items: ToolActivityFixture[] };

function groupToolBlocks(blocks: MobileAssistantBlock[]): RenderUnit[] {
  const out: RenderUnit[] = [];
  let buffer: ToolActivityFixture[] = [];
  const flush = () => {
    if (buffer.length) {
      out.push({ type: 'tool_group', items: buffer });
      buffer = [];
    }
  };
  for (const block of blocks) {
    if (block.type === 'tool_activity') {
      buffer.push(block.item);
    } else {
      flush();
      out.push(block);
    }
  }
  flush();
  return out;
}

type AssistantTurnContentProps = {
  deliveryStatus?: 'streaming' | 'completed' | 'failed' | 'cancelled';
  streaming?: boolean;
  errorDetail?: string;
  blocks: MobileAssistantBlock[];
  showQuickActions?: boolean;
  onOpenWorkbench?: (view?: WorkspaceView) => void;
};

export function AssistantTurnContent({
  deliveryStatus,
  streaming,
  errorDetail,
  blocks,
  showQuickActions,
  onOpenWorkbench,
}: AssistantTurnContentProps) {
  const units = useMemo(() => groupToolBlocks(blocks), [blocks]);
  const hasReasoningStreaming = blocks.some(
    (b) => b.type === 'reasoning' && b.streaming,
  );
  const completed = !streaming && (showQuickActions || deliveryStatus === 'completed');

  return (
    <AssistantMessageBlock
      deliveryStatus={deliveryStatus}
      streaming={streaming}
      showStreamingHint={!hasReasoningStreaming}
      errorDetail={errorDetail}
      completed={completed && deliveryStatus !== 'failed' && deliveryStatus !== 'cancelled'}
    >
      <View className="gap-2">
        {units.map((unit, index) => {
          const key = `u-${index}`;
          if (unit.type === 'tool_group') {
            return (
              <ToolActivityGroup
                key={key}
                items={unit.items}
                onOpenWorkbench={() => onOpenWorkbench?.('activity')}
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
              <Text key={key} variant="body-sm" className="leading-relaxed text-primary" selectable>
                {unit.content}
              </Text>
            );
          }
          if (unit.type === 'artifact') {
            return (
              <ArtifactConversationCard
                key={key}
                fileName={unit.fileName}
                versionNumber={unit.versionNumber}
                fileKind={unit.fileKind}
                onPress={() => onOpenWorkbench?.('artifact')}
              />
            );
          }
          if (unit.type === 'user_intervention') {
            return <UserInterventionRow key={key} content={unit.content} />;
          }
          return null;
        })}
      </View>
    </AssistantMessageBlock>
  );
}

import type {
  AssistantArtifactBlock,
  AssistantContentBlock,
  AssistantTextBlock,
  AssistantToolActivityBlock,
} from '@harness/agent-protocol';

export type AssistantProcessItem =
  { kind: 'text'; block: AssistantTextBlock } | { kind: 'tool'; block: AssistantToolActivityBlock };

export type AssistantMessagePresentation = {
  process: AssistantProcessItem[];
  finalText: string;
  artifacts: AssistantArtifactBlock[];
};

// Tool rounds belong to the process timeline. The trailing text-only round is the final answer.
export function presentAssistantBlocks(
  blocks: AssistantContentBlock[],
): AssistantMessagePresentation {
  const visible = blocks.filter((block) => block.type !== 'reasoning');
  const artifacts = visible.filter(
    (block): block is AssistantArtifactBlock => block.type === 'artifact',
  );
  const timeline = visible.filter(
    (block): block is AssistantTextBlock | AssistantToolActivityBlock =>
      block.type === 'text' || block.type === 'tool_activity',
  );
  const toolRounds = new Set(
    timeline.flatMap((block) =>
      block.type === 'tool_activity' && block.roundSequence !== undefined
        ? [block.roundSequence]
        : [],
    ),
  );
  const lastToolIndex = timeline.findLastIndex((block) => block.type === 'tool_activity');
  const process: AssistantProcessItem[] = [];
  const final: string[] = [];

  timeline.forEach((block, index) => {
    if (block.type === 'tool_activity') {
      process.push({ kind: 'tool', block });
      return;
    }
    const belongsToToolRound =
      block.roundSequence !== undefined && toolRounds.has(block.roundSequence);
    const legacyProcessText = block.roundSequence === undefined && index <= lastToolIndex;
    if (belongsToToolRound || legacyProcessText) process.push({ kind: 'text', block });
    else final.push(block.content);
  });

  return { process, finalText: final.join(''), artifacts };
}

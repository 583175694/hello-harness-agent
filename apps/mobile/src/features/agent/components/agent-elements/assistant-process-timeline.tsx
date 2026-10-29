import { useEffect, useMemo, useRef, useState } from 'react';
import {
  formatProcessElapsedLabel,
  processTimelineElapsedMs,
} from '../../lib/process-elapsed';
import { Pressable, View } from 'react-native';
import { processTimelineToolIconKind } from '@harness/agent-conversation';
import {
  ChevronDown,
  Clock3,
  FileSearch,
  FileText,
  Plug,
  Search,
  Terminal,
  type LucideIcon,
} from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { ICON_CHEVRON_TONE } from '@/lib/theme';
import type { MobileAssistantBlock } from '../../fixtures/mobile-preview.types';
import type { WorkbenchOpenRequest } from '../workbench-activity-view';
import { AssistantTextBlock } from '../assistant-text-block';
import {
  toolActivityAccessibilityLabel,
  toolActivityInlineSummary,
  toolActivityPrimaryLine,
} from '../../lib/tool-activity-inline-label';
import { ReasoningBlock } from './reasoning-block';
import {
  PROCESS_TIMELINE_FIRST_LINE_HEIGHT,
  PROCESS_TIMELINE_RAIL_GAP,
  PROCESS_TIMELINE_RAIL_WIDTH,
  ProcessTimelineStep,
} from './process-timeline-step';

const PROCESS_TIMELINE_TOOL_ICONS = {
  search: Search,
  fileSearch: FileSearch,
  fileText: FileText,
  terminal: Terminal,
  clock: Clock3,
  plug: Plug,
} as const satisfies Record<
  ReturnType<typeof processTimelineToolIconKind>,
  LucideIcon
>;

function toolIcon(toolName: string): LucideIcon {
  return PROCESS_TIMELINE_TOOL_ICONS[processTimelineToolIconKind(toolName)];
}

function ProcessToolStep({
  title,
  summary,
  status,
  toolName,
  toolCallId,
  isLast,
  onPress,
}: {
  title: string;
  summary?: string;
  status?: string;
  toolName: string;
  toolCallId?: string;
  isLast?: boolean;
  onPress?: () => void;
}) {
  const running = status === 'running';
  const failed = status === 'failed';
  const StepIcon = toolIcon(toolName);

  const icon = (
    <Icon
      icon={StepIcon}
      tone={failed ? 'destructive' : running ? 'link' : 'muted'}
      size={15}
      textWeight="medium"
    />
  );

  const inlineSummary = toolActivityInlineSummary(toolName, title, summary ?? '');
  const primaryLine = toolActivityPrimaryLine(toolName, title, summary ?? '');
  const a11yLabel = toolActivityAccessibilityLabel(toolName, title, summary ?? '');

  const body = (
    <View className="min-w-0">
      <View
        className="min-w-0 flex-row items-center"
        style={{ height: PROCESS_TIMELINE_FIRST_LINE_HEIGHT }}
      >
        {inlineSummary ? (
          <>
            <Text
              variant="body-sm"
              className="text-muted"
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {title}
            </Text>
            <Text variant="body-sm" className="px-1.5 text-muted opacity-45">
              |
            </Text>
            <Text
              variant="body-sm"
              className="min-w-0 flex-1 text-muted"
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {inlineSummary}
            </Text>
          </>
        ) : (
          <Text variant="body-sm" className="min-w-0 flex-1 text-muted" numberOfLines={1}>
            {primaryLine}
          </Text>
        )}
      </View>
    </View>
  );

  if (!onPress) {
    return (
      <ProcessTimelineStep isLast={isLast ?? false} icon={icon}>
        {body}
      </ProcessTimelineStep>
    );
  }

  return (
    <ProcessTimelineStep isLast={isLast ?? false} icon={icon}>
      <Pressable
        onPress={onPress}
        disabled={!toolCallId}
        className="min-h-[36px] active:opacity-80"
        accessibilityRole="button"
        accessibilityLabel={`打开工作台：${a11yLabel}`}
      >
        {body}
      </Pressable>
    </ProcessTimelineStep>
  );
}

type AssistantProcessTimelineProps = {
  items: MobileAssistantBlock[];
  running?: boolean;
  finalOutputVisible?: boolean;
  onOpenWorkbench?: (request?: WorkbenchOpenRequest) => void;
};

/** 对齐 Web `ChainOfThought` + `ai-reasoning` + `ai-chain-step` 轨道布局。 */
export function AssistantProcessTimeline({
  items,
  running = false,
  finalOutputVisible = false,
  onOpenWorkbench,
}: AssistantProcessTimelineProps) {
  const [open, setOpen] = useState(() => !(finalOutputVisible && !running));
  const [userExpanded, setUserExpanded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const streamStartRef = useRef<number | null>(null);
  const hasProcess = items.length > 0;

  useEffect(() => {
    if (!running || !open) return;
    const timer = setInterval(() => setNow(Date.now()), 2500);
    return () => clearInterval(timer);
  }, [open, running]);

  useEffect(() => {
    if (running && hasProcess) {
      streamStartRef.current ??= Date.now();
    } else if (!running) {
      streamStartRef.current = null;
    }
  }, [running, hasProcess]);

  const headerLabel = useMemo(() => {
    let ms = processTimelineElapsedMs(items, running, now);
    if (running && ms <= 0 && streamStartRef.current) {
      ms = now - streamStartRef.current;
    }
    return formatProcessElapsedLabel(ms);
  }, [items, running, now]);
  const renderableIndices = useMemo(() => {
    const indices: number[] = [];
    items.forEach((b, i) => {
      if (
        b.type === 'reasoning' ||
        b.type === 'tool_activity' ||
        (b.type === 'text' && b.content.trim())
      ) {
        indices.push(i);
      }
    });
    return indices;
  }, [items]);
  const lastRenderableIndex = renderableIndices.at(-1);

  useEffect(() => {
    if (!hasProcess || userExpanded) return;
    if (finalOutputVisible && !running) {
      const timer = setTimeout(() => setOpen(false), 1000);
      return () => clearTimeout(timer);
    }
    if (running) setOpen(true);
  }, [finalOutputVisible, running, hasProcess, userExpanded]);

  if (!hasProcess) return null;

  return (
    <View className="w-full max-w-[620px]">
      <Pressable
        onPress={() => {
          setUserExpanded(true);
          setOpen((v) => !v);
        }}
        className="min-h-8 w-full flex-row items-center px-0.5 py-1 active:opacity-80"
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <View className="flex-row items-center gap-1.5">
          <Text variant="body-sm" className="shrink text-muted" numberOfLines={1}>
            {headerLabel}
          </Text>
          <Icon
            icon={ChevronDown}
            tone={ICON_CHEVRON_TONE.disclosure}
            size={15}
            style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}
          />
        </View>
      </Pressable>

      {open ? (
        <View className="py-1" style={{ paddingLeft: 4 }}>
          {items.map((block, index) => {
            const key = `p-${index}-${block.type}`;
            if (block.type === 'reasoning') {
              const isLast = index === lastRenderableIndex;
              return (
                <ReasoningBlock
                  key={key}
                  content={block.content}
                  durationMs={block.durationMs}
                  streaming={block.streaming === true}
                  nested
                  showRail
                  isLast={isLast}
                />
              );
            }
            if (block.type === 'tool_activity') {
              const isLast = index === lastRenderableIndex;
              const tool = block.item;
              return (
                <ProcessToolStep
                  key={key}
                  toolName={tool.toolName ?? tool.name}
                  toolCallId={tool.id}
                  title={tool.name}
                  summary={tool.summary}
                  status={tool.status}
                  isLast={isLast}
                  onPress={
                    onOpenWorkbench && tool.id
                      ? () => onOpenWorkbench({ view: 'activity', toolCallId: tool.id })
                      : undefined
                  }
                />
              );
            }
            if (block.type === 'text' && block.content.trim()) {
              const isLast = index === lastRenderableIndex;
              return (
                <ProcessTimelineStep
                  key={key}
                  isLast={isLast}
                  icon={<View className="h-1.5 w-1.5 rounded-full bg-border" />}
                >
                  <View className="py-1">
                    <AssistantTextBlock content={block.content} />
                  </View>
                </ProcessTimelineStep>
              );
            }
            return null;
          })}
        </View>
      ) : null}
    </View>
  );
}

export { PROCESS_TIMELINE_RAIL_WIDTH, PROCESS_TIMELINE_RAIL_GAP };

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  formatProcessElapsedLabel,
  processTimelineElapsedMs,
} from '../../lib/process-elapsed';
import { Pressable, View } from 'react-native';
import {
  ChevronDown,
  Clock3,
  FileSearch,
  FileText,
  Search,
  Terminal,
  type LucideIcon,
} from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { SpinnerIcon } from '@/components/ui/spinner-icon';
import { Text } from '@/components/ui/text';
import { ICON_CHEVRON_TONE } from '@/lib/theme';
import type { MobileAssistantBlock } from '../../fixtures/mobile-preview.types';
import { AssistantTextBlock } from '../assistant-text-block';
import { ReasoningBlock } from './reasoning-block';
import {
  PROCESS_TIMELINE_FIRST_LINE_HEIGHT,
  PROCESS_TIMELINE_RAIL_GAP,
  PROCESS_TIMELINE_RAIL_WIDTH,
  ProcessTimelineStep,
} from './process-timeline-step';

function toolIcon(toolName: string): LucideIcon {
  const n = toolName.toLowerCase();
  if (n.includes('search') || n.includes('fetch') || n.includes('web')) return Search;
  if (n.includes('file') || n.includes('read')) return FileSearch;
  if (n.includes('bash') || n.includes('command') || n.includes('terminal')) return Terminal;
  if (n.includes('report') || n.includes('create')) return FileText;
  return Clock3;
}

function ProcessToolStep({
  title,
  summary,
  status,
  toolName,
  isLast,
}: {
  title: string;
  summary?: string;
  status?: string;
  toolName: string;
  isLast?: boolean;
}) {
  const running = status === 'running';
  const failed = status === 'failed';
  const StepIcon = toolIcon(toolName);

  const icon = running ? (
    <SpinnerIcon tone="muted" size={15} />
  ) : (
    <Icon icon={StepIcon} tone={failed ? 'destructive' : 'muted'} size={15} textWeight="medium" />
  );

  return (
    <ProcessTimelineStep isLast={isLast ?? false} icon={icon}>
      <View className="min-w-0">
        <View
          className="justify-center"
          style={{ height: PROCESS_TIMELINE_FIRST_LINE_HEIGHT }}
        >
          <Text variant="body-sm" className="text-secondary" numberOfLines={1} ellipsizeMode="tail">
            {title}
          </Text>
        </View>
        {summary && summary !== title ? (
          <Text
            variant="caption"
            className="text-muted"
            style={{ marginTop: 2 }}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {summary}
          </Text>
        ) : null}
      </View>
    </ProcessTimelineStep>
  );
}

type AssistantProcessTimelineProps = {
  items: MobileAssistantBlock[];
  running?: boolean;
  finalOutputVisible?: boolean;
};

/** 对齐 Web `ChainOfThought` + `ai-reasoning` + `ai-chain-step` 轨道布局。 */
export function AssistantProcessTimeline({
  items,
  running = false,
  finalOutputVisible = false,
}: AssistantProcessTimelineProps) {
  const [open, setOpen] = useState(() => !(finalOutputVisible && !running));
  const [userExpanded, setUserExpanded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const streamStartRef = useRef<number | null>(null);
  const hasProcess = items.length > 0;

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);

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
        className="min-h-8 flex-row items-center gap-2 px-0.5 py-1 active:opacity-80"
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Text variant="body-sm" className="flex-1 text-muted">
          {headerLabel}
        </Text>
        <Icon
          icon={ChevronDown}
          tone={ICON_CHEVRON_TONE.disclosure}
          size={15}
          style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}
        />
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
                  title={tool.name}
                  summary={tool.summary}
                  status={tool.status}
                  isLast={isLast}
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

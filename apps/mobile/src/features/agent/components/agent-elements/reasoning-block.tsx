import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { ICON_CHEVRON_TONE } from '@/lib/theme';
import { Text } from '@/components/ui/text';
import { configureProcessExpandLayoutAnimation } from '../../lib/process-layout-animation';
import { reasoningTriggerLabel } from '../../lib/reasoning-label';
import {
  PROCESS_TIMELINE_FIRST_LINE_HEIGHT,
  ProcessTimelineStep,
} from './process-timeline-step';

/** 与 Web `ai-elements/reasoning.tsx` 的 AUTO_CLOSE_DELAY 一致。 */
const REASONING_AUTO_CLOSE_MS = 1000;

export function ReasoningBlock({
  content,
  durationMs,
  streaming = false,
  nested = false,
  showRail = false,
  isLast = false,
}: {
  content: string;
  durationMs?: number;
  streaming?: boolean;
  nested?: boolean;
  showRail?: boolean;
  isLast?: boolean;
}) {
  const [open, setOpen] = useState(streaming);

  useEffect(() => {
    if (streaming) {
      setOpen(true);
      return;
    }
    const timer = setTimeout(() => setOpen(false), REASONING_AUTO_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [streaming]);

  const label = reasoningTriggerLabel(streaming, durationMs);

  const trigger = (
    <Pressable
      onPress={() => {
        configureProcessExpandLayoutAnimation();
        setOpen((v) => !v);
      }}
      className={`min-h-[36px] rounded-md active:opacity-80 ${
        streaming && !nested ? 'bg-subtle/90 px-1' : ''
      }`}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
    >
      <View
        className="flex-row items-center gap-1.5"
        style={{ height: PROCESS_TIMELINE_FIRST_LINE_HEIGHT }}
      >
        <Text variant="body-sm" className="shrink text-muted" numberOfLines={1}>
          {label}
        </Text>
        <Icon
          icon={ChevronDown}
          tone={ICON_CHEVRON_TONE.disclosure}
          size={15}
          style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}
        />
      </View>
    </Pressable>
  );

  const expanded = open ? (
    <ScrollView
      className="max-h-[320px] px-3 pb-2 pt-1.5"
      showsVerticalScrollIndicator={false}
      nestedScrollEnabled
    >
      <Text variant="body-sm" className="leading-[22px] text-muted">
        {content}
      </Text>
    </ScrollView>
  ) : null;

  if (showRail) {
    return (
      <ProcessTimelineStep
        isLast={isLast}
        icon={<View className="h-1.5 w-1.5 rounded-full bg-border" />}
        footer={expanded}
      >
        {trigger}
      </ProcessTimelineStep>
    );
  }

  return (
    <View className={nested ? '' : 'my-0.5'}>
      {trigger}
      {expanded}
    </View>
  );
}

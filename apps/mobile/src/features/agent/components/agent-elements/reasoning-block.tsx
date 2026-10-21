import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { ICON_CHEVRON_TONE } from '@/lib/theme';
import { Text } from '@/components/ui/text';

function formatElapsed(durationMs?: number): string {
  if (durationMs == null || durationMs <= 0) return '';
  const totalSec = Math.round(durationMs / 1000);
  if (totalSec < 60) return `${totalSec} 秒`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return s > 0 ? `${m} 分 ${s} 秒` : `${m} 分`;
}

function thinkingLabel(streaming: boolean, durationMs?: number): string {
  if (streaming) return '思考中…';
  const elapsed = formatElapsed(durationMs);
  return elapsed ? `思考了 ${elapsed}` : '思考过程';
}

export function ReasoningBlock({
  content,
  durationMs,
  streaming = false,
}: {
  content: string;
  durationMs?: number;
  streaming?: boolean;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (streaming) setOpen(true);
  }, [streaming]);

  const label = thinkingLabel(streaming, durationMs);

  return (
    <View>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        className="flex-row items-center gap-1 py-0.5 active:opacity-70"
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Text variant="body-sm" className="text-muted">
          {label}
        </Text>
        <Icon
          icon={ChevronRight}
          tone={ICON_CHEVRON_TONE.disclosure}
          size={14}
          style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}
        />
      </Pressable>
      {open ? (
        <ScrollView
          className="max-h-[320px] pt-1 pb-2"
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          <Text variant="body-sm" className="leading-relaxed text-muted">
            {content}
          </Text>
        </ScrollView>
      ) : null}
    </View>
  );
}

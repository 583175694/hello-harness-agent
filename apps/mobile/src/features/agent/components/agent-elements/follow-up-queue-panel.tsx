import { Pressable, View } from 'react-native';
import { ArrowUp, CornerDownLeft, X } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/cn';
import { AGENT_UI_BUTTON } from '../../config/ui.constants';

type FollowUpItem = { id: string; content: string };

type FollowUpQueuePanelProps = {
  items: FollowUpItem[];
  submittingId?: string | null;
  onSend?: (id: string) => void;
  onDismiss?: (id: string) => void;
};

export function FollowUpQueuePanel({
  items,
  submittingId = null,
  onSend,
  onDismiss,
}: FollowUpQueuePanelProps) {
  const { classNames: btn, variant: btnVariant } = AGENT_UI_BUTTON;

  return (
    <View className="gap-2">
      {items.map((item) => {
        const sending = submittingId === item.id;
        return (
          <View
            key={item.id}
            className="flex-row items-center gap-2 rounded-panel border border-composer-border bg-canvas px-3 py-2"
          >
            <Icon icon={CornerDownLeft} tone="secondary" size={16} />
            <Text variant="body-sm" className="flex-1 text-primary">
              {item.content}
            </Text>
            <PressableScale
              onPress={() => onSend?.(item.id)}
              disabled={sending}
              className={cn(btn.primaryIconSend, sending && 'opacity-50')}
              accessibilityLabel="发送跟进"
            >
              <Icon icon={ArrowUp} tone="onPrimary" size={14} />
            </PressableScale>
            <Pressable
              onPress={() => onDismiss?.(item.id)}
              className={cn('h-8 w-8 items-center justify-center rounded-control', btnVariant.iconOnlyGhost)}
              accessibilityLabel="移除跟进"
            >
              <Icon icon={X} tone="secondary" size={14} />
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

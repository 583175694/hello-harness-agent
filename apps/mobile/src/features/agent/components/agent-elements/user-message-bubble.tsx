import { View } from 'react-native';
import { Text } from '@/components/ui/text';

type UserMessageBubbleProps = {
  content: string;
  pendingState?: 'steer_pending' | 'steer_applied' | 'follow_up_pending';
  attachmentHint?: string;
};

const pendingCopy: Record<NonNullable<UserMessageBubbleProps['pendingState']>, string> = {
  steer_pending: '方向调整排队中',
  steer_applied: '已接受，将从下一步生效',
  follow_up_pending: 'Follow-up 排队中',
};

export function UserMessageBubble({ content, pendingState, attachmentHint }: UserMessageBubbleProps) {
  return (
    <View className="gap-1">
      <View className="w-full rounded-2xl bg-[#f3f3f2] px-4 py-3">
        <Text variant="body-sm" className="leading-relaxed text-primary" selectable>
          {content}
        </Text>
        {attachmentHint ? (
          <Text variant="caption" className="mt-2 text-muted">
            {attachmentHint}
          </Text>
        ) : null}
      </View>
      {pendingState ? (
        <Text variant="caption" className="text-muted">
          {pendingCopy[pendingState]}
        </Text>
      ) : null}
    </View>
  );
}

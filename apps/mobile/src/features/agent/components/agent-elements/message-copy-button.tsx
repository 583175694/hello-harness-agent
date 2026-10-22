import { useState } from 'react';
import { Check, Copy } from 'lucide-react-native';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { copyTextToClipboard } from '@/lib/clipboard';
import { AGENT_UI_BEHAVIOR } from '../../config/ui.constants';

type MessageCopyButtonProps = {
  text: string;
};

export function MessageCopyButton({ text }: MessageCopyButtonProps) {
  const [copied, setCopied] = useState(false);

  return (
    <PressableScale
      className="flex-row items-center gap-1 self-end rounded-full px-2 py-1 active:bg-subtle"
      accessibilityLabel={copied ? '已复制' : '复制消息'}
      onPress={() => {
        void copyTextToClipboard(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), AGENT_UI_BEHAVIOR.copyFeedbackDurationMs);
        });
      }}
    >
      <Icon icon={copied ? Check : Copy} tone="secondary" size={14} />
      <Text variant="caption" className="text-muted">
        {copied ? '已复制' : '复制'}
      </Text>
    </PressableScale>
  );
}

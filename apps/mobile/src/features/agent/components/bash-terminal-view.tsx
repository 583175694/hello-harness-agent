import { Pressable, View } from 'react-native';
import { Copy } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { copyTextToClipboard } from '@/lib/clipboard';

type BashTerminalViewProps = {
  title: string;
  durationLabel?: string;
  commandLine: string;
  outputLines: string[];
};

export function BashTerminalView({
  title,
  durationLabel,
  commandLine,
  outputLines,
}: BashTerminalViewProps) {
  const copyText = [commandLine, ...outputLines].join('\n');

  return (
    <View className="border-b border-composer-border bg-terminal-header p-3">
      <View className="mb-2 flex-row items-center justify-between">
        <Text variant="mono" className="flex-1 text-terminal-fg">
          {title}
        </Text>
        {durationLabel ? (
          <Text variant="caption" className="text-terminal-muted">
            {durationLabel}
          </Text>
        ) : null}
        <Pressable
          onPress={() => void copyTextToClipboard(copyText)}
          className="ml-2 h-8 w-8 items-center justify-center rounded-control active:opacity-70"
          accessibilityLabel="复制终端输出"
        >
          <Icon icon={Copy} tone="onTerminal" size={16} />
        </Pressable>
      </View>
      <View className="rounded-lg bg-terminal p-3">
        <Text variant="mono" className="text-terminal-accent">
          {commandLine}
        </Text>
        {outputLines.map((line) => (
          <Text key={line} variant="mono" className="mt-1 text-terminal-muted">
            {line}
          </Text>
        ))}
      </View>
    </View>
  );
}

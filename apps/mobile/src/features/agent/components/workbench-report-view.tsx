import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from '@/components/ui/text';
import { MarkdownView } from '@/components/markdown-view';

const REPORT_MD = `## 摘要

本次 Run 补齐 TOTP 校验路径，pytest 覆盖 auth_service 核心分支。

引用 [S1] 来自内部 wiki 的 MFA 策略说明。`;

type WorkbenchReportViewProps = {
  onFocusSource?: (label: string) => void;
};

export function WorkbenchReportView({ onFocusSource }: WorkbenchReportViewProps) {
  const router = useRouter();

  return (
    <View className="gap-2 p-3">
      <View className="flex-row items-center justify-between">
        <Text variant="headline" className="text-[15px]">
          2FA 覆盖率报告
        </Text>
        <Pressable onPress={() => router.push('/reader/report')} className="active:opacity-70">
          <Text variant="caption" className="text-link">
            全屏阅读
          </Text>
        </Pressable>
      </View>
      <MarkdownView variant="report" onSourcePress={onFocusSource}>
        {REPORT_MD}
      </MarkdownView>
      <Pressable
        onPress={() => onFocusSource?.('S1')}
        className="self-start rounded-control bg-subtle px-2 py-1 active:bg-subtle-pressed"
      >
        <Text variant="caption" className="text-link">
          [S1] 安全红线 · MFA
        </Text>
      </Pressable>
    </View>
  );
}

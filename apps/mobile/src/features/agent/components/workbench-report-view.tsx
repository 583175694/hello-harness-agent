import { ScrollView, View } from 'react-native';
import { Text } from '@/components/ui/text';

export function WorkbenchReportView() {
  return (
    <ScrollView className="max-h-56" contentContainerClassName="gap-2 p-3">
      <Text variant="headline" className="text-[15px]">
        2FA 覆盖率报告
      </Text>
      <Text variant="body-sm" className="leading-relaxed text-primary">
        ## 摘要{'\n\n'}
        本次 Run 补齐 TOTP 校验路径，pytest 覆盖 auth_service 核心分支。{'\n\n'}
        引用 [S1] 来自内部 wiki 的 MFA 策略说明。
      </Text>
      <View className="rounded-control bg-subtle px-2 py-1 self-start">
        <Text variant="caption" className="text-link">
          [S1] 安全红线 · MFA
        </Text>
      </View>
    </ScrollView>
  );
}

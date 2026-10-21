import { ScrollView, View } from 'react-native';
import { MarkdownView } from '@/components/markdown-view';

const FULL_REPORT = `## 2FA 覆盖率报告

### 摘要

本次 Run 补齐 TOTP 校验路径，pytest 覆盖 auth_service 核心分支。

### 结论

- Session 边界与 pending token 已对齐
- refresh 旋转路径需后续补测

引用 [S1] 来自内部 wiki 的 MFA 策略说明。`;

export default function ReportReaderScreen() {
  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerClassName="p-4 pb-10">
      <View className="rounded-panel border border-border bg-surface p-4">
        <MarkdownView variant="report">{FULL_REPORT}</MarkdownView>
      </View>
    </ScrollView>
  );
}

import { Pressable, View } from 'react-native';
import { X } from 'lucide-react-native';
import { Text } from '@/components/ui/text';

export function ComposerClarificationPanel() {
  const options = ['继续用现有 JWT 流程', '改为独立 MFA pending token', '其他（自由输入）'];
  return (
    <View className="rounded-2xl border border-composer-border bg-surface p-3.5 shadow-sm">
      <View className="mb-2 flex-row items-center justify-between">
        <Text variant="body" className="font-semibold">
          需要补充信息
        </Text>
        <Pressable className="flex-row items-center gap-1 px-1 active:opacity-70">
          <X size={14} color="#555551" />
          <Text variant="caption" className="text-secondary">
            取消运行
          </Text>
        </Pressable>
      </View>
      <Text variant="body-sm" className="mb-3 text-secondary">
        2FA 通过后是否仍签发完整 Session JWT，还是仅发放临时 MFA token？
      </Text>
      <View className="mb-3 flex-row flex-wrap gap-2">
        {options.map((opt) => (
          <Pressable
            key={opt}
            className="rounded-full border border-border bg-subtle px-3 py-1.5 active:bg-[#e8e8e5]"
          >
            <Text variant="caption" className="text-primary">
              {opt}
            </Text>
          </Pressable>
        ))}
      </View>
      <Pressable className="h-10 items-center justify-center rounded-control bg-primary">
        <Text variant="body-sm" className="font-medium text-primary-foreground">
          提交回答
        </Text>
      </Pressable>
    </View>
  );
}

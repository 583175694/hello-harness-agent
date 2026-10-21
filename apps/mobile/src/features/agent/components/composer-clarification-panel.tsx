import { Pressable, View } from 'react-native';
import { X } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/cn';
import { AGENT_UI_BUTTON } from '../config/ui.constants';

type ComposerClarificationPanelProps = {
  submitting?: boolean;
  onSubmit?: () => void;
  onCancelRun?: () => void;
};

export function ComposerClarificationPanel({
  submitting = false,
  onSubmit,
  onCancelRun,
}: ComposerClarificationPanelProps) {
  const options = ['继续用现有 JWT 流程', '改为独立 MFA pending token', '其他（自由输入）'];
  const { classNames: btn } = AGENT_UI_BUTTON;

  return (
    <View className="rounded-bubble border border-composer-border bg-surface p-3.5 shadow-sm">
      <View className="mb-2 flex-row items-center justify-between">
        <Text variant="body" className="font-semibold">
          需要补充信息
        </Text>
        <Pressable
          onPress={onCancelRun}
          className="flex-row items-center gap-1 px-1 active:opacity-70"
          accessibilityRole="button"
        >
          <Icon icon={X} tone="secondary" size={14} />
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
          <Pressable key={opt} className={btn.chipOption}>
            <Text variant="caption" className="text-primary">
              {opt}
            </Text>
          </Pressable>
        ))}
      </View>
      <PressableScale
        onPress={onSubmit}
        disabled={submitting}
        className={cn(btn.primaryCta, submitting && 'opacity-50')}
        accessibilityLabel="提交回答"
      >
        <Text variant="body-sm" className="font-medium text-primary-foreground">
          {submitting ? '提交中…' : '提交回答'}
        </Text>
      </PressableScale>
    </View>
  );
}

import { useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import type { PendingInterruptSnapshot } from '@harness/agent-protocol';
import { X } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/cn';
import { AGENT_UI_BUTTON } from '../config/ui.constants';

type ComposerClarificationPanelProps = {
  interrupt?: Extract<PendingInterruptSnapshot, { kind: 'clarification' }>;
  submitting?: boolean;
  onSubmit?: (answer: string) => void;
  onCancelRun?: () => void;
};

export function ComposerClarificationPanel({
  interrupt,
  submitting = false,
  onSubmit,
  onCancelRun,
}: ComposerClarificationPanelProps) {
  const { classNames: btn } = AGENT_UI_BUTTON;
  const [answer, setAnswer] = useState('');

  useEffect(() => {
    setAnswer('');
  }, [interrupt?.interruptId]);

  const options = interrupt?.payload.options ?? [];
  const question =
    interrupt?.payload.question ?? '2FA 通过后是否仍签发完整 Session JWT，还是仅发放临时 MFA token？';
  const allowFreeText = interrupt?.payload.allowFreeText ?? true;

  return (
    <View className="rounded-bubble border border-composer-border bg-surface p-3.5">
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
        {question}
      </Text>
      {options.length > 0 ? (
        <View className="mb-3 flex-row flex-wrap gap-2">
          {options.map((opt) => (
            <Pressable
              key={opt}
              onPress={() => setAnswer(opt)}
              className={cn(btn.chipOption, answer === opt && 'border-primary bg-subtle')}
            >
              <Text variant="caption" className="text-primary">
                {opt}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {allowFreeText ? (
        <TextInput
          value={answer}
          onChangeText={setAnswer}
          placeholder="输入回答"
          className="mb-3 min-h-10 rounded-lg border border-composer-border px-3 py-2 text-[14px] text-primary"
          editable={!submitting}
        />
      ) : null}
      <PressableScale
        onPress={() => onSubmit?.(answer.trim())}
        disabled={submitting || !answer.trim()}
        className={cn(btn.primaryCta, (submitting || !answer.trim()) && 'opacity-50')}
        accessibilityLabel="提交回答"
      >
        <Text variant="body-sm" className="font-medium text-primary-foreground">
          {submitting ? '正在提交回答' : '提交回答'}
        </Text>
      </PressableScale>
    </View>
  );
}

import { useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import type { PendingInterruptSnapshot } from '@harness/agent-protocol';
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
    <View className="gap-2.5">
      <View className="flex-row items-start gap-2">
        <Text variant="body-sm" className="min-w-0 flex-1 leading-5 text-secondary">
          {question}
        </Text>
        <Pressable onPress={onCancelRun} className="shrink-0 pt-0.5 active:opacity-70" accessibilityRole="button">
          <Text variant="caption" className="text-muted">
            取消
          </Text>
        </Pressable>
      </View>
      {options.length > 0 ? (
        <View className="flex-row flex-wrap gap-2">
          {options.map((opt) => (
            <Pressable
              key={opt}
              onPress={() => onSubmit?.(opt)}
              disabled={submitting}
              className={cn(btn.chipOption, submitting && 'opacity-50')}
            >
              <Text variant="caption" className="text-primary">
                {opt}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {allowFreeText ? (
        <View className="flex-row items-center gap-2">
          <TextInput
            value={answer}
            onChangeText={setAnswer}
            placeholder="其他…"
            className="min-h-10 flex-1 rounded-lg border border-composer-border px-3 py-2 text-[14px] text-primary"
            editable={!submitting}
          />
          <Pressable
            onPress={() => onSubmit?.(answer.trim())}
            disabled={submitting || !answer.trim()}
            className={cn('shrink-0 px-1 active:opacity-70', (submitting || !answer.trim()) && 'opacity-40')}
            accessibilityLabel="提交"
          >
            <Text variant="body-sm" className="text-link">
              提交
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

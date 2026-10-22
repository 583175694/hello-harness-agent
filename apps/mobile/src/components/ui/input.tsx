import { TextInput, type TextInputProps } from 'react-native';
import { cn } from '@/lib/cn';
import { useComposerPlaceholderColor } from '@/lib/use-composer-placeholder';

export function Input({ className, placeholderTextColor, ...props }: TextInputProps) {
  const defaultPlaceholder = useComposerPlaceholderColor();
  return (
    <TextInput
      className={cn('h-8 rounded-control bg-subtle px-3 text-[13px] text-primary', className)}
      placeholderTextColor={placeholderTextColor ?? defaultPlaceholder}
      {...props}
    />
  );
}

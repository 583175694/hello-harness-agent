import { TextInput, type TextInputProps } from 'react-native';
import { cn } from '@/lib/cn';

export function Input({ className, placeholderTextColor = '#898986', ...props }: TextInputProps) {
  return (
    <TextInput
      className={cn(
        'h-8 rounded-control bg-[#f0f0ed] px-3 text-[13px] text-primary',
        className,
      )}
      placeholderTextColor={placeholderTextColor}
      {...props}
    />
  );
}

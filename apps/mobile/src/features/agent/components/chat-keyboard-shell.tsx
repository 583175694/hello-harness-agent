import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';

/** Chat 主列：顶栏以下区域随键盘抬升（Android 需配合 app.json `softwareKeyboardLayoutMode: resize`）。 */
export function ChatKeyboardShell({ children }: { children: ReactNode }) {
  return (
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

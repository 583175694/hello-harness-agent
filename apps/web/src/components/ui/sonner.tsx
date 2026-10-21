import { Toaster as Sonner, type ToasterProps } from 'sonner';
import type { CSSProperties } from 'react';

import type { Theme } from '../../theme';

type HarnessToasterProps = ToasterProps & {
  theme: Theme;
};

const noIcons: NonNullable<ToasterProps['icons']> = {
  success: null,
  info: null,
  warning: null,
  error: null,
  loading: null,
};

/** shadcn/ui Sonner — Harness theme tokens, text-only toasts (no leading icon). */
export function Toaster({ theme, className = '', ...props }: HarnessToasterProps) {
  return (
    <Sonner
      theme={theme}
      position="bottom-right"
      offset={16}
      duration={4000}
      closeButton
      richColors={false}
      expand={false}
      visibleToasts={3}
      className={`toaster group ${className}`.trim()}
      icons={noIcons}
      style={
        {
          '--normal-bg': 'var(--theme-surface)',
          '--normal-text': 'var(--theme-text-primary)',
          '--normal-border': 'var(--theme-border)',
          '--border-radius': '8px',
        } as CSSProperties
      }
      toastOptions={{
        classNames: {
          closeButton: 'harness-sonner-close',
        },
      }}
      {...props}
    />
  );
}

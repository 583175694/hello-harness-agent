import { Toaster as Sonner, type ToasterProps } from 'sonner';

import type { Theme } from '../../theme';

type HarnessToasterProps = ToasterProps & {
  theme: Theme;
};

/** shadcn/ui Sonner — neutral surface, theme tokens (no tinted success/error bars). */
export function Toaster({ theme, className = '', ...props }: HarnessToasterProps) {
  return (
    <Sonner
      theme={theme}
      position="top-center"
      offset={16}
      duration={4000}
      closeButton
      richColors={false}
      className={`toaster group ${className}`.trim()}
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-surface group-[.toaster]:text-text-primary group-[.toaster]:border-border group-[.toaster]:shadow-prominent',
          title: 'group-[.toast]:text-sm group-[.toast]:font-medium',
          description: 'group-[.toast]:text-sm group-[.toast]:text-text-secondary',
          actionButton:
            'group-[.toast]:rounded-md group-[.toast]:bg-accent group-[.toast]:px-3 group-[.toast]:py-1.5 group-[.toast]:text-xs group-[.toast]:font-medium group-[.toast]:text-white',
          cancelButton:
            'group-[.toast]:rounded-md group-[.toast]:bg-surface-subtle group-[.toast]:px-3 group-[.toast]:py-1.5 group-[.toast]:text-xs group-[.toast]:font-medium group-[.toast]:text-text-secondary',
          closeButton:
            'group-[.toast]:border-border group-[.toast]:bg-surface group-[.toast]:text-text-secondary',
        },
      }}
      {...props}
    />
  );
}

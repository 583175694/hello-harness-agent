import { Toaster as Sonner, type ToasterProps } from 'sonner';
import type { Theme } from '../../theme';

type HarnessToasterProps = ToasterProps & {
  theme: Theme;
};

/** shadcn-style Sonner host — top-center, Harness theme tokens. */
export function Toaster({ theme, className = '', ...props }: HarnessToasterProps) {
  return (
    <Sonner
      theme={theme}
      position="top-center"
      offset={20}
      duration={3200}
      closeButton={false}
      richColors={false}
      className={`harness-toaster ${className}`.trim()}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: 'harness-toast',
          title: 'harness-toast__title',
          description: 'harness-toast__description',
          success: 'harness-toast--success',
          error: 'harness-toast--error',
          info: 'harness-toast--default',
          warning: 'harness-toast--default',
        },
      }}
      {...props}
    />
  );
}

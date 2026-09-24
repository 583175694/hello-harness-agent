import { toast as sonnerToast } from 'sonner';

import type { Theme } from '../../theme';
import { Toaster } from './sonner';

export type ToastVariant = 'success' | 'error' | 'default';

export function toast(message: string, variant: ToastVariant = 'default'): void {
  switch (variant) {
    case 'success':
      sonnerToast.success(message);
      break;
    case 'error':
      sonnerToast.error(message);
      break;
    default:
      sonnerToast(message);
  }
}

export function ToastViewport({ theme }: { theme: Theme }) {
  return <Toaster theme={theme} />;
}

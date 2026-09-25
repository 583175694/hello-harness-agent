import { toast as sonnerToast, type ExternalToast } from 'sonner';
import { useSyncExternalStore, type ReactNode } from 'react';

import type { Theme } from '../../theme';
import { Toaster } from './sonner';

export type ToastVariant = 'success' | 'error' | 'default';

function readDocumentTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

function subscribeDocumentTheme(onStoreChange: () => void): () => void {
  const observer = new MutationObserver(onStoreChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  return () => observer.disconnect();
}

function useDocumentTheme(): Theme {
  return useSyncExternalStore(subscribeDocumentTheme, readDocumentTheme, () => 'light');
}

function dispatchToast(variant: ToastVariant, message: string, options?: ExternalToast): void {
  switch (variant) {
    case 'success':
      sonnerToast.success(message, options);
      break;
    case 'error':
      sonnerToast.error(message, options);
      break;
    default:
      sonnerToast(message, options);
  }
}

export type ToastFn = {
  (message: string, variant?: ToastVariant): void;
  success: (message: string, options?: ExternalToast) => void;
  error: (message: string, options?: ExternalToast) => void;
  message: (message: string, options?: ExternalToast) => void;
};

function toastCallable(message: string, variant: ToastVariant = 'default'): void {
  dispatchToast(variant, message);
}

/** 全局 Toast API — 仅通过此入口触发 Sonner，勿直接 import `sonner`。 */
export const toast = Object.assign(toastCallable, {
  success(message: string, options?: ExternalToast) {
    dispatchToast('success', message, options);
  },
  error(message: string, options?: ExternalToast) {
    dispatchToast('error', message, options);
  },
  message(message: string, options?: ExternalToast) {
    dispatchToast('default', message, options);
  },
}) as ToastFn;

export function ToastProvider({ children }: { children: ReactNode }) {
  const theme = useDocumentTheme();
  return (
    <>
      {children}
      <Toaster theme={theme} />
    </>
  );
}

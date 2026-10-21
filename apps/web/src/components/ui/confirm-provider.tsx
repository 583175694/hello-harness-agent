import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './alert-dialog';

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type ConfirmContextValue = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

type PendingConfirm = ConfirmOptions & {
  resolve: (value: boolean) => void;
};

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const pendingRef = useRef<PendingConfirm | null>(null);

  const confirm = useCallback<ConfirmContextValue>((options) => {
    return new Promise<boolean>((resolve) => {
      const next: PendingConfirm = { ...options, resolve };
      pendingRef.current = next;
      setPending(next);
    });
  }, []);

  function settle(result: boolean) {
    const current = pendingRef.current;
    if (!current) return;
    pendingRef.current = null;
    setPending(null);
    current.resolve(result);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) settle(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.title ?? ''}</AlertDialogTitle>
            {pending?.description ? (
              <AlertDialogDescription>{pending.description}</AlertDialogDescription>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => settle(false)}>
              {pending?.cancelLabel ?? '取消'}
            </AlertDialogCancel>
            <AlertDialogAction
              className={pending?.destructive ? 'ui-dialog-action--destructive' : undefined}
              onClick={() => settle(true)}
            >
              {pending?.confirmLabel ?? '确认'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmContextValue {
  const value = useContext(ConfirmContext);
  if (!value) {
    throw new Error('useConfirm 必须在 ConfirmProvider 内使用');
  }
  return value;
}

/** 退出登录等场景复用的确认文案 */
export const LOGOUT_CONFIRM: ConfirmOptions = {
  title: '退出登录',
  description: '确定退出登录？你的会话仍保存在该账号下，再次登录后可继续查看。',
  confirmLabel: '退出登录',
  cancelLabel: '取消',
  destructive: true,
};

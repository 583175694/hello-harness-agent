import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

import type { AuthUserView } from '@harness/agent-protocol';
import { Dialog, DialogContent } from '../../components/ui/dialog';
import { LoginForm } from './login-form';

type LoginDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLoggedIn: (user: AuthUserView) => void;
};

export function LoginDialog({ open, onOpenChange, onLoggedIn }: LoginDialogProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        variant="settings"
        className="settings-dialog settings-dialog--login"
        aria-labelledby={titleId}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          closeRef.current?.focus();
        }}
      >
        <div className="settings-dialog__login-body">
          <header className="settings-dialog__header settings-dialog__header--login">
            <h2 className="settings-dialog__page-heading" id={titleId}>
              登录 Harness Agent
            </h2>
            <button
              ref={closeRef}
              type="button"
              className="settings-dialog__close"
              aria-label="关闭"
              onClick={() => onOpenChange(false)}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </header>
          <LoginForm onLoggedIn={onLoggedIn} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

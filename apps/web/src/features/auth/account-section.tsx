import { useState, type FormEvent } from 'react';

import {
  ApiProblem,
  bindEmail,
  bindPhone,
  logout,
  sendEmailCode,
  sendPhoneCode,
} from '../../api/client';
import type { AuthUserView } from '@harness/agent-protocol';
import { LOGOUT_CONFIRM, useConfirm } from '../../components/ui/confirm-provider';
import { ACCOUNT_BINDING_INTRO, formatAuthApiError } from './auth-messages';

type AccountSectionProps = {
  user: AuthUserView;
  onUserChange: (user: AuthUserView) => void;
  onLoggedOut: () => void;
};

export function AccountSection({ user, onUserChange, onLoggedOut }: AccountSectionProps) {
  const confirm = useConfirm();
  const [bindTarget, setBindTarget] = useState<'email' | 'phone' | null>(null);
  const [value, setValue] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'idle' | 'code'>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openBind(target: 'email' | 'phone') {
    setBindTarget(target);
    setStep('idle');
    setValue('');
    setCode('');
    setError(null);
  }

  function closeBind() {
    setBindTarget(null);
    setValue('');
    setCode('');
    setStep('idle');
    setError(null);
  }

  async function sendBindCode(event: FormEvent) {
    event.preventDefault();
    if (!bindTarget) return;
    setBusy(true);
    setError(null);
    try {
      if (bindTarget === 'email') await sendEmailCode(value.trim());
      else await sendPhoneCode(value.trim());
      setStep('code');
    } catch (err) {
      setError(
        err instanceof ApiProblem
          ? formatAuthApiError(err.problem, { bindTarget: bindTarget ?? undefined })
          : '发送失败',
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirmBind(event: FormEvent) {
    event.preventDefault();
    if (!bindTarget) return;
    setBusy(true);
    setError(null);
    try {
      const next =
        bindTarget === 'email'
          ? await bindEmail(value.trim(), code.trim())
          : await bindPhone(value.trim(), code.trim());
      onUserChange(next);
      closeBind();
    } catch (err) {
      setError(
        err instanceof ApiProblem
          ? formatAuthApiError(err.problem, { bindTarget: bindTarget ?? undefined })
          : '绑定失败',
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    if (!(await confirm(LOGOUT_CONFIRM))) return;
    setBusy(true);
    try {
      await logout();
      onLoggedOut();
    } catch {
      onLoggedOut();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-dialog__account-block">
      <div className="settings-dialog__row">
        <div className="settings-dialog__row-text">
          <div className="settings-dialog__row-title">账号</div>
        </div>
        <button
          type="button"
          className="settings-dialog__outline-btn settings-dialog__outline-btn--danger"
          disabled={busy}
          onClick={() => void handleLogout()}
        >
          退出登录
        </button>
      </div>

      <p className="settings-dialog__account-hint">{ACCOUNT_BINDING_INTRO}</p>

      <div className="settings-dialog__row">
        <div className="settings-dialog__row-text">
          <div className="settings-dialog__row-title">显示名</div>
        </div>
        <span className="settings-dialog__row-value settings-dialog__row-value--primary">
          {user.displayName}
        </span>
      </div>

      <div className="settings-dialog__row">
        <div className="settings-dialog__row-text">
          <div className="settings-dialog__row-title">邮箱</div>
        </div>
        <span className="settings-dialog__row-value">
          {user.email ? (
            <span className="settings-dialog__row-value--primary">{user.email}</span>
          ) : (
            <>
              <span className="settings-dialog__meta">未绑定</span>
              <button
                type="button"
                className="settings-dialog__link-btn"
                disabled={busy || bindTarget !== null}
                onClick={() => openBind('email')}
              >
                绑定
              </button>
            </>
          )}
        </span>
      </div>

      <div className="settings-dialog__row">
        <div className="settings-dialog__row-text">
          <div className="settings-dialog__row-title">手机</div>
        </div>
        <span className="settings-dialog__row-value">
          {user.phone ? (
            <span className="settings-dialog__row-value--primary">{user.phone}</span>
          ) : (
            <>
              <span className="settings-dialog__meta">未绑定</span>
              <button
                type="button"
                className="settings-dialog__link-btn"
                disabled={busy || bindTarget !== null}
                onClick={() => openBind('phone')}
              >
                绑定
              </button>
            </>
          )}
        </span>
      </div>

      {bindTarget ? (
        <form
          className="settings-dialog__account-bind"
          onSubmit={step === 'idle' ? sendBindCode : confirmBind}
        >
          <label className="settings-dialog__field">
            <span className="settings-dialog__field-label">
              {bindTarget === 'email' ? '邮箱' : '手机号'}
            </span>
            <input
              className="settings-dialog__field-input"
              type={bindTarget === 'email' ? 'email' : 'tel'}
              required
              value={value}
              onChange={(e) =>
                setValue(
                  bindTarget === 'phone'
                    ? e.target.value.replace(/\D/g, '').slice(0, 11)
                    : e.target.value,
                )
              }
              placeholder={bindTarget === 'email' ? 'you@example.com' : '13800138000'}
              inputMode={bindTarget === 'phone' ? 'numeric' : undefined}
            />
          </label>
          {step === 'code' ? (
            <label className="settings-dialog__field">
              <span className="settings-dialog__field-label">验证码</span>
              <input
                className="settings-dialog__field-input settings-dialog__field-input--mono"
                inputMode="numeric"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6 位数字"
              />
            </label>
          ) : null}
          {error ? (
            <p className="settings-dialog__inline-error settings-dialog__inline-error--pre">{error}</p>
          ) : null}
          <div className="settings-dialog__account-bind-actions">
            <button type="submit" className="settings-dialog__outline-btn" disabled={busy}>
              {step === 'idle' ? '发送验证码' : '确认绑定'}
            </button>
            <button
              type="button"
              className="settings-dialog__link-btn"
              disabled={busy}
              onClick={closeBind}
            >
              取消
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

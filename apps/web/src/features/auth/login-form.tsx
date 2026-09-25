import { useEffect, useState, type FormEvent } from 'react';

import {
  ApiProblem,
  sendEmailCode,
  sendPhoneCode,
  verifyEmailLogin,
  verifyPhoneLogin,
} from '../../api/client';
import type { AuthUserView } from '@harness/agent-protocol';
import { formatAuthApiError, LOGIN_ACCOUNT_INTRO } from './auth-messages';
import { maskEmailForDisplay, maskPhoneForDisplay } from './mask-target';

type LoginTab = 'email' | 'phone';

const RESEND_INTERVAL_SEC = 60;

type LoginFormProps = {
  onLoggedIn: (user: AuthUserView) => void;
};

export function LoginForm({ onLoggedIn }: LoginFormProps) {
  const [tab, setTab] = useState<LoginTab>('email');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [sentTarget, setSentTarget] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setInterval(() => {
      setResendIn((current) => (current <= 1 ? 0 : current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendIn]);

  function resetTab(next: LoginTab) {
    setTab(next);
    setCodeSent(false);
    setCode('');
    setSentTarget('');
    setResendIn(0);
    setError(null);
  }

  async function dispatchSendCode() {
    setError(null);
    setBusy(true);
    try {
      if (tab === 'email') {
        const value = email.trim();
        await sendEmailCode(value);
        setSentTarget(maskEmailForDisplay(value));
      } else {
        const value = phone.trim();
        await sendPhoneCode(value);
        setSentTarget(maskPhoneForDisplay(value));
      }
      setCodeSent(true);
      setResendIn(RESEND_INTERVAL_SEC);
    } catch (err) {
      setError(
        err instanceof ApiProblem
          ? formatAuthApiError(err.problem)
          : '发送验证码失败，请稍后重试。',
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleSendCode(event: FormEvent) {
    event.preventDefault();
    await dispatchSendCode();
  }

  async function handleResend() {
    if (resendIn > 0 || busy) return;
    await dispatchSendCode();
  }

  async function handleVerify(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const user =
        tab === 'email'
          ? await verifyEmailLogin(email.trim(), code.trim())
          : await verifyPhoneLogin(phone.trim(), code.trim());
      onLoggedIn(user);
    } catch (err) {
      if (err instanceof ApiProblem) setError(formatAuthApiError(err.problem));
      else if (err instanceof Error && err.message.trim()) setError(err.message);
      else setError('登录失败，请检查验证码或稍后重试。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-form">
      <p className="login-form__intro">{LOGIN_ACCOUNT_INTRO}</p>
      <div className="login-form__method" role="tablist" aria-label="登录方式">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'email'}
          className={`login-form__method-btn${tab === 'email' ? ' is-active' : ''}`}
          onClick={() => resetTab('email')}
        >
          邮箱
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'phone'}
          className={`login-form__method-btn${tab === 'phone' ? ' is-active' : ''}`}
          onClick={() => resetTab('phone')}
        >
          短信
        </button>
      </div>
      {!codeSent ? (
        <form className="login-form__fields" onSubmit={handleSendCode}>
          {tab === 'email' ? (
            <label className="settings-dialog__field">
              <span className="settings-dialog__field-label">邮箱</span>
              <input
                className="settings-dialog__field-input"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </label>
          ) : (
            <label className="settings-dialog__field">
              <span className="settings-dialog__field-label">手机号</span>
              <input
                className="settings-dialog__field-input"
                type="tel"
                autoComplete="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                placeholder="13800138000"
                inputMode="numeric"
                pattern="1[0-9]{10}"
                maxLength={11}
              />
            </label>
          )}
          {error ? <p className="settings-dialog__inline-error">{error}</p> : null}
          <button type="submit" className="login-form__primary" disabled={busy}>
            {busy ? '发送中…' : '发送验证码'}
          </button>
        </form>
      ) : (
        <form className="login-form__fields" onSubmit={handleVerify}>
          <p className="login-form__sent-hint">
            验证码已发送至 <strong>{sentTarget}</strong>
          </p>
          <label className="settings-dialog__field">
            <span className="settings-dialog__field-label">验证码</span>
            <input
              className="settings-dialog__field-input settings-dialog__field-input--mono"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="6 位数字"
            />
          </label>
          {error ? <p className="settings-dialog__inline-error">{error}</p> : null}
          <button
            type="submit"
            className="login-form__primary"
            disabled={busy || code.length !== 6}
          >
            {busy ? '验证中…' : '登录'}
          </button>
          <div className="login-form__secondary-actions">
            <button
              type="button"
              className="settings-dialog__link-btn"
              disabled={busy || resendIn > 0}
              onClick={() => void handleResend()}
            >
              {resendIn > 0 ? `${resendIn}s 后可重发` : '重新发送'}
            </button>
            <button
              type="button"
              className="settings-dialog__link-btn"
              disabled={busy}
              onClick={() => {
                setCodeSent(false);
                setCode('');
                setResendIn(0);
              }}
            >
              更换{tab === 'email' ? '邮箱' : '手机号'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

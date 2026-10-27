import type { AuthUserView } from '@harness/agent-protocol';
import { ApiProblem } from '@harness/agent-client';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { sendPhoneLoginCode, verifyPhoneLogin } from '@/lib/mobile-auth-api';
import { useAppPreferences } from '@/providers/app-preferences-provider';

import { formatAuthApiError, LOGIN_ACCOUNT_INTRO } from './mobile-auth-messages';
import { maskPhoneForDisplay } from './mask-target';

const RESEND_INTERVAL_SEC = 60;

type MobileLoginFormProps = {
  onLoggedIn: (user: AuthUserView) => void;
};

export function MobileLoginForm({ onLoggedIn }: MobileLoginFormProps) {
  const { preferences } = useAppPreferences();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [sentTarget, setSentTarget] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setInterval(() => {
      setResendIn((current) => (current <= 1 ? 0 : current - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendIn]);

  async function dispatchSendCode() {
    setError(null);
    setBusy(true);
    try {
      const value = phone.trim();
      await sendPhoneLoginCode(preferences.apiBaseUrl, value);
      setSentTarget(maskPhoneForDisplay(value));
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

  async function handleVerify() {
    setError(null);
    setBusy(true);
    try {
      const user = await verifyPhoneLogin(preferences.apiBaseUrl, phone.trim(), code.trim());
      onLoggedIn(user);
    } catch (err) {
      if (err instanceof ApiProblem) setError(formatAuthApiError(err.problem));
      else setError('登录失败，请检查验证码或稍后重试。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="gap-4">
      <Text variant="body-sm" className="text-secondary" fixedSize>
        {LOGIN_ACCOUNT_INTRO}
      </Text>
      {!codeSent ? (
        <View className="gap-3">
          <View className="gap-1.5">
            <Text variant="body-sm" className="font-medium" fixedSize>
              手机号
            </Text>
            <Input
              value={phone}
              onChangeText={(value) => setPhone(value.replace(/\D/g, '').slice(0, 11))}
              placeholder="13800138000"
              keyboardType="phone-pad"
              autoComplete="tel"
              maxLength={11}
            />
          </View>
          {error ? (
            <Text variant="caption" className="text-rejection-text" fixedSize>
              {error}
            </Text>
          ) : null}
          <Button
            disabled={busy}
            label={busy ? '发送中…' : '发送验证码'}
            onPress={() => void dispatchSendCode()}
          />
        </View>
      ) : (
        <View className="gap-3">
          <Text variant="body-sm" className="text-secondary" fixedSize>
            验证码已发送至 {sentTarget}
          </Text>
          <View className="gap-1.5">
            <Text variant="body-sm" className="font-medium" fixedSize>
              验证码
            </Text>
            <Input
              value={code}
              onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
              placeholder="6 位数字"
              keyboardType="number-pad"
              maxLength={6}
            />
          </View>
          {error ? (
            <Text variant="caption" className="text-rejection-text" fixedSize>
              {error}
            </Text>
          ) : null}
          <Button
            disabled={busy}
            label={busy ? '登录中…' : '登录'}
            onPress={() => void handleVerify()}
          />
          <Button
            variant="ghost"
            disabled={busy || resendIn > 0}
            label={resendIn > 0 ? `${resendIn}s 后可重发` : '重新发送验证码'}
            onPress={() => void dispatchSendCode()}
          />
        </View>
      )}
    </View>
  );
}

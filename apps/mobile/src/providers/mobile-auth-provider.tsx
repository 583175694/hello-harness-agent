import type { AuthUserView } from '@harness/agent-protocol';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { isAuthRequiredError, fetchAuthMe, logoutMobileAuth } from '@/lib/mobile-auth-api';
import { clearSessionToken } from '@/lib/mobile-auth-storage';
import { resolveMobileApiBaseUrl } from '@/lib/agent-client';
import { useAppPreferences } from '@/providers/app-preferences-provider';

type MobileAuthContextValue = {
  authUser: AuthUserView | null;
  authChecking: boolean;
  /** 服务端要求登录（如 AUTH_MODE=required）且当前未登录。 */
  needsLogin: boolean;
  authEpoch: number;
  refreshAuth: () => Promise<void>;
  setAuthUser: (user: AuthUserView | null) => void;
  logout: () => Promise<void>;
};

const MobileAuthContext = createContext<MobileAuthContextValue | null>(null);

export function MobileAuthProvider({ children }: { children: ReactNode }) {
  const { preferences, hydrated } = useAppPreferences();
  const apiBaseUrl = resolveMobileApiBaseUrl(preferences.apiBaseUrl);
  const [authUser, setAuthUser] = useState<AuthUserView | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [authEpoch, setAuthEpoch] = useState(0);

  const refreshAuth = useCallback(async () => {
    setAuthChecking(true);
    try {
      const user = await fetchAuthMe(preferences.apiBaseUrl);
      setAuthUser(user);
      setNeedsLogin(false);
    } catch (error) {
      if (isAuthRequiredError(error)) {
        await clearSessionToken();
        setAuthUser(null);
        setNeedsLogin(true);
      } else {
        setAuthUser(null);
      }
    } finally {
      setAuthChecking(false);
    }
  }, [preferences.apiBaseUrl]);

  useEffect(() => {
    if (!hydrated) return;
    void refreshAuth();
  }, [hydrated, apiBaseUrl, refreshAuth]);

  const handleSetAuthUser = useCallback((user: AuthUserView | null) => {
    setAuthUser(user);
    setNeedsLogin(false);
    setAuthEpoch((value) => value + 1);
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutMobileAuth(preferences.apiBaseUrl);
    } catch {
      await clearSessionToken();
    }
    setAuthUser(null);
    setNeedsLogin(true);
    setAuthEpoch((value) => value + 1);
  }, [preferences.apiBaseUrl]);

  const value = useMemo(
    () => ({
      authUser,
      authChecking,
      needsLogin,
      authEpoch,
      refreshAuth,
      setAuthUser: handleSetAuthUser,
      logout,
    }),
    [authUser, authChecking, needsLogin, authEpoch, refreshAuth, handleSetAuthUser, logout],
  );

  return <MobileAuthContext.Provider value={value}>{children}</MobileAuthContext.Provider>;
}

export function useMobileAuth(): MobileAuthContextValue {
  const ctx = useContext(MobileAuthContext);
  if (!ctx) {
    throw new Error('useMobileAuth must be used within MobileAuthProvider');
  }
  return ctx;
}

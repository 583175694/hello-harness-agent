import { useColorScheme } from 'react-native';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  savePreferences,
  type AppPreferences,
  type ThemeMode,
} from '@/lib/preferences';

type AppPreferencesContextValue = {
  preferences: AppPreferences;
  hydrated: boolean;
  resolvedColorScheme: 'light' | 'dark';
  updatePreferences: (patch: Partial<AppPreferences>) => Promise<void>;
};

const AppPreferencesContext = createContext<AppPreferencesContextValue | null>(null);

function resolveScheme(
  mode: ThemeMode,
  system: 'light' | 'dark' | 'unspecified' | null | undefined,
): 'light' | 'dark' {
  if (mode === 'dark') return 'dark';
  if (mode === 'light') return 'light';
  return system === 'dark' ? 'dark' : 'light';
}

export function AppPreferencesProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preferences, setPreferences] = useState<AppPreferences>(DEFAULT_PREFERENCES);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadPreferences().then((loaded) => {
      if (!cancelled) {
        setPreferences(loaded);
        setHydrated(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const updatePreferences = useCallback(async (patch: Partial<AppPreferences>) => {
    setPreferences((prev) => {
      const next = { ...prev, ...patch };
      void savePreferences(next);
      return next;
    });
  }, []);

  const resolvedColorScheme = resolveScheme(preferences.themeMode, systemScheme);

  const value = useMemo(
    () => ({
      preferences,
      hydrated,
      resolvedColorScheme,
      updatePreferences,
    }),
    [preferences, hydrated, resolvedColorScheme, updatePreferences],
  );

  return <AppPreferencesContext.Provider value={value}>{children}</AppPreferencesContext.Provider>;
}

export function useAppPreferences(): AppPreferencesContextValue {
  const ctx = useContext(AppPreferencesContext);
  if (!ctx) {
    throw new Error('useAppPreferences must be used within AppPreferencesProvider');
  }
  return ctx;
}

import { useMemo } from 'react';
import { useAppPreferences } from '@/providers/app-preferences-provider';
import { resolveColors } from '@/lib/theme';

export function useThemeColors() {
  const { resolvedColorScheme } = useAppPreferences();
  return useMemo(() => resolveColors(resolvedColorScheme), [resolvedColorScheme]);
}

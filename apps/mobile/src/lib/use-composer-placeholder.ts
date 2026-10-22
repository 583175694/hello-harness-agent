import { useMemo } from 'react';
import { resolveDesignTokens } from '@/lib/design-tokens';
import { useAppPreferences } from '@/providers/app-preferences-provider';

export function useComposerPlaceholderColor(): string {
  const { resolvedColorScheme } = useAppPreferences();
  return useMemo(
    () => resolveDesignTokens(resolvedColorScheme).composerPlaceholder,
    [resolvedColorScheme],
  );
}

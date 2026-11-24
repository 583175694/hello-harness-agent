import { useEffect, useRef, useState } from 'react';

import { APP_BRAND } from '../config/ui.constants';

type UseDocumentTitleStatusOptions = {
  hasRunning: boolean;
  hasWaitingForUser: boolean;
  baseTitle?: string;
};

/** 将任务运行、待确认及后台完成状态同步到浏览器标签页标题。 */
export function useDocumentTitleStatus({
  hasRunning,
  hasWaitingForUser,
  baseTitle = APP_BRAND.name,
}: UseDocumentTitleStatusOptions): void {
  const wasRunningRef = useRef(hasRunning);
  const [completedInBackground, setCompletedInBackground] = useState(false);

  useEffect(() => {
    if (hasRunning || hasWaitingForUser) {
      setCompletedInBackground(false);
    } else if (
      wasRunningRef.current &&
      !hasRunning &&
      typeof document !== 'undefined' &&
      document.visibilityState === 'hidden'
    ) {
      setCompletedInBackground(true);
    }
    wasRunningRef.current = hasRunning;
  }, [hasRunning, hasWaitingForUser]);

  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return undefined;
    const clearIfVisible = () => {
      if (document.visibilityState === 'visible') {
        setCompletedInBackground(false);
      }
    };
    document.addEventListener('visibilitychange', clearIfVisible);
    window.addEventListener('focus', clearIfVisible);
    return () => {
      document.removeEventListener('visibilitychange', clearIfVisible);
      window.removeEventListener('focus', clearIfVisible);
    };
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    if (hasWaitingForUser) {
      document.title = `待确认 · ${baseTitle}`;
    } else if (hasRunning) {
      document.title = `运行中… · ${baseTitle}`;
    } else if (completedInBackground) {
      document.title = `✓ 回复已完成 · ${baseTitle}`;
    } else {
      document.title = baseTitle;
    }
    return () => {
      document.title = baseTitle;
    };
  }, [baseTitle, completedInBackground, hasRunning, hasWaitingForUser]);
}

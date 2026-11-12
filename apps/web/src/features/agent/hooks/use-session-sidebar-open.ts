import { useCallback, useEffect, useState } from 'react';

export const SESSION_SIDEBAR_OPEN_STORAGE_KEY = 'pipishrimp.shell.sessionSidebarOpen';

function readStoredSessionSidebarOpen(): boolean {
  if (typeof window === 'undefined') return true;
  const stored = window.localStorage.getItem(SESSION_SIDEBAR_OPEN_STORAGE_KEY);
  if (stored === 'false') return false;
  return true;
}

/** 桌面端会话列表侧栏展开/收起；移动端仍使用抽屉，不受此项影响。 */
export function useSessionSidebarOpen() {
  const [sessionSidebarOpen, setSessionSidebarOpen] = useState(readStoredSessionSidebarOpen);

  useEffect(() => {
    window.localStorage.setItem(SESSION_SIDEBAR_OPEN_STORAGE_KEY, String(sessionSidebarOpen));
  }, [sessionSidebarOpen]);

  const toggleSessionSidebar = useCallback(() => {
    setSessionSidebarOpen((current) => !current);
  }, []);

  return { sessionSidebarOpen, setSessionSidebarOpen, toggleSessionSidebar };
}

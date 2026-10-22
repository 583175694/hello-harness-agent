import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

type RunLifecycleHandlers = {
  onBackground: () => void;
  onForeground: () => void;
};

/** P8 子集：后台 abort SSE，回前台由 host 续订 active Run。 */
export function useAppStateRunLifecycle(handlers: RunLifecycleHandlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    let current: AppStateStatus = AppState.currentState;

    const subscription = AppState.addEventListener('change', (next) => {
      if (current.match(/inactive|background/) && next === 'active') {
        handlersRef.current.onForeground();
      } else if (next.match(/inactive|background/) && current === 'active') {
        handlersRef.current.onBackground();
      }
      current = next;
    });

    return () => subscription.remove();
  }, []);
}

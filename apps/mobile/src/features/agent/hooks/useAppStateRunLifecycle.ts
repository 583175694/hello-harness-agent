import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

type LifecycleHandlers = {
  onBackground: () => void;
  onForeground: () => void;
};

export function useAppStateRunLifecycle(handlers: LifecycleHandlers): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') handlersRef.current.onForeground();
      else if (next === 'background' || next === 'inactive') handlersRef.current.onBackground();
    });
    return () => subscription.remove();
  }, []);
}

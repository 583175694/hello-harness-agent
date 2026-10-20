import { useEffect, useState } from 'react';
import { AccessibilityInfo, type AccessibilityChangeEventName } from 'react-native';

export function useReducedMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;

    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });

    const event = 'reduceMotionChanged' as AccessibilityChangeEventName;
    const subscription = AccessibilityInfo.addEventListener(event, (enabled) => {
      setReduceMotion(enabled);
    });

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}

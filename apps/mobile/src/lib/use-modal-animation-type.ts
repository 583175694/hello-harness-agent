import { useReducedMotion } from '@/lib/use-reduced-motion';

type ModalAnimationType = 'none' | 'slide' | 'fade';

/** RN Modal system animation — disabled when reduce motion is on. */
export function useModalAnimationType(preferred: Exclude<ModalAnimationType, 'none'>): ModalAnimationType {
  const reduceMotion = useReducedMotion();
  return reduceMotion ? 'none' : preferred;
}

export const OVERLAY_MOTION_MS = 200;
export const OVERLAY_REDUCE_OPACITY_MS = 150;

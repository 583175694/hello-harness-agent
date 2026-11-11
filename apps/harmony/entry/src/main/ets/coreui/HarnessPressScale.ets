/** 简洁按压：瞬时透明度，无缩放。 */
export const HARNESS_PRESS_OPACITY: number = 0.72;

export function harnessPressOpacity(pressed: boolean, enabled: boolean = true, idle: number = 1): number {
  if (!enabled) {
    return idle;
  }
  return pressed ? HARNESS_PRESS_OPACITY : idle;
}

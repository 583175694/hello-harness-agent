import { PreviewLocalPreferences } from '../preview/PreviewLocalPreferences';

/** 栈式 push/pop：右进右出，替代 router 默认渐隐。在 @Entry 组件内：pageTransition() { harnessPageTransition() } */
@Builder
export function harnessPageTransition() {
  const duration = PreviewLocalPreferences.reduceMotion ? 0 : 280;
  PageTransitionEnter({ type: RouteType.Push, duration: duration, curve: Curve.FastOutSlow })
    .slide(SlideEffect.Right)
  PageTransitionExit({ type: RouteType.Pop, duration: duration, curve: Curve.FastOutSlow })
    .slide(SlideEffect.Right)
}

import { LayoutAnimation, Platform, UIManager } from 'react-native';

let androidLayoutAnimationEnabled = false;

/** 对齐 Web `.ai-chain__content` / `.ai-reasoning__content` 约 220ms ease。 */
export function configureProcessExpandLayoutAnimation() {
  if (Platform.OS === 'android' && !androidLayoutAnimationEnabled) {
    UIManager.setLayoutAnimationEnabledExperimental?.(true);
    androidLayoutAnimationEnabled = true;
  }
  /** 仅 opacity 会在收起时先隐内容再缩高度；用 preset 同步布局高度。 */
  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
}

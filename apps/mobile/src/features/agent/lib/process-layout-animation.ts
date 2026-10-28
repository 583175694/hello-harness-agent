import { LayoutAnimation, Platform, UIManager } from 'react-native';

let androidLayoutAnimationEnabled = false;

/** 对齐 Web `.ai-chain__content` / `.ai-reasoning__content` 约 220ms ease。 */
export function configureProcessExpandLayoutAnimation() {
  if (Platform.OS === 'android' && !androidLayoutAnimationEnabled) {
    UIManager.setLayoutAnimationEnabledExperimental?.(true);
    androidLayoutAnimationEnabled = true;
  }
  LayoutAnimation.configureNext(
    LayoutAnimation.create(
      220,
      LayoutAnimation.Types.easeInEaseOut,
      LayoutAnimation.Properties.opacity,
    ),
  );
}

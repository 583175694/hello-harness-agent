import { Image, type ImageStyle, type StyleProp } from 'react-native';
import { APP_BRAND } from '@/lib/brand';

type BrandIconProps = {
  size: number;
  style?: StyleProp<ImageStyle>;
  /** Defaults to product name for assistant avatar. Pass empty string to hide from a11y tree. */
  accessibilityLabel?: string;
};

/** pipishrimp 虾图标（与 Web `BrandIcon` / apple-touch-icon 同源） */
export function BrandIcon({
  size,
  style,
  accessibilityLabel = APP_BRAND.name,
}: BrandIconProps) {
  return (
    <Image
      source={APP_BRAND.iconAppSource}
      style={[{ width: size, height: size }, style]}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel || undefined}
    />
  );
}

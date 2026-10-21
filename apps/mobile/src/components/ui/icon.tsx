import type { LucideIcon } from 'lucide-react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import {
  iconColors,
  iconStrokeWidth,
  type IconTextWeight,
  type IconTone,
} from '@/lib/theme';

type IconProps = {
  icon: LucideIcon;
  tone?: IconTone;
  size?: number;
  /** Match adjacent Text weight (e.g. `semibold` beside `font-semibold`). */
  textWeight?: IconTextWeight;
  /** Explicit stroke overrides `textWeight` + size heuristics. */
  strokeWidth?: number;
  style?: StyleProp<ViewStyle>;
};

export function Icon({
  icon: IconComponent,
  tone = 'secondary',
  size = 20,
  textWeight = 'regular',
  strokeWidth,
  style,
}: IconProps) {
  return (
    <IconComponent
      size={size}
      color={iconColors[tone]}
      strokeWidth={strokeWidth ?? iconStrokeWidth(size, textWeight)}
      style={style}
    />
  );
}

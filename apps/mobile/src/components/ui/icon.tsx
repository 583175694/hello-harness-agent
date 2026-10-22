import type { LucideIcon } from 'lucide-react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import {
  iconStrokeWidth,
  resolveIconColors,
  type IconTextWeight,
  type IconTone,
} from '@/lib/theme';
import { useAppPreferences } from '@/providers/app-preferences-provider';

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
  const { resolvedColorScheme } = useAppPreferences();
  const palette = resolveIconColors(resolvedColorScheme);

  return (
    <IconComponent
      size={size}
      color={palette[tone]}
      strokeWidth={strokeWidth ?? iconStrokeWidth(size, textWeight)}
      style={style}
    />
  );
}

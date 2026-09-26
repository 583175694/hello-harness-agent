import Svg, { Circle, Path } from 'react-native-svg';

export function HarnessGlyph({ size = 18, color = '#ffffff' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Circle cx="10" cy="5" r="2.5" stroke={color} strokeWidth="1.8" />
      <Circle cx="5" cy="14" r="2.5" stroke={color} strokeWidth="1.8" />
      <Circle cx="15" cy="14" r="2.5" stroke={color} strokeWidth="1.8" />
      <Path d="M10 7.5V10.5M10 10.5L6.5 12M10 10.5L13.5 12" stroke={color} strokeLinecap="round" strokeWidth="1.6" />
    </Svg>
  );
}

import { APP_BRAND } from '../config/ui.constants';

type BrandIconProps = {
  size: number;
  className?: string;
};

/** 产品虾图标（全主题统一 apple-touch-icon） */
export function BrandIcon({ size, className = '' }: BrandIconProps) {
  return (
    <img
      className={className}
      src={APP_BRAND.iconAppSrc}
      alt=""
      width={size}
      height={size}
      decoding="async"
      aria-hidden
    />
  );
}

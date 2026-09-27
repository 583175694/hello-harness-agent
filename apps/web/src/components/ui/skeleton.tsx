import type { ComponentProps } from 'react';

export function Skeleton({ className = '', ...props }: ComponentProps<'div'>) {
  return <div className={`ui-skeleton ${className}`.trim()} {...props} />;
}

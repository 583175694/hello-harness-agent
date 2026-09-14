import type { HTMLAttributes, ReactNode } from 'react';

function classes(...values: Array<string | undefined | false>): string {
  return values.filter(Boolean).join(' ');
}

export function Shimmer({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { children?: ReactNode }) {
  return (
    <span className={classes('ai-shimmer', className)} {...props}>
      {children}
    </span>
  );
}

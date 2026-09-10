import { type HTMLAttributes } from 'react';

function classes(...values: Array<string | undefined | false>): string {
  return values.filter(Boolean).join(' ');
}

export function Attachments({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={classes('ai-attachments', className)} {...props} />;
}

export function Attachment({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={classes('ai-attachment', className)} {...props} />;
}

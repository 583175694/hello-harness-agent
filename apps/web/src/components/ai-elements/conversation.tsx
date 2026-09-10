import { forwardRef, type HTMLAttributes } from 'react';

function classes(...values: Array<string | undefined | false>): string {
  return values.filter(Boolean).join(' ');
}

export function Conversation({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={classes('ai-conversation', className)} {...props} />;
}

export const ConversationContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function ConversationContent({ className, ...props }, ref) {
    return <div ref={ref} className={classes('ai-conversation__content', className)} {...props} />;
  },
);

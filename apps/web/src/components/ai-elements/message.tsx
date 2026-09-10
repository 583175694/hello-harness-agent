import { memo, type HTMLAttributes } from 'react';

import { MarkdownContent } from '../markdown-content';

function classes(...values: Array<string | undefined | false>): string {
  return values.filter(Boolean).join(' ');
}

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: 'user' | 'assistant';
};

export function Message({ className, from, ...props }: MessageProps) {
  return (
    <div
      className={classes(
        'ai-message',
        from === 'user' ? 'ai-message--user' : 'ai-message--assistant',
        className,
      )}
      {...props}
    />
  );
}

export function MessageContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={classes('ai-message-content', className)} {...props} />;
}

export const MessageResponse = memo(function MessageResponse({
  children,
  className,
  isAnimating = false,
}: {
  children: string;
  className?: string;
  isAnimating?: boolean;
}) {
  return (
    <MarkdownContent
      className={classes('ai-message-response', className)}
      isAnimating={isAnimating}
    >
      {children}
    </MarkdownContent>
  );
});

export function MessageActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={classes('ai-message-actions', className)} {...props} />;
}

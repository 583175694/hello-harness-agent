import {
  forwardRef,
  type FormHTMLAttributes,
  type HTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

function classes(...values: Array<string | undefined | false>): string {
  return values.filter(Boolean).join(' ');
}

export const PromptInput = forwardRef<HTMLFormElement, FormHTMLAttributes<HTMLFormElement>>(
  function PromptInput({ className, ...props }, ref) {
    return <form ref={ref} className={classes('ai-prompt-input', className)} {...props} />;
  },
);

export function PromptInputHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={classes('ai-prompt-input__header', className)} {...props} />;
}

export function PromptInputBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={classes('ai-prompt-input__body', className)} {...props} />;
}

export function PromptInputTextarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={classes('ai-prompt-input__textarea', className)} {...props} />;
}

export function PromptInputFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={classes('ai-prompt-input__footer', className)} {...props} />;
}

export function PromptInputTools({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={classes('ai-prompt-input__tools', className)} {...props} />;
}

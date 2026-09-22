import {
  createContext,
  useContext,
  useMemo,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from 'react';

function classes(...values: Array<string | undefined | false>): string {
  return values.filter(Boolean).join(' ');
}

export type ToolConfirmationApproval =
  | {
      id: string;
      approved?: never;
      reason?: never;
    }
  | {
      id: string;
      approved: boolean;
      reason?: string;
    }
  | undefined;

export type ToolConfirmationState =
  | 'approval-requested'
  | 'approval-responded'
  | 'output-denied'
  | 'output-available'
  | 'input-streaming'
  | 'input-available';

interface ConfirmationContextValue {
  approval: ToolConfirmationApproval;
  state: ToolConfirmationState;
}

const ConfirmationContext = createContext<ConfirmationContextValue | null>(null);

function useConfirmation(): ConfirmationContextValue {
  const context = useContext(ConfirmationContext);
  if (!context) {
    throw new Error('Confirmation components must be used within Confirmation');
  }
  return context;
}

export type ConfirmationProps = HTMLAttributes<HTMLDivElement> & {
  approval?: ToolConfirmationApproval;
  state: ToolConfirmationState;
};

export function Confirmation({
  className,
  approval,
  state,
  ...props
}: ConfirmationProps) {
  const contextValue = useMemo(() => ({ approval, state }), [approval, state]);

  if (!approval || state === 'input-streaming' || state === 'input-available') {
    return null;
  }

  return (
    <ConfirmationContext.Provider value={contextValue}>
      <div
        role="alert"
        className={classes('ai-confirmation', className)}
        {...props}
      />
    </ConfirmationContext.Provider>
  );
}

export type ConfirmationTitleProps = HTMLAttributes<HTMLParagraphElement>;

export function ConfirmationTitle({ className, ...props }: ConfirmationTitleProps) {
  return <p className={classes('ai-confirmation__title', className)} {...props} />;
}

export type ConfirmationContentProps = HTMLAttributes<HTMLDivElement>;

export function ConfirmationContent({ className, ...props }: ConfirmationContentProps) {
  const { state } = useConfirmation();
  if (state !== 'approval-requested') return null;
  return <div className={classes('ai-confirmation__content', className)} {...props} />;
}

export interface ConfirmationRequestProps {
  children?: ReactNode;
}

export function ConfirmationRequest({ children }: ConfirmationRequestProps) {
  const { state } = useConfirmation();
  if (state !== 'approval-requested') return null;
  return children;
}

export interface ConfirmationAcceptedProps {
  children?: ReactNode;
}

export function ConfirmationAccepted({ children }: ConfirmationAcceptedProps) {
  const { approval, state } = useConfirmation();
  if (
    !approval?.approved ||
    (state !== 'approval-responded' &&
      state !== 'output-denied' &&
      state !== 'output-available')
  ) {
    return null;
  }
  return children;
}

export interface ConfirmationRejectedProps {
  children?: ReactNode;
}

export function ConfirmationRejected({ children }: ConfirmationRejectedProps) {
  const { approval, state } = useConfirmation();
  if (
    approval?.approved !== false ||
    (state !== 'approval-responded' &&
      state !== 'output-denied' &&
      state !== 'output-available')
  ) {
    return null;
  }
  return children;
}

export type ConfirmationActionsProps = HTMLAttributes<HTMLDivElement>;

export function ConfirmationActions({ className, ...props }: ConfirmationActionsProps) {
  const { state } = useConfirmation();
  if (state !== 'approval-requested') return null;
  return <div className={classes('ai-confirmation__actions', className)} {...props} />;
}

export type ConfirmationActionProps = ButtonHTMLAttributes<HTMLButtonElement>;

export function ConfirmationAction({ className, type = 'button', ...props }: ConfirmationActionProps) {
  return (
    <button
      type={type}
      className={classes('ai-confirmation__action send-button', className)}
      {...props}
    />
  );
}

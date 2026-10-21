import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import type { ComponentProps } from 'react';

export const AlertDialog = AlertDialogPrimitive.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;
export const AlertDialogPortal = AlertDialogPrimitive.Portal;

export function AlertDialogOverlay({
  className = '',
  ...props
}: ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
  return (
    <AlertDialogPrimitive.Overlay className={`ui-alert-dialog-overlay ${className}`} {...props} />
  );
}

export function AlertDialogContent({
  className = '',
  ...props
}: ComponentProps<typeof AlertDialogPrimitive.Content>) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content className={`ui-alert-dialog-content ${className}`} {...props} />
    </AlertDialogPortal>
  );
}

export function AlertDialogHeader({ className = '', ...props }: ComponentProps<'div'>) {
  return <div className={`ui-dialog-header ${className}`} {...props} />;
}

export function AlertDialogFooter({ className = '', ...props }: ComponentProps<'div'>) {
  return <div className={`ui-dialog-footer ${className}`} {...props} />;
}

export function AlertDialogTitle({
  className = '',
  ...props
}: ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return <AlertDialogPrimitive.Title className={`ui-dialog-title ${className}`} {...props} />;
}

export function AlertDialogDescription({
  className = '',
  ...props
}: ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description className={`ui-dialog-description ${className}`} {...props} />
  );
}

export function AlertDialogCancel({
  className = '',
  ...props
}: ComponentProps<typeof AlertDialogPrimitive.Cancel>) {
  return <AlertDialogPrimitive.Cancel className={`secondary-button ${className}`} {...props} />;
}

export function AlertDialogAction({
  className = '',
  ...props
}: ComponentProps<typeof AlertDialogPrimitive.Action>) {
  return <AlertDialogPrimitive.Action className={`primary-button ${className}`} {...props} />;
}

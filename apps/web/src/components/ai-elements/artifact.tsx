import { type HTMLAttributes } from 'react';

function classes(...values: Array<string | undefined | false>): string {
  return values.filter(Boolean).join(' ');
}

export function Artifact({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={classes('ai-artifact', className)} {...props} />;
}

export function ArtifactHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={classes('ai-artifact__header', className)} {...props} />;
}

export function ArtifactTitle({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={classes('ai-artifact__title', className)} {...props} />;
}

export function ArtifactDescription({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={classes('ai-artifact__description', className)} {...props} />;
}

export function ArtifactActions({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={classes('ai-artifact__actions', className)} {...props} />;
}

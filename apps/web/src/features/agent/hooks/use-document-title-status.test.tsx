import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useDocumentTitleStatus } from './use-document-title-status';

function Harness({
  hasRunning,
  hasWaitingForUser,
  baseTitle,
}: {
  hasRunning: boolean;
  hasWaitingForUser: boolean;
  baseTitle?: string;
}) {
  useDocumentTitleStatus({ hasRunning, hasWaitingForUser, baseTitle });
  return null;
}

describe('useDocumentTitleStatus', () => {
  let visibility: DocumentVisibilityState = 'visible';

  beforeEach(() => {
    visibility = 'visible';
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibility,
    });
    document.title = 'pipishrimp';
  });

  afterEach(() => {
    document.title = 'pipishrimp';
  });

  it('shows running and waiting states with waiting taking precedence', () => {
    const { rerender, unmount } = render(
      <Harness hasRunning={false} hasWaitingForUser={false} baseTitle="pipishrimp" />,
    );
    expect(document.title).toBe('pipishrimp');

    rerender(<Harness hasRunning hasWaitingForUser={false} baseTitle="pipishrimp" />);
    expect(document.title).toBe('运行中… · pipishrimp');

    rerender(<Harness hasRunning hasWaitingForUser baseTitle="pipishrimp" />);
    expect(document.title).toBe('待确认 · pipishrimp');

    unmount();
    expect(document.title).toBe('pipishrimp');
  });

  it('shows background completion notice when hidden and clears when returning visible', () => {
    const { rerender } = render(
      <Harness hasRunning hasWaitingForUser={false} baseTitle="pipishrimp" />,
    );
    expect(document.title).toBe('运行中… · pipishrimp');

    visibility = 'hidden';
    rerender(<Harness hasRunning={false} hasWaitingForUser={false} baseTitle="pipishrimp" />);
    expect(document.title).toBe('✓ 回复已完成 · pipishrimp');

    visibility = 'visible';
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(document.title).toBe('pipishrimp');
  });

  it('does not show completion notice when finishing while tab is visible', () => {
    visibility = 'visible';
    const { rerender } = render(
      <Harness hasRunning hasWaitingForUser={false} baseTitle="pipishrimp" />,
    );
    rerender(<Harness hasRunning={false} hasWaitingForUser={false} baseTitle="pipishrimp" />);
    expect(document.title).toBe('pipishrimp');
  });
});

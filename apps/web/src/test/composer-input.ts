import { act, screen, waitFor } from '@testing-library/react';
import { expect } from 'vitest';

export function fillComposerInput(element: HTMLElement, text: string): void {
  act(() => {
    element.focus();
    const clipboardData = {
      files: [] as File[],
      types: ['text/plain'],
      getData: (format: string) => (format === 'text/plain' ? text : ''),
    };
    const event = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: clipboardData as unknown as DataTransfer,
    });
    element.dispatchEvent(event);
  });
}

export async function fillComposerAndWait(text: string): Promise<void> {
  fillComposerInput(screen.getByRole('textbox', { name: '任务输入' }), text);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: '发送任务' })).not.toHaveAttribute('disabled'),
  );
}

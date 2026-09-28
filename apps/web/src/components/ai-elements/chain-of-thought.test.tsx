import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
} from './chain-of-thought';

afterEach(() => {
  vi.useRealTimers();
});

describe('ChainOfThought autoCollapse', () => {
  it('starts collapsed for completed messages without a delay', () => {
    render(
      <ChainOfThought autoCollapse running={false} finalOutputVisible>
        <ChainOfThoughtHeader>处理过程</ChainOfThoughtHeader>
        <ChainOfThoughtContent>
          <p>步骤</p>
        </ChainOfThoughtContent>
      </ChainOfThought>,
    );

    expect(screen.getByRole('button', { name: '处理过程' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('collapses when final output becomes visible', () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <ChainOfThought autoCollapse running finalOutputVisible={false}>
        <ChainOfThoughtHeader>处理过程</ChainOfThoughtHeader>
        <ChainOfThoughtContent>
          <p>步骤</p>
        </ChainOfThoughtContent>
      </ChainOfThought>,
    );

    const header = screen.getByRole('button', { name: '处理过程' });
    expect(header).toHaveAttribute('aria-expanded', 'true');

    rerender(
      <ChainOfThought autoCollapse running finalOutputVisible>
        <ChainOfThoughtHeader>处理过程</ChainOfThoughtHeader>
        <ChainOfThoughtContent>
          <p>步骤</p>
        </ChainOfThoughtContent>
      </ChainOfThought>,
    );

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(header).toHaveAttribute('aria-expanded', 'false');
  });

  it('does not collapse after the user manually expands', () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <ChainOfThought autoCollapse running finalOutputVisible={false}>
        <ChainOfThoughtHeader>处理过程</ChainOfThoughtHeader>
        <ChainOfThoughtContent>
          <p>步骤</p>
        </ChainOfThoughtContent>
      </ChainOfThought>,
    );

    rerender(
      <ChainOfThought autoCollapse running finalOutputVisible>
        <ChainOfThoughtHeader>处理过程</ChainOfThoughtHeader>
        <ChainOfThoughtContent>
          <p>步骤</p>
        </ChainOfThoughtContent>
      </ChainOfThought>,
    );

    const header = screen.getByRole('button', { name: '处理过程' });
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(header).toHaveAttribute('aria-expanded', 'false');

    act(() => {
      header.click();
    });
    expect(header).toHaveAttribute('aria-expanded', 'true');

    rerender(
      <ChainOfThought autoCollapse running={false} finalOutputVisible>
        <ChainOfThoughtHeader>处理过程</ChainOfThoughtHeader>
        <ChainOfThoughtContent>
          <p>步骤</p>
        </ChainOfThoughtContent>
      </ChainOfThought>,
    );

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(header).toHaveAttribute('aria-expanded', 'true');
  });
});

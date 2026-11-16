import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AGENT_UI_BEHAVIOR } from '../config/ui.constants';
import { UserBubbleText } from './user-bubble-text';

describe('UserBubbleText', () => {
  it('offers expand when content exceeds the collapsed height', () => {
    const longBody = Array.from({ length: 80 }, (_, index) => `段落 ${index + 1}`).join('\n\n');
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(
      AGENT_UI_BEHAVIOR.userMessageCollapsedMaxHeightPx + 120,
    );
    render(<UserBubbleText body={longBody} />);
    expect(screen.getByRole('button', { name: '展开全部' })).toBeInTheDocument();
  });

  it('toggles between expanded and collapsed labels', () => {
    const longBody = 'x'.repeat(2000);
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(
      AGENT_UI_BEHAVIOR.userMessageCollapsedMaxHeightPx + 50,
    );
    render(<UserBubbleText body={longBody} />);
    fireEvent.click(screen.getByRole('button', { name: '展开全部' }));
    expect(screen.getByRole('button', { name: '收起' })).toBeInTheDocument();
  });
});
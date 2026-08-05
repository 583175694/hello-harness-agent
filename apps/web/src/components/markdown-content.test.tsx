import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MarkdownContent } from './markdown-content';

describe('MarkdownContent', () => {
  it('renders GFM content with the shared chat theme', () => {
    const markdown = `# 调研结论

- [x] 已完成检索
- [ ] 等待复核

| 市场 | 状态 |
| --- | --- |
| 中国 | 活跃 |

[查看来源](https://example.com)`;

    const { container } = render(<MarkdownContent>{markdown}</MarkdownContent>);

    expect(container.firstChild).toHaveClass('markdown-content', 'markdown-content--chat');
    expect(screen.getByRole('heading', { level: 1, name: '调研结论' })).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);

    const table = screen.getByRole('table');
    expect(table.parentElement).toHaveClass('markdown-table-scroll');
    expect(table.parentElement).toHaveAttribute('tabindex', '0');

    expect(screen.getByRole('link', { name: '查看来源' })).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    );
    expect(screen.getByRole('link', { name: '查看来源' })).toHaveAttribute('target', '_blank');
  });

  it('supports report density and unlabelled fenced code blocks', () => {
    const { container } = render(
      <MarkdownContent variant="report">{'```\nconst result = true;\n```'}</MarkdownContent>,
    );

    expect(container.firstChild).toHaveClass('markdown-content--report');
    expect(container.querySelector('pre > code')).toHaveTextContent('const result = true;');
  });
});

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

  it('renders the supported Markdown elements with semantic HTML', () => {
    const markdown = `# 一级标题

## 二级标题

普通文本包含 **粗体**、*斜体*、~~删除线~~、\`行内代码\`和[链接](https://example.com)。

> 引用内容

- 无序项
  - 嵌套无序项

1. 有序项
   1. 嵌套有序项

- [x] 已完成
- [ ] 未完成

---

| 名称 | 状态 |
| --- | --- |
| Markdown | 正常 |

![示例图片](https://example.com/example.png "示例标题")

\`\`\`ts
const ok = true;
\`\`\``;

    const { container } = render(<MarkdownContent>{markdown}</MarkdownContent>);

    expect(screen.getByRole('heading', { level: 1, name: '一级标题' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: '二级标题' })).toBeInTheDocument();
    expect(container.querySelector('strong')).toHaveTextContent('粗体');
    expect(container.querySelector('em')).toHaveTextContent('斜体');
    expect(container.querySelector('del')).toHaveTextContent('删除线');
    expect(container.querySelector('blockquote')).toHaveTextContent('引用内容');
    expect(container.querySelector('ul > li > ul > li')).toHaveTextContent('嵌套无序项');
    expect(container.querySelector('ol > li > ol > li')).toHaveTextContent('嵌套有序项');
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    expect(container.querySelector('hr')).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '示例图片' })).toHaveAttribute('title', '示例标题');
    expect(container.querySelector('pre > code')).toHaveTextContent('const ok = true;');
  });
});

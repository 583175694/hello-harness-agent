import { Streamdown, type Components } from 'streamdown';
import { code } from '@streamdown/code';
import { mermaid } from '@streamdown/mermaid';
import { math } from '@streamdown/math';
import 'katex/dist/katex.min.css';

type MarkdownContentProps = {
  children: string;
  className?: string;
  variant?: 'chat' | 'report';
  isAnimating?: boolean;
};

const markdownComponents: Components = {
  // Keep the semantic elements used by the existing accessibility/tests while
  // letting Streamdown own parsing and incomplete-block handling.
  strong: ({ node: _node, ...props }) => {
    void _node;
    return <strong {...props} />;
  },
  em: ({ node: _node, ...props }) => {
    void _node;
    return <em {...props} />;
  },
  del: ({ node: _node, ...props }) => {
    void _node;
    return <del {...props} />;
  },
  code: ({ node, className, ...props }) => {
    // Streamdown's default code renderer intentionally drops the language
    // class in its minimal mode; preserve the existing `language-*` hook for
    // our syntax/code-block styles and consumers.
    const language =
      typeof node?.properties?.className === 'string'
        ? node.properties.className
        : Array.isArray(node?.properties?.className)
          ? node.properties.className.join(' ')
          : undefined;
    return <code {...props} className={className ?? language} />;
  },
  pre: ({ node: _node, children, ...props }) => {
    void _node;
    return <pre {...props}>{children}</pre>;
  },
  a: ({ node: _node, ...props }) => {
    void _node;
    return <a {...props} target="_blank" rel="noopener noreferrer" />;
  },
  table: ({ node: _node, ...props }) => {
    void _node;
    return (
      <div className="markdown-table-scroll" tabIndex={0}>
        <table {...props} />
      </div>
    );
  },
};

// 使用共享的消息和报告展示方式渲染不可信 Markdown。
export function MarkdownContent({
  children,
  className,
  variant = 'chat',
  isAnimating = false,
}: MarkdownContentProps) {
  const rootClassName = ['markdown-content', `markdown-content--${variant}`, className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={rootClassName}>
      <Streamdown
        mode="streaming"
        parseIncompleteMarkdown
        isAnimating={isAnimating}
        animated={isAnimating ? { animation: 'blurIn' } : false}
        caret="block"
        plugins={{ code, mermaid, math }}
        controls={false}
        components={markdownComponents}
        className="streamdown-markdown"
      >
        {children}
      </Streamdown>
    </div>
  );
}

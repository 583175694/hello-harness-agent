import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type MarkdownContentProps = {
  children: string;
  className?: string;
  variant?: 'chat' | 'report';
};

// 使用共享的消息和报告展示方式渲染不可信 Markdown。
export function MarkdownContent({ children, className, variant = 'chat' }: MarkdownContentProps) {
  const rootClassName = ['markdown-content', `markdown-content--${variant}`, className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={rootClassName}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
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
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

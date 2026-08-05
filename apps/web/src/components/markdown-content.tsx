import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type MarkdownContentProps = {
  children: string;
  className?: string;
};

// 使用共享的消息和报告展示方式渲染不可信 Markdown。
export function MarkdownContent({ children, className }: MarkdownContentProps) {
  return (
    <div className={className ? `markdown-content ${className}` : 'markdown-content'}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _node, ...props }) => {
            void _node;
            return <a {...props} target="_blank" rel="noopener noreferrer" />;
          },
          code: ({ node: _node, className: codeClassName, children: codeChildren, ...props }) => {
            void _node;
            const isInline = !codeClassName;
            return isInline ? (
              <code className="markdown-inline-code" {...props}>
                {codeChildren}
              </code>
            ) : (
              <code className={codeClassName} {...props}>
                {codeChildren}
              </code>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

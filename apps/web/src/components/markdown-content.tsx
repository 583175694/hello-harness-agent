import { useDeferredValue, useMemo } from 'react';
import { Streamdown, type Components } from 'streamdown';
import { createCodePlugin } from '@streamdown/code';
import { mermaid } from '@streamdown/mermaid';
import { math } from '@streamdown/math';
import 'katex/dist/katex.min.css';

import { useDocumentTheme } from '../theme';

type MarkdownContentProps = {
  children: string;
  className?: string;
  variant?: 'chat' | 'report' | 'user';
  isAnimating?: boolean;
};

const markdownComponents: Components = {
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

/** Shiki 双主题：高亮结果内嵌 light/dark CSS 变量，换肤不重跑 highlight。 */
const codePlugin = createCodePlugin({ themes: ['github-light', 'github-dark'] });

type MermaidTheme = 'light' | 'dark';

const mermaidThemeVariables = {
  light: {
    background: '#ffffff',
    primaryColor: '#efefec',
    primaryTextColor: '#171717',
    primaryBorderColor: '#dededb',
    lineColor: '#555551',
    secondaryColor: '#f7f7f5',
    secondaryTextColor: '#171717',
    secondaryBorderColor: '#dededb',
    tertiaryColor: '#f1f1ef',
    tertiaryTextColor: '#171717',
    tertiaryBorderColor: '#dededb',
    textColor: '#171717',
    nodeTextColor: '#171717',
    clusterBkg: '#f1f1ef',
    clusterBorder: '#dededb',
    edgeLabelBackground: '#ffffff',
  },
  dark: {
    background: '#181818',
    primaryColor: '#242424',
    primaryTextColor: '#d6d6d6',
    primaryBorderColor: '#383838',
    lineColor: '#a0a0a0',
    secondaryColor: '#1c1c1c',
    secondaryTextColor: '#d6d6d6',
    secondaryBorderColor: '#2b2b2b',
    tertiaryColor: '#202020',
    tertiaryTextColor: '#d6d6d6',
    tertiaryBorderColor: '#2b2b2b',
    textColor: '#d6d6d6',
    nodeTextColor: '#d6d6d6',
    clusterBkg: '#202020',
    clusterBorder: '#2b2b2b',
    edgeLabelBackground: '#181818',
  },
} as const;

const MERMAID_PATTERN = /```\s*mermaid|^\s*```mermaid/m;
const STABLE_MERMAID_THEME: MermaidTheme = 'light';

export function MarkdownContent({
  children,
  className,
  variant = 'chat',
  isAnimating = false,
}: MarkdownContentProps) {
  const documentTheme = useDocumentTheme();
  const deferredDocumentTheme = useDeferredValue(documentTheme);
  const hasMermaid = MERMAID_PATTERN.test(children);
  const mermaidTheme = hasMermaid ? deferredDocumentTheme : STABLE_MERMAID_THEME;

  const mermaidConfig = useMemo(
    () => ({
      theme: 'base' as const,
      fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
      fontSize: 14,
      themeVariables: mermaidThemeVariables[mermaidTheme],
    }),
    [mermaidTheme],
  );

  const rootClassName = ['markdown-content', `markdown-content--${variant}`, className]
    .filter(Boolean)
    .join(' ');

  if (variant === 'user') {
    return <div className={rootClassName}>{children}</div>;
  }

  return (
    <div className={rootClassName}>
      <Streamdown
        mode="streaming"
        parseIncompleteMarkdown
        isAnimating={isAnimating}
        plugins={{ code: codePlugin, mermaid, math }}
        mermaid={{ config: mermaidConfig }}
        controls={{
          mermaid: {
            fullscreen: true,
            download: true,
            copy: true,
            panZoom: false,
          },
        }}
        components={markdownComponents}
        className="streamdown-markdown"
      >
        {children}
      </Streamdown>
    </div>
  );
}

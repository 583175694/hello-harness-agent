import { useEffect, useMemo, useState } from 'react';
import { Streamdown, type Components } from 'streamdown';
import { createCodePlugin } from '@streamdown/code';
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
  // Keep the semantic tags required by the existing accessibility contract.
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
  // Streamdown owns code-block parsing, language handling, and rendering via
  // the @streamdown/code plugin.
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

// 亮色使用 GitHub Light，暗色使用 One Dark Pro，与应用主题保持一致。
const codePlugin = createCodePlugin({ themes: ['catppuccin-latte', 'one-dark-pro'] });

type MermaidTheme = 'light' | 'dark';

// Mermaid 会把主题色写入 SVG，不能直接使用 CSS var()；这里提供实际颜色值。
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

function useMermaidTheme(): MermaidTheme {
  const [theme, setTheme] = useState<MermaidTheme>(() =>
    document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
  );

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      setTheme(root.dataset.theme === 'dark' ? 'dark' : 'light');
    });
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  return theme;
}

// 使用共享的消息和报告展示方式渲染不可信 Markdown。
export function MarkdownContent({
  children,
  className,
  variant = 'chat',
  isAnimating = false,
}: MarkdownContentProps) {
  const theme = useMermaidTheme();
  const mermaidConfig = useMemo(
    () => ({
      theme: 'base' as const,
      fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
      fontSize: 14,
      themeVariables: mermaidThemeVariables[theme],
    }),
    [theme],
  );
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

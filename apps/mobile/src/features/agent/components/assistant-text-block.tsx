import { Text } from '@/components/ui/text';
import { MarkdownView } from '@/components/markdown-view';

function looksLikeMarkdown(content: string): boolean {
  return /^#{1,3}\s/m.test(content) || /\*\*.+\*\*/m.test(content) || /\[.+\]\(.+\)/m.test(content);
}

/** 对齐 Web `.markdown-content > :first-child { margin-top: 0 }`。 */
function leadingMarkdownHeadingLevel(content: string): number | undefined {
  const match = content.trimStart().match(/^(#{1,6})\s+/);
  const hashes = match?.[1];
  return hashes ? hashes.length : undefined;
}

type AssistantTextBlockProps = {
  content: string;
  /** 流式阶段用纯 Text，避免每 token 重跑 Markdown 解析。 */
  streaming?: boolean;
  onSourcePress?: (label: string) => void;
};

export function AssistantTextBlock({
  content,
  streaming = false,
  onSourcePress,
}: AssistantTextBlockProps) {
  if (!streaming && looksLikeMarkdown(content)) {
    return (
      <MarkdownView
        variant="chat"
        leadingHeadingLevel={leadingMarkdownHeadingLevel(content)}
        onSourcePress={onSourcePress}
      >
        {content}
      </MarkdownView>
    );
  }
  return (
    <Text variant="body-sm" className="leading-relaxed text-primary" selectable>
      {content}
    </Text>
  );
}

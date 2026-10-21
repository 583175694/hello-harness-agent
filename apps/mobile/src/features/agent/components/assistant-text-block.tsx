import { Text } from '@/components/ui/text';
import { MarkdownView } from '@/components/markdown-view';

function looksLikeMarkdown(content: string): boolean {
  return /^#{1,3}\s/m.test(content) || /\*\*.+\*\*/m.test(content) || /\[.+\]\(.+\)/m.test(content);
}

type AssistantTextBlockProps = {
  content: string;
  onSourcePress?: (label: string) => void;
};

export function AssistantTextBlock({ content, onSourcePress }: AssistantTextBlockProps) {
  if (looksLikeMarkdown(content)) {
    return <MarkdownView variant="chat">{content}</MarkdownView>;
  }
  return (
    <Text variant="body-sm" className="leading-relaxed text-primary" selectable>
      {content}
    </Text>
  );
}

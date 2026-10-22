import Markdown from 'react-native-markdown-display';
import { Linking, View, type ViewStyle } from 'react-native';
import { useThemeColors } from '@/lib/use-theme-colors';

type MarkdownViewProps = {
  children: string;
  variant?: 'chat' | 'report';
  /** 正文以 `#` 标题开头时，该级标题 `marginTop` 置 0（Web first-child 规则）。 */
  leadingHeadingLevel?: number;
  style?: ViewStyle;
  onSourcePress?: (label: string) => void;
};

/** 对齐 Web `styles/markdown.css` chat / report 的 `--markdown-flow-space`。 */
function markdownFlowSpace(variant: 'chat' | 'report'): number {
  return variant === 'report' ? 14 : 11;
}

export function MarkdownView({
  children,
  variant = 'chat',
  leadingHeadingLevel,
  style,
  onSourcePress,
}: MarkdownViewProps) {
  const theme = useThemeColors();
  const flow = markdownFlowSpace(variant);
  const fontSize = variant === 'report' ? 15 : 14;
  const lineHeight = 24;
  const headingTop = (level: number, defaultTop: number) =>
    leadingHeadingLevel === level ? 0 : defaultTop;

  return (
    <View style={style}>
      <Markdown
        onLinkPress={(url) => {
          if (url.startsWith('source:')) {
            onSourcePress?.(url.replace('source:', ''));
            return false;
          }
          void Linking.openURL(url);
          return false;
        }}
        style={{
          body: {
            color: theme.primary,
            fontSize,
            lineHeight,
          },
          link: { color: theme.link },
          heading1: {
            color: theme.primary,
            fontSize: 21,
            lineHeight: 30,
            marginTop: headingTop(1, 22),
            marginBottom: 10,
            fontWeight: '700',
          },
          heading2: {
            color: theme.primary,
            fontSize: 19,
            lineHeight: 28,
            marginTop: headingTop(2, 20),
            marginBottom: 9,
            fontWeight: '700',
          },
          heading3: {
            color: theme.primary,
            fontSize: 18,
            lineHeight: 26,
            marginTop: headingTop(3, 18),
            marginBottom: 8,
            fontWeight: '700',
          },
          heading4: {
            color: theme.primary,
            fontSize,
            lineHeight,
            marginTop: headingTop(4, 16),
            marginBottom: 7,
            fontWeight: '600',
          },
          heading5: {
            color: theme.muted,
            fontSize,
            lineHeight,
            marginTop: headingTop(5, 16),
            marginBottom: 7,
            fontWeight: '600',
          },
          heading6: {
            color: theme.muted,
            fontSize,
            lineHeight,
            marginTop: headingTop(6, 16),
            marginBottom: 7,
            fontWeight: '600',
          },
          paragraph: { marginTop: 0, marginBottom: flow },
          bullet_list: {
            marginTop: 7,
            marginBottom: flow,
          },
          ordered_list: {
            marginTop: 7,
            marginBottom: flow,
          },
          list_item: {
            marginBottom: 4,
          },
          blockquote: {
            marginTop: 12,
            marginBottom: flow,
            marginLeft: 0,
            paddingTop: 2,
            paddingBottom: 2,
            paddingLeft: 13,
            paddingRight: 0,
            borderLeftWidth: 2,
            borderLeftColor: theme.border,
            backgroundColor: 'transparent',
          },
          strong: { color: theme.primary, fontWeight: '600' },
          code_inline: {
            backgroundColor: theme.subtle,
            borderRadius: 4,
            paddingHorizontal: 4,
            color: theme.primary,
          },
          fence: {
            backgroundColor: theme.terminalBg,
            color: theme.terminalFg,
            borderRadius: 8,
            padding: 8,
            marginTop: 12,
            marginBottom: flow,
          },
          hr: {
            marginTop: 20,
            marginBottom: 20,
            backgroundColor: theme.border,
            height: 1,
          },
          table: {
            borderWidth: 1,
            borderColor: theme.border,
            borderRadius: 8,
            marginTop: 12,
            marginBottom: flow,
            overflow: 'hidden',
          },
          thead: {
            backgroundColor: theme.subtle,
          },
          th: {
            padding: 8,
            borderRightWidth: 1,
            borderColor: theme.border,
            color: theme.primary,
            fontWeight: '600',
          },
          tr: {
            borderBottomWidth: 1,
            borderColor: theme.border,
          },
          td: {
            padding: 8,
            borderRightWidth: 1,
            borderColor: theme.border,
            color: theme.secondary,
          },
        }}
      >
        {children}
      </Markdown>
    </View>
  );
}

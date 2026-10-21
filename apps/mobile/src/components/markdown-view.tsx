import Markdown from 'react-native-markdown-display';
import { Linking, View, type ViewStyle } from 'react-native';
import { useAppPreferences } from '@/providers/app-preferences-provider';

type MarkdownViewProps = {
  children: string;
  variant?: 'chat' | 'report';
  style?: ViewStyle;
  onSourcePress?: (label: string) => void;
};

export function MarkdownView({
  children,
  variant = 'chat',
  style,
  onSourcePress,
}: MarkdownViewProps) {
  const { resolvedColorScheme } = useAppPreferences();
  const isDark = resolvedColorScheme === 'dark';
  const textColor = isDark ? '#d8d8d8' : '#171717';
  const linkColor = isDark ? '#78a8c8' : '#3f5f78';

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
            color: textColor,
            fontSize: variant === 'report' ? 15 : 14,
            lineHeight: variant === 'report' ? 24 : 22,
          },
          link: { color: linkColor },
          heading1: { color: textColor, fontSize: 20, marginBottom: 8 },
          heading2: { color: textColor, fontSize: 17, marginBottom: 6 },
          code_inline: {
            backgroundColor: isDark ? '#2a2a2a' : '#f1f1ef',
            borderRadius: 4,
            paddingHorizontal: 4,
          },
          fence: {
            backgroundColor: '#0f1115',
            color: '#e5e7eb',
            borderRadius: 8,
            padding: 8,
          },
        }}
      >
        {children}
      </Markdown>
    </View>
  );
}

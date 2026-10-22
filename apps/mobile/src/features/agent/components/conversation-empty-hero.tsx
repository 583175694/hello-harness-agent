import { View } from 'react-native';
import { BrandIcon } from '@/components/ui/brand-icon';
import { Text } from '@/components/ui/text';
import { AGENT_UI_COPY } from '../config/ui.constants';

/** 对齐 Web `.conversation-empty-hero`（40px 品牌图 + 18px 欢迎语）。 */
export function ConversationEmptyHero() {
  return (
    <View className="max-w-full flex-row items-center justify-center gap-3.5 px-5">
      <BrandIcon size={40} accessibilityLabel="" />
      <Text
        variant="body"
        className="shrink font-medium text-primary"
        style={{ fontSize: 18, lineHeight: 24 }}
      >
        {AGENT_UI_COPY.newSessionWelcome}
      </Text>
    </View>
  );
}

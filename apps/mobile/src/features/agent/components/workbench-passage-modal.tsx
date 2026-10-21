import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/text';

type WorkbenchPassageModalProps = {
  visible: boolean;
  title: string;
  heading: string;
  body: string;
  onClose: () => void;
};

export function WorkbenchPassageModal({
  visible,
  title,
  heading,
  body,
  onClose,
}: WorkbenchPassageModalProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-overlay-scrim" onPress={onClose} />
      <View
        className="max-h-[55%] rounded-t-panel border-t border-border bg-surface"
        style={{ paddingBottom: Math.max(insets.bottom, 12) }}
      >
        <View className="items-center py-2">
          <View className="h-1 w-9 rounded-full bg-border" />
        </View>
        <Text variant="body-sm" className="px-4 font-semibold">
          {title}
        </Text>
        <Text variant="caption" className="px-4 pb-2 text-muted">
          {heading}
        </Text>
        <ScrollView className="px-4">
          <Text variant="body-sm" className="leading-relaxed text-primary">
            {body}
          </Text>
        </ScrollView>
        <Pressable
          onPress={onClose}
          className="mx-4 mt-3 items-center rounded-control bg-subtle py-2.5 active:bg-subtle-pressed"
        >
          <Text variant="body-sm" className="font-semibold">
            关闭
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}

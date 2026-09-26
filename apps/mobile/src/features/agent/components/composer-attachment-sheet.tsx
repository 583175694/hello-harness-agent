import { Modal, Pressable, View } from 'react-native';
import { FileText, ImageIcon } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/text';

type ComposerAttachmentSheetProps = {
  visible: boolean;
  onClose: () => void;
  onPickImages?: () => void;
  onPickFiles?: () => void;
};

export function ComposerAttachmentSheet({
  visible,
  onClose,
  onPickImages,
  onPickFiles,
}: ComposerAttachmentSheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/40">
        <Pressable className="absolute inset-0" onPress={onClose} accessibilityLabel="关闭" />
        <View
          className="overflow-hidden rounded-t-[20px] bg-surface"
          style={{ paddingBottom: Math.max(insets.bottom, 12) }}
        >
          <View className="items-center py-2.5">
            <View className="h-1 w-9 rounded-full bg-border" />
          </View>
          <Text variant="caption" className="px-4 pb-2 text-center text-muted">
            添加附件
          </Text>

          <Pressable
            className="min-h-[52px] flex-row items-center gap-3 border-b border-composer-border px-5 active:bg-subtle"
            onPress={() => {
              onPickImages?.();
              onClose();
            }}
          >
            <View className="h-9 w-9 items-center justify-center rounded-full bg-subtle">
              <ImageIcon size={20} color="#171717" />
            </View>
            <View>
              <Text variant="body" className="font-medium">
                照片与图片
              </Text>
              <Text variant="caption" className="text-muted">
                从相册选择 PNG、JPEG、WebP
              </Text>
            </View>
          </Pressable>

          <Pressable
            className="min-h-[52px] flex-row items-center gap-3 px-5 active:bg-subtle"
            onPress={() => {
              onPickFiles?.();
              onClose();
            }}
          >
            <View className="h-9 w-9 items-center justify-center rounded-full bg-subtle">
              <FileText size={20} color="#171717" />
            </View>
            <View>
              <Text variant="body" className="font-medium">
                文件
              </Text>
              <Text variant="caption" className="text-muted">
                文档、PDF、表格等
              </Text>
            </View>
          </Pressable>

          <View className="mt-2 px-4">
            <Pressable
              className="min-h-11 items-center justify-center rounded-xl bg-subtle active:bg-[#e8e8e5]"
              onPress={onClose}
            >
              <Text variant="body" className="font-semibold text-primary">
                取消
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

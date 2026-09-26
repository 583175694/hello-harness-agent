import { Image, Pressable, ScrollView, View } from 'react-native';
import { CircleAlert, LoaderCircle, X } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import type { ComposerAttachmentFixture } from '../fixtures/ui-fixtures';

type ComposerAttachmentsProps = {
  items: ComposerAttachmentFixture[];
};

function fileExtension(fileName: string): string {
  return (fileName.split('.').pop() ?? 'FILE').toUpperCase();
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function ComposerAttachments({ items }: ComposerAttachmentsProps) {
  if (items.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-2 px-0.5 py-0.5"
      className="max-h-24"
    >
      {items.map((item) => (
        <View
          key={item.id}
          className="relative overflow-hidden rounded-control border border-composer-border bg-canvas"
        >
          {item.kind === 'image' ? (
            <View className="h-16 w-16 items-center justify-center bg-subtle">
              {item.previewUri ? (
                <Image source={{ uri: item.previewUri }} className="h-full w-full" resizeMode="cover" />
              ) : (
                <Text variant="caption" className="text-muted">
                  IMG
                </Text>
              )}
            </View>
          ) : (
            <View className="h-16 min-w-[140px] max-w-[180px] flex-row items-center gap-2 px-2.5">
              <View className="h-9 w-9 items-center justify-center rounded-md bg-subtle">
                {item.status === 'processing' ? (
                  <LoaderCircle size={16} color="#555551" />
                ) : item.status === 'failed' ? (
                  <CircleAlert size={16} color="#984b41" />
                ) : (
                  <Text variant="caption" className="font-mono font-semibold text-secondary">
                    {fileExtension(item.fileName)}
                  </Text>
                )}
              </View>
              <View className="min-w-0 flex-1">
                <Text variant="caption" className="font-medium text-primary" numberOfLines={1}>
                  {item.fileName}
                </Text>
                <Text variant="caption" className="text-muted">
                  {formatFileSize(item.size)}
                </Text>
              </View>
            </View>
          )}
          <Pressable
            className="absolute right-0.5 top-0.5 h-6 w-6 items-center justify-center rounded-full bg-surface/95 active:bg-subtle"
            accessibilityLabel={`移除${item.fileName}`}
          >
            <X size={12} color="#555551" />
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

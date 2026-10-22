import { Image, Pressable, ScrollView, View } from 'react-native';
import { CircleAlert, X } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { SpinnerIcon } from '@/components/ui/spinner-icon';
import { Text } from '@/components/ui/text';
import {
  fileCardIconColors,
  fileExtensionLabel,
  formatFileSize,
  splitFileName,
} from '@/lib/file-display';
import type { ComposerAttachmentFixture } from '../fixtures/ui-fixtures';

type ComposerAttachmentsProps = {
  items: ComposerAttachmentFixture[];
  onRemove?: (id: string) => void;
  onRetry?: (id: string) => void;
};

export function ComposerAttachments({ items, onRemove, onRetry }: ComposerAttachmentsProps) {
  if (items.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-2 px-0.5 py-0.5"
      className="max-h-24"
    >
      {items.map((item) => (
        <Pressable
          key={item.id}
          disabled={item.status !== 'failed' || !onRetry}
          onPress={() => onRetry?.(item.id)}
          className="relative overflow-hidden rounded-attachment border border-composer-border bg-canvas"
          accessibilityLabel={
            item.status === 'failed' ? `重试上传 ${item.fileName}` : item.fileName
          }
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
            <View className="h-[72px] w-[268px] max-w-[268px] flex-row items-center gap-2.5 bg-subtle px-3">
              {(() => {
                const ext = fileExtensionLabel(item.fileName);
                const iconColors = fileCardIconColors(ext);
                const { prefix, suffix } = splitFileName(item.fileName);
                return (
                  <>
                    <View
                      className="h-10 w-10 items-center justify-center rounded"
                      style={{ backgroundColor: iconColors.backgroundColor }}
                    >
                      {item.status === 'processing' ? (
                        <SpinnerIcon tone="primary" size={16} />
                      ) : item.status === 'failed' ? (
                        <Icon icon={CircleAlert} tone="primary" size={16} />
                      ) : (
                        <Text
                          variant="caption"
                          fixedSize
                          className="font-bold"
                          style={{ fontSize: 10, color: iconColors.labelColor }}
                        >
                          {ext}
                        </Text>
                      )}
                    </View>
                    <View className="min-w-0 flex-1 gap-1">
                      <View className="max-w-full flex-row items-center">
                        <Text
                          variant="body-sm"
                          className="min-w-0 shrink font-semibold text-primary"
                          numberOfLines={1}
                          ellipsizeMode="middle"
                        >
                          {prefix}
                        </Text>
                        {suffix ? (
                          <Text variant="body-sm" className="shrink-0 font-semibold text-primary">
                            {suffix}
                          </Text>
                        ) : null}
                      </View>
                      <Text variant="caption" className="text-muted">
                        {formatFileSize(item.size)}
                      </Text>
                    </View>
                  </>
                );
              })()}
            </View>
          )}
          {item.status === 'failed' ? (
            <View className="absolute inset-0 items-center justify-center bg-surface/80">
              <Text variant="caption" className="font-medium text-rejection-text">
                点击重试
              </Text>
            </View>
          ) : null}
          <Pressable
            onPress={() => onRemove?.(item.id)}
            className="absolute right-0.5 top-0.5 h-6 w-6 items-center justify-center rounded-full bg-surface/95 active:bg-subtle"
            accessibilityLabel={`移除${item.fileName}`}
          >
            <Icon icon={X} tone="secondary" size={14} />
          </Pressable>
        </Pressable>
      ))}
    </ScrollView>
  );
}

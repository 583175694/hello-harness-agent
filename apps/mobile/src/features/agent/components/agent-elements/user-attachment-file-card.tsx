import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import {
  fileCardIconColors,
  fileExtensionLabel,
  formatFileSize,
  splitFileName,
} from '@/lib/file-display';

type UserAttachmentFileCardProps = {
  fileName: string;
  size: number;
  disabled?: boolean;
  onPress?: () => void;
};

/** 对齐 Web `.user-attachment-document` + `.file-card-icon`。 */
export function UserAttachmentFileCard({
  fileName,
  size,
  disabled = false,
  onPress,
}: UserAttachmentFileCardProps) {
  const ext = fileExtensionLabel(fileName);
  const { prefix, suffix } = splitFileName(fileName);
  const iconColors = fileCardIconColors(ext);

  const content = (
    <>
      <View
        className="relative h-10 w-10 items-center justify-center overflow-hidden rounded"
        style={{ backgroundColor: iconColors.backgroundColor }}
      >
        <Text
          variant="caption"
          fixedSize
          className="font-bold"
          style={{ fontSize: 10, lineHeight: 12, color: iconColors.labelColor }}
        >
          {ext}
        </Text>
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
          {formatFileSize(size)}
        </Text>
      </View>
    </>
  );

  if (!onPress) {
    return (
      <View className="min-h-[72px] w-[268px] max-w-full flex-row items-center gap-2.5 rounded-[10px] border border-composer-border bg-subtle px-3 py-3">
        {content}
      </View>
    );
  }

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`预览 ${fileName}`}
      className="min-h-[72px] w-[268px] max-w-full flex-row items-center gap-2.5 rounded-[10px] border border-composer-border bg-subtle px-3 py-3 active:bg-surface-hover"
      style={disabled ? { opacity: 0.72 } : undefined}
    >
      {content}
    </Pressable>
  );
}

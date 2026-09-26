import { Pressable, View } from 'react-native';
import { FileText } from 'lucide-react-native';
import { Text } from '@/components/ui/text';

type ArtifactConversationCardProps = {
  fileName: string;
  versionNumber?: number;
  fileKind?: string;
  onPress?: () => void;
};

export function ArtifactConversationCard({
  fileName,
  versionNumber,
  fileKind = 'text',
  onPress,
}: ArtifactConversationCardProps) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-xl border border-composer-border bg-surface px-3 py-2.5 active:bg-subtle"
    >
      <View className="h-9 w-9 items-center justify-center rounded-lg bg-subtle">
        <FileText size={18} color="#555551" />
      </View>
      <View className="min-w-0 flex-1">
        <Text variant="body-sm" className="truncate font-medium text-primary">
          {fileName}
        </Text>
        <Text variant="caption" className="text-muted">
          {fileKind}
          {versionNumber != null ? ` · v${versionNumber}` : ''}
        </Text>
      </View>
    </Pressable>
  );
}

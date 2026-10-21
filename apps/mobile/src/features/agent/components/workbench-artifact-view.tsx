import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useRouter } from 'expo-router';
import type { LucideIcon } from 'lucide-react-native';
import { Download, Edit3, Eye } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/cn';
import { AGENT_UI_BUTTON } from '../config/ui.constants';
import { artifactsFixture, type ArtifactFixture } from '../fixtures/ui-fixtures';

const { classNames: btn } = AGENT_UI_BUTTON;

type WorkbenchArtifactBodyProps = {
  bottomInset?: number;
  useBottomSheetScroll?: boolean;
};

function ArtifactListRow({
  artifact,
  selected,
  showDivider,
  onPress,
}: {
  artifact: ArtifactFixture;
  selected: boolean;
  showDivider: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={cn(
        'min-h-[50px] flex-row items-center gap-2 px-3.5 py-2.5 active:bg-subtle',
        selected && 'bg-subtle',
        showDivider && 'border-b border-composer-border',
      )}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={artifact.name}
    >
      <View className="min-w-0 flex-1 gap-0.5">
        <View className="flex-row items-baseline gap-1.5">
          <Text variant="body-sm" className="min-w-0 flex-1 font-normal text-primary" numberOfLines={1}>
            {artifact.name}
          </Text>
          <Text variant="caption" className="font-mono text-muted">
            {artifact.version}
          </Text>
        </View>
        <Text variant="caption" className="text-muted" numberOfLines={1}>
          {artifact.description}
        </Text>
      </View>
    </Pressable>
  );
}

type ArtifactTabActionProps = {
  label: string;
  accessibilityLabel?: string;
  icon: LucideIcon;
  variant: 'ghost' | 'primary';
  onPress: () => void;
};

function ArtifactTabAction({
  label,
  accessibilityLabel,
  icon,
  variant,
  onPress,
}: ArtifactTabActionProps) {
  const isPrimary = variant === 'primary';
  const body = (
    <>
      <Icon icon={icon} tone={isPrimary ? 'onPrimary' : 'secondary'} size={16} strokeWidth={2} />
      <Text
        variant="caption"
        className={cn('font-medium', isPrimary ? 'text-primary-foreground' : 'text-primary')}
        numberOfLines={1}
      >
        {label}
      </Text>
    </>
  );

  if (isPrimary) {
    return (
      <PressableScale
        onPress={onPress}
        className={cn('min-h-10 min-w-0 flex-1 flex-row items-center justify-center gap-1.5 rounded-control px-2', btn.primaryCta)}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
      >
        {body}
      </PressableScale>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      className={cn(
        'min-h-10 min-w-0 flex-1 flex-row items-center justify-center gap-1.5 rounded-control border border-border px-2 active:bg-subtle',
      )}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
    >
      {body}
    </Pressable>
  );
}

function WorkbenchArtifactActionBar({
  artifact,
  bottomInset = 0,
}: {
  artifact: ArtifactFixture;
  bottomInset?: number;
}) {
  const router = useRouter();

  return (
    <View
      className="border-t border-composer-border bg-surface px-3 pt-2"
      style={{ paddingBottom: Math.max(bottomInset, 12) }}
    >
      <View className="flex-row gap-2">
        <ArtifactTabAction
          label="预览"
          icon={Eye}
          variant="ghost"
          onPress={() =>
            router.push({
              pathname: '/reader/preview',
              params: { name: artifact.name, kind: 'text' },
            })
          }
        />
        <ArtifactTabAction label="下载" icon={Download} variant="ghost" onPress={() => undefined} />
        <ArtifactTabAction
          label="修改"
          accessibilityLabel="基于此版本修改"
          icon={Edit3}
          variant="primary"
          onPress={() => undefined}
        />
      </View>
    </View>
  );
}

function ArtifactFileList({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <View className="gap-2">
      <Text variant="caption" className="px-0.5 font-medium text-muted">
        产物文件
      </Text>
      <View className="overflow-hidden rounded-[14px] border border-composer-border bg-surface">
        {artifactsFixture.map((artifact, index) => (
          <ArtifactListRow
            key={artifact.id}
            artifact={artifact}
            selected={selectedId === artifact.id}
            showDivider={index < artifactsFixture.length - 1}
            onPress={() => onSelect(artifact.id)}
          />
        ))}
      </View>
    </View>
  );
}

export function WorkbenchArtifactBody({
  bottomInset = 0,
  useBottomSheetScroll = false,
}: WorkbenchArtifactBodyProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => artifactsFixture.find((item) => item.id === selectedId),
    [selectedId],
  );

  const list = <ArtifactFileList selectedId={selectedId} onSelect={setSelectedId} />;

  return (
    <View className="flex-1">
      {useBottomSheetScroll ? (
        <BottomSheetScrollView
          style={{ flex: 1 }}
          contentContainerClassName="px-4 pb-4 pt-1"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          overScrollMode="never"
        >
          {list}
        </BottomSheetScrollView>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerClassName="px-4 pb-4 pt-1"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {list}
        </ScrollView>
      )}
      {selected ? <WorkbenchArtifactActionBar artifact={selected} bottomInset={bottomInset} /> : null}
    </View>
  );
}

export function WorkbenchArtifactView() {
  return <WorkbenchArtifactBody bottomInset={0} />;
}

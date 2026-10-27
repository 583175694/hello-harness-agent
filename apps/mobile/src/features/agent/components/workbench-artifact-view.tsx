import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { showAppAlert } from '@/lib/app-alert';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useRouter } from 'expo-router';
import type { LucideIcon } from 'lucide-react-native';
import { Download, Edit3, Eye, RotateCcw } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/cn';
import { AGENT_UI_BUTTON } from '../config/ui.constants';
import type { ArtifactRef } from '@harness/agent-protocol';
import { artifactsFixture, type ArtifactFixture } from '../fixtures/ui-fixtures';
import { listWorkbenchArtifacts } from '../model/list-workbench-artifacts';
import type { WorkbenchState } from '@harness/agent-ui-types';
import { useAgentHostSession } from '../hooks/use-agent-host';
import { useWorkbenchReport } from '../hooks/use-workbench-report';
import { openArtifactDownload } from '@/lib/artifact-actions';
import { MarkdownView } from '@/components/markdown-view';

const { classNames: btn } = AGENT_UI_BUTTON;

type WorkbenchArtifactBodyProps = {
  bottomInset?: number;
  useBottomSheetScroll?: boolean;
  workbench?: WorkbenchState;
  focusArtifactId?: string | null;
  /** UI Catalog / Preview 专用，生产路径不得传入 */
  previewArtifactRows?: ArtifactFixture[];
};

function artifactRowFromRef(artifact: ArtifactRef): ArtifactFixture {
  const version =
    artifact.versionNumber !== undefined ? `v${artifact.versionNumber}` : 'v1';
  return {
    id: artifact.artifactId,
    name: artifact.logicalName ?? artifact.fileName,
    version,
    description: artifact.changeSummary ?? artifact.mediaType,
  };
}

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
  artifactRef,
  workbench,
  bottomInset = 0,
}: {
  artifact: ArtifactFixture;
  artifactRef?: ArtifactRef;
  workbench?: WorkbenchState;
  bottomInset?: number;
}) {
  const router = useRouter();
  const session = useAgentHostSession();
  const productionArtifactId = artifactRef?.artifactId;
  const currentArtifactId =
    artifactRef?.seriesId &&
    workbench?.artifactSeries?.find((series) => series.seriesId === artifactRef.seriesId)
      ?.currentArtifactId;
  const canRestore = Boolean(
    artifactRef &&
      currentArtifactId &&
      currentArtifactId !== artifactRef.artifactId,
  );

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
              params: productionArtifactId
                ? {
                    artifactId: productionArtifactId,
                    name: artifact.name,
                    kind: artifactRef?.fileKind ?? 'text',
                  }
                : { name: artifact.name, kind: 'text' },
            })
          }
        />
        <ArtifactTabAction
          label="下载"
          icon={Download}
          variant="ghost"
          onPress={() => {
            if (!productionArtifactId) return;
            void openArtifactDownload(session.client, productionArtifactId);
          }}
        />
        {canRestore ? (
          <ArtifactTabAction
            label="恢复"
            accessibilityLabel="恢复为此版本"
            icon={RotateCcw}
            variant="ghost"
            onPress={() => {
              if (!artifactRef) return;
              showAppAlert({
                title: '恢复此版本？',
                message: '将把系列当前版本指回所选版本，后续修改将基于该版本继续。',
                buttons: [
                  { text: '取消', style: 'cancel' },
                  {
                    text: '恢复',
                    onPress: () => void session.restoreArtifactVersion(artifactRef),
                  },
                ],
              });
            }}
          />
        ) : null}
        <ArtifactTabAction
          label="修改"
          accessibilityLabel="基于此版本修改"
          icon={Edit3}
          variant="primary"
          onPress={() => {
            if (!artifactRef) return;
            session.beginArtifactRevision(artifactRef);
          }}
        />
      </View>
    </View>
  );
}

function WorkbenchInlineReport({
  workbench,
  reportId,
}: {
  workbench?: WorkbenchState;
  reportId?: string;
}) {
  const router = useRouter();
  const fetched = useWorkbenchReport(reportId);
  const staticReport = workbench?.report;
  if (!reportId && !staticReport) return null;

  const title =
    fetched.status === 'ready'
      ? fetched.report.title
      : (staticReport?.title ?? '报告');
  const updated =
    fetched.status === 'ready'
      ? new Date(fetched.report.updatedAt).toLocaleString('zh-CN')
      : staticReport?.updated;
  const summary = fetched.status === 'ready' ? fetched.report.summary : undefined;
  const staticMarkdown =
    typeof staticReport?.content === 'string' ? staticReport.content : null;
  const markdown =
    fetched.status === 'ready' ? fetched.markdown : staticMarkdown;

  return (
    <View className="mb-4 gap-2 rounded-sheet border border-composer-border bg-surface p-3">
      <View className="flex-row items-baseline justify-between gap-2">
        <Text variant="body-sm" className="min-w-0 flex-1 font-semibold" numberOfLines={2}>
          {title}
        </Text>
        {updated ? (
          <Text variant="caption" className="text-muted">
            {updated}
          </Text>
        ) : null}
      </View>
      {summary ? (
        <Text variant="caption" className="text-muted">
          {summary}
        </Text>
      ) : null}
      {fetched.status === 'loading' ? (
        <View className="items-center py-4">
          <ActivityIndicator />
        </View>
      ) : null}
      {fetched.status === 'error' ? (
        <Text variant="caption" className="text-destructive">
          {fetched.message}
        </Text>
      ) : null}
      {markdown ? (
        <MarkdownView variant="report">{markdown}</MarkdownView>
      ) : fetched.status !== 'loading' ? (
        <Text variant="caption" className="text-muted">
          报告正文暂不可用
        </Text>
      ) : null}
      {fetched.status === 'ready' ? (
        <Pressable
          onPress={() =>
            router.push({
              pathname: '/reader/preview',
              params: {
                artifactId: fetched.report.artifactId,
                name: title,
                kind: 'markdown',
              },
            })
          }
          className="self-start active:opacity-70"
        >
          <Text variant="caption" className="text-link">
            全屏阅读
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ArtifactFileList({
  artifacts,
  selectedId,
  onSelect,
}: {
  artifacts: ArtifactFixture[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (!artifacts.length) {
    return (
      <View className="items-center py-10">
        <Text variant="body-sm" className="text-muted">
          暂无产物文件
        </Text>
      </View>
    );
  }

  return (
    <View className="gap-2">
      <Text variant="caption" className="px-0.5 font-medium text-muted">
        产物文件
      </Text>
      <View className="overflow-hidden rounded-sheet border border-composer-border bg-surface">
        {artifacts.map((artifact, index) => (
          <ArtifactListRow
            key={artifact.id}
            artifact={artifact}
            selected={selectedId === artifact.id}
            showDivider={index < artifacts.length - 1}
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
  workbench,
  focusArtifactId,
  previewArtifactRows,
  reportId,
}: WorkbenchArtifactBodyProps & { reportId?: string }) {
  const liveArtifacts = useMemo(
    () => (workbench ? listWorkbenchArtifacts(workbench) : []),
    [workbench],
  );

  const artifactById = useMemo(() => {
    const map = new Map<string, ArtifactRef>();
    for (const artifact of liveArtifacts) {
      map.set(artifact.artifactId, artifact);
    }
    return map;
  }, [liveArtifacts]);

  const artifactRows = useMemo(() => {
    if (previewArtifactRows?.length) return previewArtifactRows;
    if (!workbench) return [];
    return liveArtifacts.map(artifactRowFromRef);
  }, [previewArtifactRows, workbench, liveArtifacts]);

  const initialSelected = focusArtifactId ?? artifactRows[0]?.id ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(initialSelected);

  useEffect(() => {
    if (focusArtifactId && artifactRows.some((row) => row.id === focusArtifactId)) {
      setSelectedId(focusArtifactId);
    }
  }, [focusArtifactId, artifactRows]);

  const selected = useMemo(
    () => artifactRows.find((item) => item.id === selectedId),
    [artifactRows, selectedId],
  );

  const list = (
    <>
      <WorkbenchInlineReport workbench={workbench} reportId={reportId} />
      <ArtifactFileList artifacts={artifactRows} selectedId={selectedId} onSelect={setSelectedId} />
    </>
  );

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
      {selected ? (
        <WorkbenchArtifactActionBar
          artifact={selected}
          artifactRef={artifactById.get(selected.id)}
          workbench={workbench}
          bottomInset={bottomInset}
        />
      ) : null}
    </View>
  );
}

export function WorkbenchArtifactView() {
  return <WorkbenchArtifactBody bottomInset={0} previewArtifactRows={artifactsFixture} />;
}

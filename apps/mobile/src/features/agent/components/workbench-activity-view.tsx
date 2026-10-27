import { Pressable, ScrollView, View } from 'react-native';
import type { SourceView, ToolCallView, WorkbenchState } from '@harness/agent-ui-types';
import { Text } from '@/components/ui/text';
import { sourcesFixture, toolActivitiesFixture } from '../fixtures/ui-fixtures';
import { resolveFocusedToolCallId } from '../model/workbench-focus';
import { BashTerminalView } from './bash-terminal-view';
import { WorkbenchSourceCard, WorkbenchSourcesStatsHeader } from './workbench-sources-view';

export type WorkbenchActivityEmphasis = 'default' | 'sources';

export type WorkbenchOpenRequest = {
  view?: 'activity' | 'artifact';
  toolCallId?: string;
  artifactId?: string;
  /** 对话内 [Sx] 等入口：优先聚焦 web 工具并展示关联来源 */
  emphasis?: WorkbenchActivityEmphasis;
};

type WorkbenchActivityContentProps = {
  emphasis?: WorkbenchActivityEmphasis;
  workbench?: WorkbenchState;
  selectedToolCallId?: string | null;
  onSelectToolCall?: (toolCallId: string) => void;
  /** Preview / UI Catalog：无 workbench 时展示 fixture */
  usePreviewFixtures?: boolean;
};

function WorkbenchActivityEmpty() {
  return (
    <View className="items-center px-4 py-12">
      <Text variant="body-sm" className="text-center font-medium text-primary">
        暂无过程记录
      </Text>
      <Text variant="caption" className="mt-2 text-center text-muted">
        助手的检索、读取与命令执行会显示在这里。
      </Text>
    </View>
  );
}

function terminalLines(tool: ToolCallView): string[] {
  const rendered = tool.terminal?.renderedOutput?.trim();
  if (rendered) {
    return rendered.split('\n').slice(0, 80);
  }
  const chunks = [tool.outputSummary, tool.detail, tool.outputPreview].filter(Boolean);
  if (!chunks.length) return ['（暂无输出）'];
  return chunks.join('\n\n').split('\n').slice(0, 40);
}

function relatedSourcesForTool(sources: SourceView[], tool: ToolCallView): SourceView[] {
  const scoped = sources.filter((source) => source.toolCallIds?.includes(tool.toolCallId));
  return scoped.length ? scoped : sources;
}

function isWebResearchTool(tool: ToolCallView): boolean {
  return tool.toolName === 'web_search' || tool.toolName === 'web_fetch';
}

function ExecutionDetail({
  tool,
  relatedSources,
}: {
  tool: ToolCallView;
  relatedSources: SourceView[];
}) {
  if (tool.terminal) {
    const cmd = tool.terminal.workdir
      ? `$ cd ${tool.terminal.workdir} && ${tool.terminal.command}`
      : `$ ${tool.terminal.command}`;
    return (
      <>
        <BashTerminalView
          title={tool.terminal.description || tool.title}
          durationLabel={tool.elapsed}
          commandLine={cmd}
          outputLines={terminalLines(tool)}
        />
        {relatedSources.length > 0 && isWebResearchTool(tool) ? (
          <View className="border-t border-composer-border px-4 pb-3 pt-2">
            <WorkbenchSourcesStatsHeader sources={relatedSources} />
            {relatedSources.map((source) => (
              <WorkbenchSourceCard key={source.id} source={source} />
            ))}
          </View>
        ) : null}
      </>
    );
  }

  if (isWebResearchTool(tool) && relatedSources.length > 0) {
    return (
      <View className="border-b border-composer-border px-4 pb-3 pt-2">
        <Text variant="body-sm" className="mb-2 font-semibold text-primary">
          {tool.title}
        </Text>
        <WorkbenchSourcesStatsHeader sources={relatedSources} />
        {relatedSources.map((source) => (
          <WorkbenchSourceCard key={source.id} source={source} />
        ))}
      </View>
    );
  }

  return (
    <View className="gap-2 border-b border-composer-border px-4 py-3">
      <Text variant="body-sm" className="font-semibold text-primary">
        {tool.title}
      </Text>
      {tool.inputSummary ? (
        <Text variant="caption" className="font-mono text-muted">
          {tool.inputSummary}
        </Text>
      ) : null}
      {tool.outputSummary || tool.outputPreview ? (
        <Text variant="body-sm" className="text-secondary">
          {tool.outputSummary ?? tool.outputPreview}
        </Text>
      ) : (
        <Text variant="caption" className="text-muted">
          {tool.detail || '执行中…'}
        </Text>
      )}
    </View>
  );
}

function ExecutionTimelineRow({
  tool,
  selected,
  onPress,
}: {
  tool: ToolCallView;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={
        selected
          ? 'rounded-lg border border-primary bg-subtle px-3 py-2'
          : 'rounded-lg border border-composer-border bg-surface px-3 py-2'
      }
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Text variant="mono" className="font-medium">
        {tool.toolName}
      </Text>
      <Text variant="caption" className="font-mono text-muted" numberOfLines={2}>
        {tool.inputSummary || tool.title}
        {tool.elapsed ? ` · ${tool.elapsed}` : ''}
      </Text>
    </Pressable>
  );
}

function LiveWorkbenchActivity({
  workbench,
  emphasis,
  selectedToolCallId,
  onSelectToolCall,
}: Required<Pick<WorkbenchActivityContentProps, 'workbench'>> &
  Pick<WorkbenchActivityContentProps, 'emphasis' | 'selectedToolCallId' | 'onSelectToolCall'>) {
  const executions = workbench.executions ?? [];
  const sources = workbench.sources ?? [];

  if (!executions.length) {
    if (sources.length > 0) {
      return (
        <View className="px-4 pb-3">
          <WorkbenchSourcesStatsHeader sources={sources} />
          {sources.map((source) => (
            <WorkbenchSourceCard key={source.id} source={source} />
          ))}
        </View>
      );
    }
    return <WorkbenchActivityEmpty />;
  }

  let focusedId = resolveFocusedToolCallId(
    executions,
    workbench.focusTarget,
    workbench.artifacts,
    selectedToolCallId,
  );

  if (emphasis === 'sources' && !selectedToolCallId) {
    const webTool = executions.find(isWebResearchTool);
    if (webTool) focusedId = webTool.toolCallId;
  }

  const selected =
    executions.find((tool) => tool.toolCallId === focusedId) ?? executions.at(-1);
  if (!selected) {
    return <WorkbenchActivityEmpty />;
  }

  const relatedSources = relatedSourcesForTool(sources, selected);

  return (
    <>
      <ExecutionDetail tool={selected} relatedSources={relatedSources} />
      <View className="gap-2 p-3">
        <View className="px-1">
          <Text variant="caption" className="font-semibold uppercase tracking-wide text-muted">
            {workbench.title}
          </Text>
          {workbench.subtitle ? (
            <Text variant="caption" className="text-muted">
              {workbench.subtitle}
            </Text>
          ) : null}
        </View>
        <Text variant="caption" className="mb-1 px-1 font-semibold uppercase tracking-wide text-muted">
          调用时间线
        </Text>
        {executions.map((tool) => (
          <ExecutionTimelineRow
            key={tool.toolCallId}
            tool={tool}
            selected={tool.toolCallId === selected.toolCallId}
            onPress={() => onSelectToolCall?.(tool.toolCallId)}
          />
        ))}
      </View>
    </>
  );
}

function PreviewFixtureWorkbenchActivity({ emphasis }: { emphasis?: WorkbenchActivityEmphasis }) {
  if (emphasis === 'sources') {
    return (
      <View className="px-4 pb-3">
        <WorkbenchSourcesStatsHeader sources={[]} fixtureFallback />
        {sourcesFixture.map((source) => (
          <WorkbenchSourceCard key={source.id} fixture={source} />
        ))}
      </View>
    );
  }

  const selected = toolActivitiesFixture[1];

  return (
    <>
      <BashTerminalView
        title="bash — pytest tests/test_auth_2fa.py"
        durationLabel="284ms"
        commandLine="$ pytest tests/test_auth_2fa.py -v --tb=short"
        outputLines={[
          '============================= test session starts ==============================',
          'tests/test_auth_2fa.py::test_totp_verification_success PASSED',
        ]}
      />
      <View className="gap-2 p-3">
        <Text variant="caption" className="mb-1 font-semibold uppercase tracking-wide text-muted">
          调用时间线
        </Text>
        {toolActivitiesFixture.map((item) => {
          const isSelected = item.id === selected?.id;
          return (
            <View
              key={item.id}
              className={
                isSelected
                  ? 'rounded-lg border border-primary bg-subtle px-3 py-2'
                  : 'rounded-lg border border-composer-border bg-surface px-3 py-2'
              }
            >
              <Text variant="mono" className="font-medium">
                {item.name}
              </Text>
              <Text variant="caption" className="font-mono text-muted">
                {item.summary}
              </Text>
            </View>
          );
        })}
      </View>
    </>
  );
}

export function WorkbenchActivityContent({
  emphasis = 'default',
  workbench,
  selectedToolCallId,
  onSelectToolCall,
  usePreviewFixtures = false,
}: WorkbenchActivityContentProps) {
  if (workbench) {
    return (
      <LiveWorkbenchActivity
        workbench={workbench}
        emphasis={emphasis}
        selectedToolCallId={selectedToolCallId}
        onSelectToolCall={onSelectToolCall}
      />
    );
  }

  if (usePreviewFixtures) {
    return <PreviewFixtureWorkbenchActivity emphasis={emphasis} />;
  }

  if (emphasis === 'sources') {
    return <WorkbenchActivityEmpty />;
  }

  return <WorkbenchActivityEmpty />;
}

export function WorkbenchActivityView(
  props: WorkbenchActivityContentProps & { usePreviewFixtures?: boolean },
) {
  return (
    <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
      <WorkbenchActivityContent {...props} usePreviewFixtures={props.usePreviewFixtures ?? true} />
    </ScrollView>
  );
}

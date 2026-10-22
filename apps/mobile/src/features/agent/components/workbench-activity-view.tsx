import { Pressable, ScrollView, View } from 'react-native';
import type { ToolCallView, WorkbenchState } from '@harness/agent-ui-types';
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
  /** 对话内 [Sx] 等入口打开时优先展示来源区块 */
  emphasis?: WorkbenchActivityEmphasis;
};

type WorkbenchActivityContentProps = {
  emphasis?: WorkbenchActivityEmphasis;
  workbench?: WorkbenchState;
  selectedToolCallId?: string | null;
  onSelectToolCall?: (toolCallId: string) => void;
};

function WorkbenchActivityEmpty() {
  return (
    <View className="items-center px-4 py-12">
      <Text variant="body-sm" className="text-center text-muted">
        暂无工具执行记录。发送任务后，实时跟随会出现在这里。
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

function ExecutionDetail({ tool }: { tool: ToolCallView }) {
  if (tool.terminal) {
    const cmd = tool.terminal.workdir
      ? `$ cd ${tool.terminal.workdir} && ${tool.terminal.command}`
      : `$ ${tool.terminal.command}`;
    return (
      <BashTerminalView
        title={tool.terminal.description || tool.title}
        durationLabel={tool.elapsed}
        commandLine={cmd}
        outputLines={terminalLines(tool)}
      />
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

  if (emphasis === 'sources' && sources.length > 0) {
    return (
      <View className="px-4 pb-3">
        <WorkbenchSourcesStatsHeader sources={sources} />
        {sources.map((source) => (
          <WorkbenchSourceCard key={source.id} source={source} />
        ))}
      </View>
    );
  }

  if (!executions.length) {
    return <WorkbenchActivityEmpty />;
  }

  const focusedId = resolveFocusedToolCallId(
    executions,
    workbench.focusTarget,
    workbench.artifacts,
    selectedToolCallId,
  );
  const selected =
    executions.find((tool) => tool.toolCallId === focusedId) ?? executions.at(-1);
  if (!selected) {
    return <WorkbenchActivityEmpty />;
  }

  return (
    <>
      <ExecutionDetail tool={selected} />
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

export function WorkbenchActivityContent({
  emphasis = 'default',
  workbench,
  selectedToolCallId,
  onSelectToolCall,
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

export function WorkbenchActivityView(props: WorkbenchActivityContentProps) {
  return (
    <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
      <WorkbenchActivityContent {...props} />
    </ScrollView>
  );
}

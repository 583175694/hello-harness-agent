import { ScrollView, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { sourcesFixture, toolActivitiesFixture } from '../fixtures/ui-fixtures';
import { BashTerminalView } from './bash-terminal-view';
import { WorkbenchSourceCard, WorkbenchSourcesStatsHeader } from './workbench-sources-view';

export type WorkbenchActivityEmphasis = 'default' | 'sources';

type WorkbenchActivityContentProps = {
  emphasis?: WorkbenchActivityEmphasis;
};

export function WorkbenchActivityContent({ emphasis = 'default' }: WorkbenchActivityContentProps) {
  if (emphasis === 'sources') {
    return (
      <View className="px-4 pb-3">
        <WorkbenchSourcesStatsHeader />
        {sourcesFixture.map((source) => (
          <WorkbenchSourceCard key={source.id} source={source} />
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

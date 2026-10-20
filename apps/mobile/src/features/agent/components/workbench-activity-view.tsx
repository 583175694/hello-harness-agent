import { ScrollView, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { sourcesFixture, toolActivitiesFixture } from '../fixtures/ui-fixtures';
import { WorkbenchSourceCard, WorkbenchSourcesStatsHeader } from './workbench-sources-view';

export type WorkbenchActivityEmphasis = 'default' | 'sources';

type WorkbenchActivityContentProps = {
  /** `sources`：检索/读取结果卡片（原独立 Sources Tab，现并入实时跟随）。 */
  emphasis?: WorkbenchActivityEmphasis;
};

/** Sheet 内嵌：由外层 BottomSheetScrollView 统一滚动 */
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
      <View className="border-b border-composer-border bg-[#16191f] p-3">
        <View className="mb-2 flex-row items-center justify-between">
          <Text variant="mono" className="text-zinc-200">
            bash — pytest tests/test_auth_2fa.py
          </Text>
          <Text variant="caption" className="text-zinc-500">
            284ms
          </Text>
        </View>
        <View className="rounded-lg bg-terminal p-3">
          <Text variant="mono" className="text-emerald-400">
            $ pytest tests/test_auth_2fa.py -v --tb=short
          </Text>
          <Text variant="mono" className="mt-2 text-zinc-400">
            ============================= test session starts ==============================
          </Text>
          <Text variant="mono" className="text-[#4ade80]">
            tests/test_auth_2fa.py::test_totp_verification_success PASSED
          </Text>
        </View>
      </View>
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

/** UI Catalog 固定高度预览：自带 ScrollView */
export function WorkbenchActivityView({
  emphasis = 'default',
}: {
  emphasis?: WorkbenchActivityEmphasis;
}) {
  return (
    <ScrollView className="flex-1" contentContainerClassName="flex-grow" showsVerticalScrollIndicator={false}>
      <WorkbenchActivityContent emphasis={emphasis} />
    </ScrollView>
  );
}

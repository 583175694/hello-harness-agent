import { ScrollView, View } from 'react-native';
import { ChevronDown, ChevronUp, Globe } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { sourcesFixture } from '../fixtures/ui-fixtures';

export function WorkbenchSourcesView() {
  return (
    <ScrollView className="flex-1" contentContainerClassName="gap-3 px-4 py-3" showsVerticalScrollIndicator={false}>
      <View className="flex-row items-center justify-between px-0.5">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text variant="caption" className="font-medium text-[#217346]">
            ● 2 个回答采用
          </Text>
          <Text variant="caption" className="text-[#dededb]">
            ·
          </Text>
          <Text variant="caption" className="text-secondary">
            3 已读取
          </Text>
          <Text variant="caption" className="text-[#dededb]">
            ·
          </Text>
          <Text variant="caption" className="text-secondary">
            5 线索
          </Text>
        </View>
        <Text variant="caption" className="font-mono text-muted">
          RAG Match
        </Text>
      </View>

      {sourcesFixture.map((source) => (
        <View
          key={source.id}
          className="gap-2.5 rounded-xl border border-border bg-surface p-3 shadow-sm"
        >
          <View className="flex-row items-center justify-between gap-2">
            <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
              <Globe size={15} color="#555551" />
              <Text variant="caption" className="flex-1 font-mono text-secondary" numberOfLines={1}>
                {source.domain}
              </Text>
            </View>
            <View className="flex-row items-center gap-1.5">
              <View
                className={
                  source.badgeTone === 'success'
                    ? 'rounded bg-approval px-1.5 py-0.5'
                    : 'rounded bg-[#e3e3e0] px-1.5 py-0.5'
                }
              >
                <Text
                  variant="caption"
                  className={
                    source.badgeTone === 'success' ? 'font-medium text-[#217346]' : 'text-secondary'
                  }
                >
                  {source.badge}
                </Text>
              </View>
              {source.expanded ? (
                <ChevronUp size={16} color="#555551" />
              ) : (
                <ChevronDown size={16} color="#898986" />
              )}
            </View>
          </View>
          <Text variant="body-sm" className="font-semibold leading-snug">
            {source.title}
          </Text>
          {source.passage ? (
            <View className="gap-2 rounded-lg border border-composer-border bg-canvas p-2.5">
              <View className="flex-row items-center justify-between">
                <Text variant="caption" className="font-medium text-primary">
                  {source.passage.heading}
                </Text>
                <Text variant="caption" className="rounded bg-[#e3e3e0] px-1.5 py-0.5 font-mono">
                  Chunk #3
                </Text>
              </View>
              <Text variant="caption" className="leading-relaxed text-secondary">
                “{source.passage.chunk}”
              </Text>
              <View className="flex-row flex-wrap gap-1 pt-1">
                {source.passage.tags.map((tag) => (
                  <View key={tag} className="rounded border border-border bg-surface px-1.5 py-0.5">
                    <Text variant="caption" className="font-mono text-secondary">
                      {tag}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : (
            <Text variant="caption" className="leading-relaxed text-secondary" numberOfLines={2}>
              “{source.excerpt}”
            </Text>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

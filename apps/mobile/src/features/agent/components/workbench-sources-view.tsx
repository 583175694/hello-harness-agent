import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { ChevronDown, ChevronUp, Globe } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { ICON_CHEVRON_TONE } from '@/lib/theme';
import { Text } from '@/components/ui/text';
import { sourcesFixture, type SourceFixture } from '../fixtures/ui-fixtures';
import { WorkbenchPassageModal } from './workbench-passage-modal';

export function WorkbenchSourcesStatsHeader() {
  return (
    <View className="flex-row items-center justify-between px-0.5 pb-3 pt-3">
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
  );
}

export function WorkbenchSourceCard({ source }: { source: SourceFixture }) {
  const [passageOpen, setPassageOpen] = useState(false);
  const longPassage =
    source.passage?.chunk ??
    '这是一段较长的原文摘录，用于演示 Passage 半屏 Modal。内容可能包含多句说明与引用上下文，便于用户在移动端阅读完整 passage 而不挤压 Workbench 列表布局。';

  return (
    <View className="mb-3 gap-2.5 rounded-xl border border-border bg-surface p-3 shadow-sm">
      <View className="flex-row items-center justify-between gap-2">
        <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
          <Icon icon={Globe} tone="secondary" size={16} />
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
            <Icon icon={ChevronUp} tone={ICON_CHEVRON_TONE.disclosure} size={16} />
          ) : (
            <Icon icon={ChevronDown} tone={ICON_CHEVRON_TONE.disclosure} size={16} />
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
          <Text variant="caption" className="leading-relaxed text-secondary" numberOfLines={3}>
            “{source.passage.chunk}”
          </Text>
          <Pressable onPress={() => setPassageOpen(true)} className="self-start pt-1 active:opacity-70">
            <Text variant="caption" className="text-link">
              查看全文
            </Text>
          </Pressable>
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
      <WorkbenchPassageModal
        visible={passageOpen}
        title={source.title}
        heading={source.passage?.heading ?? source.domain}
        body={longPassage}
        onClose={() => setPassageOpen(false)}
      />
    </View>
  );
}

/** UI Catalog 固定高度预览：自带 ScrollView */
export function WorkbenchSourcesView() {
  return (
    <ScrollView className="flex-1" contentContainerClassName="px-4" showsVerticalScrollIndicator={false}>
      <WorkbenchSourcesStatsHeader />
      {sourcesFixture.map((source) => (
        <WorkbenchSourceCard key={source.id} source={source} />
      ))}
    </ScrollView>
  );
}

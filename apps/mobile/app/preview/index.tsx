import { Link } from 'expo-router';
import { Pressable, ScrollView } from 'react-native';
import { Text } from '@/components/ui/text';

const frames = [
  {
    href: '/preview/agent',
    title: 'Agent Preview · Web 对齐',
    desc: '全部 PREVIEW_STATES（reasoning / plan / HITL…）',
  },
  {
    href: '/preview/ui-catalog',
    title: 'UI Catalog · Web 对齐组件',
    desc: '工具/状态/Workbench/Composer 全量静态预览',
  },
  { href: '/preview/a-sheet-closed', title: 'A · Sheet Closed', desc: '会话主视图 + Composer' },
  { href: '/preview/b-sources', title: 'B · 来源 Tab', desc: 'Workbench ~60% · 来源列表' },
  { href: '/preview/c-hitl', title: 'C · HITL Composer', desc: '工具审批内嵌 Composer' },
  { href: '/preview/d-drawer', title: 'D · Session Drawer', desc: '左 Drawer ~78%' },
  { href: '/preview/artifact', title: '产物 · Artifact Tab', desc: 'Diff 预览 + 底栏 CTA' },
] as const;

export default function PreviewIndexScreen() {
  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerClassName="gap-3 p-4 pt-16">
      <Text variant="headline">Stitch v3 设计帧预览</Text>
      <Text variant="body-sm" className="text-secondary">
        静态 UI 骨架，fixture 数据，无 API / Run 逻辑。
      </Text>
      {frames.map((frame) => (
        <Link key={frame.href} href={frame.href} asChild>
          <Pressable className="rounded-panel border border-border bg-surface p-4 active:bg-subtle">
            <Text variant="body" className="font-semibold">
              {frame.title}
            </Text>
            <Text variant="body-sm" className="mt-1 text-secondary">
              {frame.desc}
            </Text>
          </Pressable>
        </Link>
      ))}
    </ScrollView>
  );
}

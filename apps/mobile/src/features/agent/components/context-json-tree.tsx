import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { ChevronDown, ChevronRight } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { ICON_CHEVRON_TONE } from '@/lib/theme';

type JsonNode = {
  key: string;
  value?: string;
  children?: JsonNode[];
};

const sampleTree: JsonNode[] = [
  {
    key: 'model',
    value: '"deepseek-chat"',
  },
  {
    key: 'compaction',
    children: [
      { key: 'prefixHash', value: '"a3f2…"' },
      { key: 'triggered', value: 'true' },
    ],
  },
  {
    key: 'mcpCatalogStale',
    value: 'false',
  },
];

function TreeNode({ node, depth }: { node: JsonNode; depth: number }) {
  const [open, setOpen] = useState(depth < 1);
  const hasChildren = Boolean(node.children?.length);

  return (
    <View style={{ paddingLeft: depth * 12 }}>
      <Pressable
        disabled={!hasChildren}
        onPress={() => setOpen((v) => !v)}
        className="flex-row items-center gap-1 py-0.5"
      >
        {hasChildren ? (
          <Icon
            icon={open ? ChevronDown : ChevronRight}
            tone={ICON_CHEVRON_TONE.disclosure}
            size={14}
          />
        ) : (
          <View className="w-3.5" />
        )}
        <Text variant="mono" className="text-primary">
          {node.key}
          {node.value != null ? `: ${node.value}` : ''}
        </Text>
      </Pressable>
      {hasChildren && open
        ? node.children!.map((child) => <TreeNode key={child.key} node={child} depth={depth + 1} />)
        : null}
    </View>
  );
}

export function ContextJsonTree() {
  return (
    <View className="rounded-control bg-terminal p-3">
      {sampleTree.map((node) => (
        <TreeNode key={node.key} node={node} depth={0} />
      ))}
    </View>
  );
}

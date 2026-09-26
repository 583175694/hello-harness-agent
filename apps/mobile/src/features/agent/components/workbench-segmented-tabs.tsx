import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import type { WorkspaceView } from '../fixtures/ui-fixtures';
import { cn } from '@/lib/cn';

type TabDef = { id: WorkspaceView; label: string; count?: number };

type WorkbenchSegmentedTabsProps = {
  tabs: TabDef[];
  active: WorkspaceView;
};

export function WorkbenchSegmentedTabs({ tabs, active }: WorkbenchSegmentedTabsProps) {
  return (
    <View className="flex-row rounded-lg bg-subtle p-0.5">
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <Pressable
            key={tab.id}
            className={cn(
              'flex-1 flex-row items-center justify-center rounded-md py-1.5',
              selected && 'bg-primary shadow-sm',
            )}
          >
            <Text
              variant="caption"
              className={cn('font-medium', selected ? 'text-primary-foreground' : 'text-secondary')}
            >
              {tab.label}
              {tab.count != null ? ` (${tab.count})` : ''}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

import { Pressable, View } from 'react-native';
import { cn } from '@/lib/cn';
import { Text } from '@/components/ui/text';
import { AGENT_UI_BUTTON } from '../config/ui.constants';
import type { WorkspaceView } from '../fixtures/ui-fixtures';
import { SlidingSegmentTrack } from './sliding-segmented-control';

type TabDef = { id: WorkspaceView; label: string; count?: number };

type WorkbenchSegmentedTabsProps = {
  tabs: TabDef[];
  active: WorkspaceView;
  onTabPress?: (view: WorkspaceView) => void;
};

const { classNames: btn } = AGENT_UI_BUTTON;

export function WorkbenchSegmentedTabs({ tabs, active, onTabPress }: WorkbenchSegmentedTabsProps) {
  const selectedIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === active),
  );

  return (
    <SlidingSegmentTrack segmentCount={tabs.length} selectedIndex={selectedIndex}>
      <View className="flex-row">
        {tabs.map((tab) => {
          const selected = tab.id === active;
          return (
            <Pressable
              key={tab.id}
              onPress={() => onTabPress?.(tab.id)}
              className={cn(btn.segmentTab, 'flex-1')}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
            >
              <Text
                variant="caption"
                className={cn(
                  'font-medium',
                  selected ? btn.segmentLabelSelected : btn.segmentLabelIdle,
                )}
              >
                {tab.label}
                {tab.count != null ? ` (${tab.count})` : ''}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </SlidingSegmentTrack>
  );
}

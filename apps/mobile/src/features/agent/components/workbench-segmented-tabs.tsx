import { Pressable, View } from 'react-native';
import { cn } from '@/lib/cn';
import { Text } from '@/components/ui/text';
import { AGENT_UI_BUTTON } from '../config/ui.constants';
import type { WorkspaceView } from '../fixtures/ui-fixtures';

type TabDef = { id: WorkspaceView; label: string; count?: number };

type WorkbenchSegmentedTabsProps = {
  tabs: TabDef[];
  active: WorkspaceView;
  onTabPress?: (view: WorkspaceView) => void;
};

const { classNames: btn } = AGENT_UI_BUTTON;

export function WorkbenchSegmentedTabs({ tabs, active, onTabPress }: WorkbenchSegmentedTabsProps) {
  return (
    <View className={btn.segmentTrack}>
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <Pressable
            key={tab.id}
            onPress={() => onTabPress?.(tab.id)}
            className={cn(btn.segmentTab, selected && btn.segmentTabSelected)}
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
  );
}

import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/text';
import type { WorkspaceView } from '../fixtures/ui-fixtures';

type TabDef = { id: WorkspaceView; label: string; count?: number };

type WorkbenchSegmentedTabsProps = {
  tabs: TabDef[];
  active: WorkspaceView;
  onTabPress?: (view: WorkspaceView) => void;
};

export function WorkbenchSegmentedTabs({ tabs, active, onTabPress }: WorkbenchSegmentedTabsProps) {
  return (
    <View style={styles.row}>
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <Pressable
            key={tab.id}
            onPress={() => onTabPress?.(tab.id)}
            style={[styles.tab, selected && styles.tabSelected]}
          >
            <Text
              variant="caption"
              style={[styles.label, selected ? styles.labelSelected : styles.labelIdle]}
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

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    borderRadius: 8,
    backgroundColor: '#f1f1ef',
    padding: 2,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    paddingVertical: 6,
  },
  tabSelected: {
    backgroundColor: '#171717',
  },
  label: {
    fontWeight: '500',
  },
  labelSelected: {
    color: '#ffffff',
  },
  labelIdle: {
    color: '#555551',
  },
});

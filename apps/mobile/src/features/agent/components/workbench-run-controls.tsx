import { Pressable, View } from 'react-native';
import { Pause, Play } from 'lucide-react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { WorkbenchState } from '@harness/agent-ui-types';

function pauseResumeVisibility(
  activityStatus: WorkbenchState['activityStatus'] | undefined,
  hasActiveRun: boolean,
): { showPause: boolean; showResume: boolean } {
  if (!hasActiveRun) return { showPause: false, showResume: false };
  if (activityStatus === 'paused' || activityStatus === 'pause_requested') {
    return { showPause: false, showResume: true };
  }
  if (
    activityStatus === 'running' ||
    activityStatus === 'resuming' ||
    activityStatus === undefined
  ) {
    return { showPause: true, showResume: false };
  }
  return { showPause: false, showResume: false };
}

type WorkbenchRunControlsProps = {
  activityStatus?: WorkbenchState['activityStatus'];
  activeRunId?: string | null;
  onPause?: () => void;
  onResume?: () => void;
};

export function WorkbenchRunControls({
  activityStatus,
  activeRunId,
  onPause,
  onResume,
}: WorkbenchRunControlsProps) {
  const { showPause, showResume } = pauseResumeVisibility(activityStatus, Boolean(activeRunId));
  if (!showPause && !showResume) return null;

  return (
    <View className="flex-row gap-2">
      {showPause ? (
        <Pressable
          onPress={onPause}
          className="min-h-9 flex-row items-center gap-1.5 rounded-control border border-composer-border px-2.5 active:bg-subtle"
          accessibilityRole="button"
          accessibilityLabel="暂停运行"
        >
          <Icon icon={Pause} tone="secondary" size={16} strokeWidth={2} />
          <Text variant="caption" className="font-medium text-primary">
            暂停
          </Text>
        </Pressable>
      ) : null}
      {showResume ? (
        <Pressable
          onPress={onResume}
          className="min-h-9 flex-row items-center gap-1.5 rounded-control border border-composer-border px-2.5 active:bg-subtle"
          accessibilityRole="button"
          accessibilityLabel="继续运行"
        >
          <Icon icon={Play} tone="secondary" size={16} strokeWidth={2} />
          <Text variant="caption" className="font-medium text-primary">
            继续
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

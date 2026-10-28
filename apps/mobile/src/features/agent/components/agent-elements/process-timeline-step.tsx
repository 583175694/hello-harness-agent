import type { ReactNode } from 'react';
import { View } from 'react-native';

/** 与 Web `.ai-chain-step` 第一列 22px + 轨道竖线 `left: 12px` 等效（居中 1px 线）。 */
export const PROCESS_TIMELINE_RAIL_WIDTH = 22;
export const PROCESS_TIMELINE_RAIL_GAP = 8;
/** Web `.ai-chain-step__rail` 高度 20px：图标与步骤标题首行对齐，不受副标题有无影响。 */
export const PROCESS_TIMELINE_FIRST_LINE_HEIGHT = 20;
/** Web `.ai-chain-step` 步盒最小高度与内边距。 */
export const PROCESS_TIMELINE_STEP_MIN_HEIGHT = 42;
export const PROCESS_TIMELINE_STEP_PADDING_TOP = 4;
export const PROCESS_TIMELINE_STEP_PADDING_BOTTOM = 8;

type ProcessTimelineStepProps = {
  icon: ReactNode;
  isLast: boolean;
  children: ReactNode;
  /** 步骤下方额外内容（如展开的 reasoning 正文），仍与正文列对齐 */
  footer?: ReactNode;
};

export function ProcessTimelineStep({ icon, isLast, children, footer }: ProcessTimelineStepProps) {
  return (
    <View
      className="flex-row items-start"
      style={{
        gap: PROCESS_TIMELINE_RAIL_GAP,
        minHeight: PROCESS_TIMELINE_STEP_MIN_HEIGHT,
        paddingTop: PROCESS_TIMELINE_STEP_PADDING_TOP,
        paddingBottom: PROCESS_TIMELINE_STEP_PADDING_BOTTOM,
      }}
    >
      <View
        className="items-center self-stretch"
        style={{ width: PROCESS_TIMELINE_RAIL_WIDTH }}
      >
        <View
          className="w-full items-center justify-center"
          style={{ height: PROCESS_TIMELINE_FIRST_LINE_HEIGHT }}
        >
          {icon}
        </View>
        {!isLast ? <View className="w-px flex-1 bg-border" /> : null}
      </View>
      <View className="min-w-0 flex-1">
        {children}
        {footer}
      </View>
    </View>
  );
}

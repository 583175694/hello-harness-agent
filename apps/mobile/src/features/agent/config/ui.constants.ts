import { APP_BRAND } from '@/lib/brand';
import { ICON_CHEVRON_TONE } from '@/lib/theme';
/** Re-export for feature code — see `ICON_CHEVRON_TONE` in theme.ts. */
export { APP_BRAND, ICON_CHEVRON_TONE };

/** Chat 壳层尺寸 — Workbench `topInset`、顶栏对齐用。 */
export const AGENT_UI_LAYOUT = {
  chatTopBarHeight: 48,
  workbenchTopInset: (safeAreaTop: number) => safeAreaTop + 48,
  /** Composer Plan 浮卡 — 仅在对话/composer  subtree 内叠放 */
  composerPlanZIndex: 1,
  /** Workbench BottomSheet — 须盖住 Plan 与 Composer（靠 Modal 层 + 数值兜底） */
  workbenchSheetZIndex: 100,
  workbenchSheetElevation: 32,
  /** 三档 detent：低 / 中 / 最高（打开 Workbench 默认最高档） */
  workbenchSheetSnapPoints: ['44%', '72%', '98%'] as const,
  workbenchSheetDefaultSnapIndex: 2,
} as const;

export const AGENT_UI_COPY = {
  composerPlaceholders: {
    newRun: '描述你想完成的任务……',
    steer: '补充方向，将从下一步骤应用……',
    clarification: '回答确认问题以继续……',
    disabled: '正在取消当前任务……',
  },
} as const;

/**
 * Agent 内可点控件的样式与交互约定（与 `@/components/ui/button` 对齐）。
 *
 * - **PressableScale**：实心主/次 CTA、Composer/Follow-up 发送、批准/拒绝等需要「按下去」反馈的按钮。
 * - **Pressable + active:bg-***：列表行、分段 Tab、工具栏 ghost、取消链接等 — 仅背景/透明度变化，不 scale。
 */
export const AGENT_UI_BUTTON = {
  minHeight: {
    /** 主文案 CTA（提交回答、批准等） */
    cta: 40,
    /** Composer / Follow-up 圆形发送 */
    iconSend: 32,
    /** 顶栏 / Workbench 关闭等 icon-only 触控目标 */
    iconToolbar: 40,
  },
  radius: {
    cta: 'rounded-control',
    pill: 'rounded-full',
    segmentInner: 'rounded-[6px]',
  },
  variant: {
    primary:
      'bg-primary active:bg-primary-pressed',
    secondary:
      'bg-subtle border border-border active:bg-subtle-pressed',
    rejection:
      'bg-rejection border border-[#f3d3cf] active:bg-[#f3dedb]',
    ghost: 'bg-transparent active:bg-subtle',
    iconOnlyGhost: 'active:bg-subtle',
  },
  /** 常用组合 className（NativeWind） */
  classNames: {
    primaryCta:
      'h-10 items-center justify-center rounded-control bg-primary active:bg-primary-pressed',
    primaryIconSend:
      'h-8 w-8 items-center justify-center rounded-full bg-primary',
    iconToolbar:
      'h-10 w-10 items-center justify-center rounded-full active:bg-subtle',
    chipOption:
      'rounded-full border border-border bg-subtle px-3 py-1.5 active:bg-subtle-pressed',
    segmentTrack: 'flex-row rounded-control bg-subtle p-0.5',
    segmentTab: 'flex-1 items-center justify-center rounded-[6px] py-1.5',
    segmentTabSelected: 'bg-primary',
    segmentLabelSelected: 'text-primary-foreground',
    segmentLabelIdle: 'text-secondary',
  },
  interaction: {
    usePressableScale:
      'primary/secondary/rejection 实心 CTA、icon 发送（ArrowUp）、需要 scale 0.96 的确认操作',
    useBackgroundOnly:
      '分段 Tab、列表 disclosure、取消文字链、ghost icon（X 移除队列项）',
    disabled: '提交/请求进行中：PressableScale disabled + opacity-50，不触发 scale',
  },
} as const;

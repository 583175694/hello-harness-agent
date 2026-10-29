package com.harness.agent.coreui.tokens

import androidx.compose.ui.unit.dp

/** 对齐 RN `tailwind.config.js` borderRadius + `AGENT_UI_LAYOUT` / `AGENT_UI_BUTTON`。 */
object HarnessLayout {
    val controlRadius = 8.dp
    val panelRadius = 12.dp
    val bubbleRadius = 22.dp
    /** 对话列表：单轮上下外边距。 */
    val chatTurnVerticalPadding = 8.dp
    /** ChatMarkdown 块级间距，对齐 Web `--markdown-flow-space`（11px）。 */
    val chatMarkdownBlockGap = 11.dp
    /** 同列表相邻项间距，对齐 Web `.markdown-content li + li`（4px）。 */
    val chatMarkdownListItemGap = 4.dp
    /** 正文行高 px @14px 字号，对齐 Web `--h-leading-content`。 */
    const val chatMarkdownLeadingAt14 = 24
    /** 用户气泡行高 @14px，对齐 Web `--h-leading-bubble`。 */
    const val chatMarkdownBubbleLeadingAt14 = 22
    val chatBubblePaddingHorizontal = 16.dp
    val chatBubblePaddingVertical = 12.dp
    /** LazyColumn 相邻两轮间距。 */
    val chatListTurnSpacing = 10.dp
    val chatAssistantBodyPadding = 14.dp
    /** Kimi 式设置：卡片圆角、分组间距、行高。 */
    val settingsCardRadius = 16.dp
    val settingsGroupGap = 20.dp
    val settingsRowVerticalPadding = 12.dp
    val settingsRowMinHeight = 48.dp
    val sheetTopRadius = 20.dp
    val segmentInnerRadius = 6.dp
    val segmentTrackPadding = 2.dp

    val chatTopBarHeight = 48.dp
    val chatTopBarInnerRowHeight = 40.dp
    val iconToolbarSize = 40.dp
    /** Composer 附件条：图片 / 文件卡片统一高度（横向滚动）。 */
    val composerAttachmentStripHeight = 52.dp
    val composerAttachmentFileMaxWidth = 216.dp
    val composerPlusSize = 44.dp
    val composerSendSize = 32.dp
    /** Plan 胶囊底边距 Composer 气泡底（工具栏行 + 与输入区间距）。 */
    val composerPlanPillBottomInset = 52.dp
    /** Plan 浮层相对屏幕左右 inset，对齐 Web `calc(100vw - 24px)`。 */
    val planOverlayHorizontalInset = 12.dp
    val composerMinInputHeight = 44.dp
    /** 约 5 行（14sp / 22sp 行高），对齐 RN `max-h-24` / 微信多行输入上限。 */
    val composerMaxInputHeight = 120.dp
    const val composerInputMaxLines = 5
    val workbenchHandleWidth = 36.dp
    val workbenchHandleHeight = 4.dp
    /** 对齐 Web `.workbench-tool-slider`：12 / 16 / 14，label 与控件行 gap 8。 */
    val workbenchStepFooterTopPadding = 12.dp
    val workbenchStepFooterHorizontalPadding = 16.dp
    val workbenchStepFooterBottomPadding = 14.dp
    val workbenchStepFooterContentGap = 8.dp
    /** 对齐 Web `.pending-input-card`：紧凑行 + 28px 操作钮。 */
    val followUpRowMinHeight = 36.dp
    val followUpRowPaddingVertical = 4.dp
    val followUpRowPaddingHorizontal = 12.dp
    val followUpActionSize = 28.dp
    val followUpSendIconSize = 14.dp
    /** Dialog 内 inset 为 0 时，手势条/三键导航最小安全高度兜底。 */
    val workbenchStepFooterMinSafeInset = 34.dp

    const val overlayScrimAlpha = 0.4f
    const val composerDividerAlpha = 0.8f
}

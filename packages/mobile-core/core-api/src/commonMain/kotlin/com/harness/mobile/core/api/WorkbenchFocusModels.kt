package com.harness.mobile.core.api

/** 对齐 Web `WorkbenchFocusTarget`（Native tab 名为 activity / sources / report / artifact）。 */
data class MobileWorkbenchFocusTarget(
    val kind: String,
    val runId: String,
    val toolCallId: String? = null,
    val stepId: String? = null,
    val artifactId: String? = null,
)

data class WorkbenchFocusApplyResult(
    val view: String,
    val focusTarget: MobileWorkbenchFocusTarget,
    val focusedToolCallId: String? = null,
    val degraded: Boolean = false,
    val hint: String? = null,
)

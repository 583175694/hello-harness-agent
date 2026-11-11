package com.harness.mobile.core.engine

import com.harness.mobile.core.api.MobileWorkbenchFocusTarget
import com.harness.mobile.core.api.MobileWorkbenchSnapshot
import com.harness.mobile.core.api.WorkbenchFocusApplyResult

object WorkbenchFocusProjector {
    fun viewFromKind(kind: String): String =
        when (kind) {
            "source", "sources" -> "sources"
            "report" -> "report"
            "artifact" -> "artifact"
            else -> "activity"
        }

    fun apply(
        workbench: MobileWorkbenchSnapshot,
        target: MobileWorkbenchFocusTarget,
    ): WorkbenchFocusApplyResult {
        val view = viewFromKind(target.kind)
        when (target.kind) {
            "tool_call" -> {
                val toolId = target.toolCallId ?: target.stepId
                if (toolId.isNullOrBlank()) {
                    return degradedActivity(target, "无法定位工具步骤，已打开 Activity 总览")
                }
                val exists = workbench.toolExecutions.any { it.id == toolId }
                if (!exists) {
                    return degradedActivity(target, "无法定位工具步骤，已打开 Activity 总览")
                }
                return WorkbenchFocusApplyResult(
                    view = "activity",
                    focusTarget = target,
                    focusedToolCallId = toolId,
                )
            }
            "artifact" -> {
                val artifactId = target.artifactId
                if (!artifactId.isNullOrBlank()) {
                    val versionHit = workbench.artifactVersions.any { it.id == artifactId }
                    if (versionHit) {
                        return WorkbenchFocusApplyResult(
                            view = "artifact",
                            focusTarget = target,
                        )
                    }
                }
                return WorkbenchFocusApplyResult(
                    view = "artifact",
                    focusTarget = target,
                    degraded = true,
                    hint = "无法定位文件版本，已打开 Artifact 面板",
                )
            }
            else ->
                return WorkbenchFocusApplyResult(
                    view = view,
                    focusTarget = target,
                )
        }
    }

    private fun degradedActivity(
        target: MobileWorkbenchFocusTarget,
        hint: String,
    ): WorkbenchFocusApplyResult =
        WorkbenchFocusApplyResult(
            view = "activity",
            focusTarget =
                target.copy(
                    kind = "activity",
                    toolCallId = null,
                    stepId = null,
                    artifactId = null,
                ),
            degraded = true,
            hint = hint,
        )
}

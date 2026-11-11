package com.harness.mobile.core.api

/**
 * 与 Web `WorkbenchShell` 可见 Tab 规则对齐（不含 Context）。
 * 顺序：activity → sources → report → artifact。
 */
object WorkbenchTabResolver {
    fun visibleTabs(snapshot: MobileWorkbenchSnapshot): List<String> {
        val tabs = mutableListOf("activity")
        if (snapshot.sources.isNotEmpty()) tabs += "sources"
        if (!snapshot.reportMarkdown.isNullOrBlank()) tabs += "report"
        if (hasArtifactTab(snapshot)) tabs += "artifact"
        return tabs
    }

    fun coerceActiveTab(
        snapshot: MobileWorkbenchSnapshot,
        requested: String,
    ): String {
        val tabs = visibleTabs(snapshot)
        if (requested in tabs) return requested
        val initial = snapshot.initialView.ifBlank { "activity" }
        if (initial in tabs) return initial
        return tabs.first()
    }

    fun tabLabel(tab: String): String =
        when (tab) {
            "activity" -> "实时跟随"
            "sources" -> "来源"
            "report" -> "报告"
            "artifact" -> "文件"
            else -> tab
        }

    private fun hasArtifactTab(snapshot: MobileWorkbenchSnapshot): Boolean =
        snapshot.deliverableFiles.isNotEmpty() ||
            snapshot.artifactVersions.isNotEmpty() ||
            snapshot.hasDeliverables == true
}

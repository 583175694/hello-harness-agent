package com.harness.agent.ui.workbench

/** 与 Web/RN `AGENT_UI_COPY.workbenchTabLabels` + Mobile 扩展 Tab 对齐（见 design-tokens.json）。 */
internal object WorkbenchTabLabels {
    fun label(tab: String): String =
        when (tab) {
            "activity" -> "实时跟随"
            "artifact" -> "文件"
            else -> tab
        }
}

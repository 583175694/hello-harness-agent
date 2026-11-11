package com.harness.agent.ui.workbench

import com.harness.mobile.core.api.WorkbenchTabResolver

/** 与 Web/design-tokens `AGENT_UI_COPY.workbenchTabLabels` + Mobile 扩展 Tab 对齐（见 design-tokens.json）。 */
internal object WorkbenchTabLabels {
    fun label(tab: String): String = WorkbenchTabResolver.tabLabel(tab)
}

package com.harness.mobile.core.test

import com.harness.mobile.core.api.MobileWorkbenchFocusTarget
import com.harness.mobile.core.api.MobileWorkbenchSnapshot
import com.harness.mobile.core.api.MobileWorkbenchToolExecution
import com.harness.mobile.core.engine.WorkbenchFocusProjector
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class WorkbenchFocusProjectorTest {
    private val sampleWorkbench =
        MobileWorkbenchSnapshot(
            runId = "run-1",
            toolExecutions =
                listOf(
                    MobileWorkbenchToolExecution(
                        id = "tc-1",
                        toolName = "web_search",
                        title = "搜索",
                        inputSummary = "q",
                        status = "completed",
                    ),
                ),
        )

    @Test
    fun toolCallResolvesToActivityWithFocusedId() {
        val target =
            MobileWorkbenchFocusTarget(
                kind = "tool_call",
                runId = "run-1",
                toolCallId = "tc-1",
            )
        val result = WorkbenchFocusProjector.apply(sampleWorkbench, target)
        assertEquals("activity", result.view)
        assertEquals("tc-1", result.focusedToolCallId)
        assertTrue(!result.degraded)
    }

    @Test
    fun missingToolDegradesToActivityOverview() {
        val target =
            MobileWorkbenchFocusTarget(
                kind = "tool_call",
                runId = "run-1",
                toolCallId = "missing",
            )
        val result = WorkbenchFocusProjector.apply(sampleWorkbench, target)
        assertEquals("activity", result.view)
        assertTrue(result.degraded)
        assertNotNull(result.hint)
    }

    @Test
    fun sourceKindMapsToSourcesTab() {
        assertEquals("sources", WorkbenchFocusProjector.viewFromKind("source"))
    }
}

package com.harness.mobile.core.test

import com.harness.mobile.core.api.ArtifactRef
import com.harness.mobile.core.api.MobileWorkbenchSnapshot
import com.harness.mobile.core.api.WorkbenchTabResolver
import kotlin.test.Test
import kotlin.test.assertEquals

class WorkbenchTabResolverTest {
    @Test
    fun activityOnlyWhenEmpty() {
        val snap = MobileWorkbenchSnapshot()
        assertEquals(listOf("activity"), WorkbenchTabResolver.visibleTabs(snap))
    }

    @Test
    fun fullTabSet() {
        val snap =
            MobileWorkbenchSnapshot(
                sources = listOf(com.harness.mobile.core.api.MobileWorkbenchSource("t", "https://x", "s")),
                reportMarkdown = "# Report",
                deliverableFiles =
                    listOf(
                        ArtifactRef(
                            artifactId = "a",
                            fileId = "f",
                            fileName = "x.md",
                        ),
                    ),
            )
        assertEquals(listOf("activity", "sources", "report", "artifact"), WorkbenchTabResolver.visibleTabs(snap))
    }

    @Test
    fun coerceFallsBackWhenInvalid() {
        val snap =
            MobileWorkbenchSnapshot(
                sources = listOf(com.harness.mobile.core.api.MobileWorkbenchSource("t", "https://x", "s")),
                initialView = "sources",
            )
        assertEquals("sources", WorkbenchTabResolver.coerceActiveTab(snap, "context"))
    }
}

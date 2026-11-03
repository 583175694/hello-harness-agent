package com.harness.mobile.core.test

import com.harness.mobile.core.api.PendingUserInputView
import com.harness.mobile.core.api.SessionDetail
import com.harness.mobile.core.engine.SessionSnapshotProjector
import kotlin.test.Test
import kotlin.test.assertEquals

class SessionFollowUpsProjectorTest {
    @Test
    fun followUpsFromDetailKeepsPendingOrderedBySequence() {
        val detail =
            SessionDetail(
                id = "s1",
                title = "t",
                createdAt = "2026-01-01",
                updatedAt = "2026-01-01",
                pendingUserInputs =
                    listOf(
                        PendingUserInputView("b", "follow_up", "pending", "second", 2),
                        PendingUserInputView("a", "steer", "pending", "first", 1),
                        PendingUserInputView("c", "follow_up", "consumed", "gone", 3),
                    ),
            )
        val rows = SessionSnapshotProjector.followUpsFromDetail(detail)
        assertEquals(listOf("a", "b"), rows.map { it.id })
        assertEquals("first", rows.first().content)
        assertEquals("steer", rows.first().kind)
        assertEquals("follow_up", rows[1].kind)
    }
}

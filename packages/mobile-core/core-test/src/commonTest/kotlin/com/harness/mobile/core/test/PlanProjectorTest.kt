package com.harness.mobile.core.test

import com.harness.mobile.core.api.PersistedMessage
import com.harness.mobile.core.engine.PlanProjector
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class PlanProjectorTest {
  @Test
    fun parsesPlanPayload() {
        val json =
            Json.parseToJsonElement(
                """{"explanation":"hi","plan":[{"step":"a","status":"in_progress"},{"step":"b","status":"pending"}]}""",
            )
        val plan = PlanProjector.parsePlan(json)
        assertNotNull(plan)
        assertEquals(2, plan.steps.size)
        assertEquals("in_progress", plan.steps[0].status)
    }

    @Test
    fun showOverlayWhileStepsIncomplete() {
        val json = Json.parseToJsonElement("""{"plan":[{"step":"a","status":"completed"},{"step":"b","status":"pending"}]}""")
        val plan = PlanProjector.parsePlan(json)
        assertNotNull(plan)
        assertTrue(PlanProjector.shouldShowPlanOverlay(plan, runActive = true))
    }

    @Test
    fun hideWhenAllCompleted() {
        val json = Json.parseToJsonElement("""{"plan":[{"step":"a","status":"completed"}]}""")
        val plan = PlanProjector.parsePlan(json)
        assertNotNull(plan)
        assertFalse(PlanProjector.shouldShowPlanOverlay(plan, runActive = true))
    }

    @Test
    fun latestPlanFromAssistantMetadata() {
        val planJson =
            Json.parseToJsonElement(
                """{"plan":[{"step":"only","status":"in_progress"}]}""",
            )
        val messages =
            listOf(
                PersistedMessage(
                    id = "u1",
                    sessionId = "s1",
                    role = "user",
                    kind = "message",
                    content = "hi",
                    createdAt = "1",
                ),
                PersistedMessage(
                    id = "a1",
                    sessionId = "s1",
                    role = "assistant",
                    kind = "message",
                    content = "",
                    createdAt = "2",
                    metadata =
                        buildJsonObject {
                            put("plan", planJson)
                        },
                ),
            )
        val plan = PlanProjector.latestPlanFromMessages(messages)
        assertNotNull(plan)
        assertEquals("only", plan.steps.single().step)
    }
}

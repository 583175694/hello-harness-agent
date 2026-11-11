package com.harness.mobile.core.engine

import com.harness.mobile.core.api.MobilePlanSnapshot
import com.harness.mobile.core.api.MobilePlanStep
import com.harness.mobile.core.api.PersistedMessage
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

object PlanProjector {
    fun parsePlan(element: JsonElement?): MobilePlanSnapshot? {
        val obj = element as? JsonObject ?: return null
        val stepsArray = obj["plan"] as? JsonArray ?: return null
        val steps =
            stepsArray.mapNotNull { row ->
                val stepObj = row.jsonObject
                val label = stepObj["step"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null
                val status = stepObj["status"]?.jsonPrimitive?.contentOrNull ?: "pending"
                MobilePlanStep(step = label, status = status)
            }
        if (steps.isEmpty()) return null
        return MobilePlanSnapshot(
            explanation = obj["explanation"]?.jsonPrimitive?.contentOrNull,
            steps = steps,
        )
    }

    /** 从已持久化的 assistant metadata 回溯最近一份计划（对齐 `metadata.plan`）。 */
    fun latestPlanFromMessages(messages: List<PersistedMessage>): MobilePlanSnapshot? {
        for (message in messages.asReversed()) {
            if (message.role != "assistant") continue
            parsePlan(message.metadata["plan"])?.let { return it }
        }
        return null
    }

    fun planToJson(snapshot: MobilePlanSnapshot): JsonObject =
        buildJsonObject {
            snapshot.explanation?.let { put("explanation", it) }
            put(
                "plan",
                JsonArray(
                    snapshot.steps.map { step ->
                        buildJsonObject {
                            put("step", step.step)
                            put("status", step.status)
                        }
                    },
                ),
            )
        }

    /** Run 进行中是否应在 Composer 上方展示 Plan（对齐 Web）。 */
    fun shouldShowPlanOverlay(
        plan: MobilePlanSnapshot?,
        runActive: Boolean,
    ): Boolean {
        if (!runActive || plan == null || plan.steps.isEmpty()) return false
        return plan.steps.any { it.status != "completed" }
    }
}

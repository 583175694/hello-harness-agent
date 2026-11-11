package com.harness.mobile.core.api

/** 对齐 agent-protocol `planSnapshotSchema` / Web `PlanSnapshot`。 */
data class MobilePlanSnapshot(
    val explanation: String? = null,
    val steps: List<MobilePlanStep> = emptyList(),
)

data class MobilePlanStep(
    val step: String,
    val status: String,
)

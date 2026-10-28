package com.harness.agent.model

data class ComposerState(
    val mode: String = "default",
    val composerTextMode: String = "new-run",
    val submitting: Boolean = false,
    val clarification: ClarificationFixture? = null,
    val toolApproval: ToolApprovalFixture? = null,
    val selectedSkills: List<String> = emptyList(),
    val showPlan: Boolean = false,
    val plan: PlanFixture? = null,
    val attachmentNames: List<String> = emptyList(),
    val selectedModelLabel: String = "默认模型",
    val followUps: List<FollowUpFixture> = emptyList(),
)

data class FollowUpFixture(
    val id: String,
    val content: String,
)

data class PlanFixture(
    val explanation: String? = null,
    val steps: List<PlanStepFixture> = emptyList(),
    val initialExpanded: Boolean = false,
)

data class PlanStepFixture(
    val step: String,
    val status: String = "pending",
)

data class ClarificationFixture(
    val question: String,
    val options: List<String> = emptyList(),
    val allowFreeText: Boolean = true,
)

data class ToolApprovalFixture(
    val title: String = "需要批准工具调用",
    val items: List<ToolApprovalItemFixture> = emptyList(),
    val sandboxNote: String? = null,
)

data class ToolApprovalItemFixture(
    val itemId: String,
    val toolName: String,
    val command: String,
)

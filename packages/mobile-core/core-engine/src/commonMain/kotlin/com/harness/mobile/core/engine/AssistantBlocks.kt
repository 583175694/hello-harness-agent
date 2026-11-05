package com.harness.mobile.core.engine

/**
 * Run live assistant blocks stored as [kotlinx.serialization.json.JsonObject], aligned with
 * `@harness/agent-protocol` `AssistantContentBlock` variants:
 *
 * - `text`: `id`, `type=text`, `content`, optional `phase` (`pending`|`process`|`final`),
 *   `roundId`, `roundSequence`, `blockSequence`
 * - `reasoning`: `id`, `type=reasoning`, `content`, `roundSequence`, `blockSequence`, `durationMs`, `completedAt`
 * - `tool_activity`: `id`, `type=tool_activity`, `toolCallId`, `toolName`, `title`, `summary`, `status`, …
 */
internal object AssistantBlockTypes {
    const val TEXT = "text"
    const val REASONING = "reasoning"
    const val TOOL = "tool_activity"
    const val ARTIFACT = "artifact"
}

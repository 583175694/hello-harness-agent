package com.harness.agent.ui.chat

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.harness.agent.coreui.primitives.AppText
import com.harness.agent.coreui.primitives.AppTextStyle
import com.harness.agent.coreui.primitives.HarnessSegmentedControl
import com.harness.agent.coreui.tokens.LocalHarnessColors

internal data class PreviewModelDef(
    val id: String,
    val label: String,
    val reasoningOptions: List<String>,
)

internal val PREVIEW_MODELS =
    listOf(
        PreviewModelDef("deepseek-chat", "DeepSeek Chat", listOf("off", "low", "high")),
        PreviewModelDef("deepseek-reasoner", "DeepSeek Reasoner", listOf("low", "high", "max")),
        PreviewModelDef("fast", "快速", listOf("off")),
    )

internal fun reasoningShortLabel(effort: String): String =
    when (effort) {
        "off" -> "无"
        "low" -> "轻"
        "high" -> "中"
        "max" -> "高"
        else -> "中"
    }

internal fun formatComposerModelChip(
    modelId: String,
    reasoningEffort: String,
): String {
    val label = PREVIEW_MODELS.find { it.id == modelId }?.label ?: modelId
    return "$label · ${reasoningShortLabel(reasoningEffort)}"
}

internal fun resolveModelIdFromFixtureLabel(label: String): String {
    val normalized = label.lowercase()
    return when {
        normalized.contains("reasoner") -> "deepseek-reasoner"
        normalized.contains("快速") || normalized.contains("fast") -> "fast"
        else -> "deepseek-chat"
    }
}

internal fun resolveReasoningFromFixtureLabel(label: String): String {
    return when {
        label.contains("高") && label.contains("Reasoner") -> "max"
        label.contains("高") -> "high"
        label.contains("轻") -> "low"
        label.contains("无") -> "off"
        else -> "high"
    }
}

internal fun coerceReasoningForModel(
    modelId: String,
    reasoningEffort: String,
): String {
    val allowed = PREVIEW_MODELS.find { it.id == modelId }?.reasoningOptions ?: listOf("high")
    return if (reasoningEffort in allowed) reasoningEffort else allowed.last()
}

@Composable
internal fun ComposerModelMenuSheetContent(
    selectedModelId: String,
    reasoningEffort: String,
    onModelIdChange: (String) -> Unit,
    onReasoningChange: (String) -> Unit,
) {
    val colors = LocalHarnessColors.current
    val activeModel = PREVIEW_MODELS.find { it.id == selectedModelId } ?: PREVIEW_MODELS.first()
    val effort = coerceReasoningForModel(activeModel.id, reasoningEffort)

    Column(modifier = Modifier.fillMaxWidth()) {
        PREVIEW_MODELS.forEach { model ->
            val selected = model.id == activeModel.id
            Row(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .defaultMinSize(minHeight = 48.dp)
                        .clickable {
                            onModelIdChange(model.id)
                            onReasoningChange(coerceReasoningForModel(model.id, effort))
                        }
                        .padding(horizontal = 12.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                AppText(
                    text = model.label,
                    style = if (selected) AppTextStyle.Body else AppTextStyle.Caption,
                    modifier = Modifier.weight(1f),
                )
                if (selected) {
                    Icon(
                        imageVector = Icons.Filled.Check,
                        contentDescription = null,
                        tint = colors.link,
                        modifier = Modifier.padding(start = 8.dp),
                    )
                }
            }
        }
        Spacer(modifier = Modifier.height(16.dp))
        AppText(
            text = "思考强度",
            style = AppTextStyle.Muted,
            modifier = Modifier.padding(horizontal = 12.dp),
        )
        Spacer(modifier = Modifier.height(10.dp))
        HarnessSegmentedControl(
            segments = activeModel.reasoningOptions.map { it to reasoningShortLabel(it) },
            selectedId = effort,
            onSelected = onReasoningChange,
            modifier = Modifier.padding(horizontal = 4.dp),
        )
    }
}

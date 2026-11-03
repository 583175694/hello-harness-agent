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
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.harness.agent.coreui.primitives.AppText
import com.harness.agent.coreui.primitives.AppTextStyle
import com.harness.agent.coreui.primitives.HarnessSegmentedControl
import com.harness.agent.coreui.tokens.LocalHarnessColors
import com.harness.agent.model.ComposerModelOption
import com.harness.agent.model.PREVIEW_COMPOSER_MODELS

internal fun reasoningShortLabel(effort: String): String =
    when (effort) {
        "off" -> "无"
        "low" -> "轻"
        "high" -> "中"
        "max" -> "高"
        else -> "中"
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
    catalog: List<ComposerModelOption> = PREVIEW_COMPOSER_MODELS,
): String {
    val allowed = catalog.find { it.id == modelId }?.reasoningOptions ?: listOf("high")
    return if (reasoningEffort in allowed) reasoningEffort else allowed.last()
}

internal fun formatComposerModelChip(
    modelId: String,
    reasoningEffort: String,
    catalog: List<ComposerModelOption> = PREVIEW_COMPOSER_MODELS,
): String {
    val label = catalog.find { it.id == modelId }?.label ?: modelId
    return "$label · ${reasoningShortLabel(reasoningEffort)}"
}

@Composable
internal fun ComposerModelMenuSheetContent(
    selectedModelId: String,
    reasoningEffort: String,
    onModelIdChange: (String) -> Unit,
    onReasoningChange: (String) -> Unit,
    catalog: List<ComposerModelOption> = PREVIEW_COMPOSER_MODELS,
) {
    val colors = LocalHarnessColors.current
    val models = catalog.ifEmpty { PREVIEW_COMPOSER_MODELS }
    val activeModel = models.find { it.id == selectedModelId } ?: models.first()
    val effort = coerceReasoningForModel(activeModel.id, reasoningEffort, models)

    Column(modifier = Modifier.fillMaxWidth()) {
        models.forEach { model ->
            val selected = model.id == activeModel.id
            Row(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .defaultMinSize(minHeight = 48.dp)
                        .clickable {
                            onModelIdChange(model.id)
                            onReasoningChange(coerceReasoningForModel(model.id, effort, models))
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
                        imageVector = Icons.Rounded.Check,
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

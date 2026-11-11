package com.harness.agent.core

import com.harness.agent.model.ComposerModelOption
import com.harness.mobile.core.api.PublicAgentConfig

fun PublicAgentConfig.toComposerModelOptions(): List<ComposerModelOption> =
    models.map { model ->
        val levels =
            if (model.reasoning.supported && model.reasoning.levels.isNotEmpty()) {
                model.reasoning.levels
            } else {
                listOf(model.reasoning.default.ifBlank { "off" })
            }
        ComposerModelOption(
            id = model.id,
            label = model.label,
            reasoningOptions = levels,
        )
    }

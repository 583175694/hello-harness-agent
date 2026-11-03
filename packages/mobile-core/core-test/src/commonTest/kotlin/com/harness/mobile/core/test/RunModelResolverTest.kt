package com.harness.mobile.core.test

import com.harness.mobile.core.api.PublicAgentConfig
import com.harness.mobile.core.api.PublicModelConfig
import com.harness.mobile.core.api.ReasoningCapability
import com.harness.mobile.core.api.resolveComposerRunModel
import kotlin.test.Test
import kotlin.test.assertEquals

class RunModelResolverTest {
    private val config =
        PublicAgentConfig(
            defaultModel = "model-a",
            models =
                listOf(
                    PublicModelConfig(
                        id = "model-a",
                        label = "A",
                        reasoning = ReasoningCapability(true, listOf("off", "high"), "off"),
                    ),
                    PublicModelConfig(
                        id = "model-b",
                        label = "B",
                        reasoning = ReasoningCapability(true, listOf("low", "medium"), "medium"),
                    ),
                ),
        )

    @Test
    fun usesDefaultWhenModelOmitted() {
        val (model, reasoning) = resolveComposerRunModel(config, null, null)
        assertEquals("model-a", model)
        assertEquals("off", reasoning)
    }

    @Test
    fun coercesInvalidReasoningToModelDefault() {
        val (model, reasoning) = resolveComposerRunModel(config, "model-b", "high")
        assertEquals("model-b", model)
        assertEquals("medium", reasoning)
    }
}

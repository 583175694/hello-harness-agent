package com.harness.agent.preview

import com.harness.agent.model.ActiveSessionState
import com.harness.agent.model.ConversationItem
import com.harness.agent.model.ReplayConfig
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch

class ReplayController(
    private val scope: CoroutineScope,
) {
    private var job: Job? = null

    fun cancel() {
        job?.cancel()
        job = null
    }

    fun startAssistantTailIfNeeded(
        stateFlow: MutableStateFlow<ActiveSessionState>,
        config: ReplayConfig?,
    ) {
        cancel()
        val configNonNull = config ?: return
        val state = stateFlow.value
        val index = state.conversation.indexOfLast { it is ConversationItem.Assistant }
        if (index < 0) return
        val assistant = state.conversation[index] as ConversationItem.Assistant
        val target = assistant.tailTarget ?: return
        if (assistant.deliveryStatus != "streaming") return

        job =
            scope.launch {
                var end = 0
                while (end < target.length) {
                    delay(configNonNull.tickMs)
                    end = (end + configNonNull.codepointsPerTick).coerceAtMost(target.length)
                    val slice = target.substring(0, end)
                    stateFlow.value = stateFlow.value.withAssistantAt(index) { it.copy(pendingText = slice) }
                }
                stateFlow.value =
                    stateFlow.value.withAssistantAt(index) {
                        it.copy(
                            deliveryStatus = "completed",
                            pendingText = null,
                            summary = null,
                            markdownContent = target,
                            tailTarget = null,
                        )
                    }
            }
    }

    private fun ActiveSessionState.withAssistantAt(
        index: Int,
        transform: (ConversationItem.Assistant) -> ConversationItem.Assistant,
    ): ActiveSessionState {
        if (index !in conversation.indices) return this
        val item = conversation[index]
        if (item !is ConversationItem.Assistant) return this
        val updated = conversation.toMutableList()
        updated[index] = transform(item)
        return copy(conversation = updated)
    }
}

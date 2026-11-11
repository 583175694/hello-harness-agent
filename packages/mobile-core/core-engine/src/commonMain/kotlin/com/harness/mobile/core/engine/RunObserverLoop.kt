package com.harness.mobile.core.engine

import com.harness.mobile.core.api.ApiProblem
import com.harness.mobile.core.api.EngineConfig
import com.harness.mobile.core.api.isAuthRequired
import com.harness.mobile.core.api.RunStreamEvent
import com.harness.mobile.core.data.HarnessRunsClient
import com.harness.mobile.core.data.RunSseSubscriber
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlin.coroutines.coroutineContext

/**
 * Aligns with [observeRunConnection] in agent-conversation / Web:
 * getRun once per connect attempt, then SSE only (no periodic getRun during subscribe).
 */
internal class RunObserverLoop(
    config: EngineConfig,
) {
    private val runsClient = HarnessRunsClient.create(config)
    private val sse = RunSseSubscriber.create(config)
    private val reducer = RunLiveReducer()

    suspend fun observeRun(
        initial: LiveRunState,
        skipInitialSnapshot: Boolean = false,
        onState: suspend (LiveRunState, Boolean) -> Unit,
        onTerminal: suspend (LiveRunState) -> Unit,
        onReconnecting: suspend () -> Unit = {},
        onConnected: suspend () -> Unit = {},
    ) {
        var live = initial
        var lastFailure: Exception? = null
        onState(live, true)

        for ((index, delayMs) in OBSERVER_RETRY_DELAYS_MS.withIndex()) {
            if (delayMs > 0) delay(delayMs)
            if (!coroutineContext.isActive) return

            if (!(skipInitialSnapshot && index == 0)) {
                live =
                    try {
                        reducer.applySnapshot(live, runsClient.getRun(live.runId))
                    } catch (error: Exception) {
                        lastFailure = error
                        if (error.isAuthFailure()) throw error
                        if (index == OBSERVER_RETRY_DELAYS_MS.lastIndex) break
                        continue
                    }
                onConnected()
                onState(live, true)
                if (isTerminal(live.deliveryStatus)) {
                    onTerminal(live)
                    return
                }
            }

            try {
                var terminal = false
                // Last-Event-ID: 0 → server tail_replay for events emitted before subscribe.
                sse.subscribeRun(live.runId, live.cursor) { event ->
                    val result = reducer.applyEvent(live, event)
                    if (result.gap) {
                        throw RunSseGapException(live.runId)
                    }
                    if (!result.duplicate) {
                        live = result.state
                        onState(live, event.type.publishesRunUiImmediately())
                    }
                    if (isTerminalEvent(event) || isTerminal(live.deliveryStatus)) {
                        terminal = true
                    }
                }
                if (terminal) {
                    onTerminal(live)
                    return
                }
                lastFailure = RunSseGapException(live.runId)
            } catch (error: Exception) {
                if (!coroutineContext.isActive) return
                if (error.isAuthFailure()) throw error
                lastFailure = error
            }
        }

        onReconnecting()
        val finalState =
            observeWithReconnectBudget(
                live = live,
                onState = onState,
                onConnected = onConnected,
            )
        if (finalState != null) {
            onTerminal(finalState)
            return
        }
        throw lastFailure ?: RunSseGapException(live.runId)
    }

    /** Returns a terminal state when the run finished while reconnecting, otherwise null. */
    private suspend fun observeWithReconnectBudget(
        live: LiveRunState,
        onState: suspend (LiveRunState, Boolean) -> Unit,
        onConnected: suspend () -> Unit,
    ): LiveRunState? {
        var current = live
        for (waitMs in RunObserverSchedule.reconnectWaitPlan()) {
            delay(waitMs)
            if (!coroutineContext.isActive) return null

            val snapshot =
                try {
                    runsClient.getRun(current.runId)
                } catch (error: Exception) {
                    if (!coroutineContext.isActive) return null
                    if (error.isAuthFailure()) throw error
                    continue
                }
            current = reducer.applySnapshot(current, snapshot)
            onState(current, true)

            try {
                var terminal = false
                onConnected()
                sse.subscribeRun(current.runId, current.cursor) { event ->
                    val result = reducer.applyEvent(current, event)
                    if (result.gap) {
                        throw RunSseGapException(current.runId)
                    }
                    if (!result.duplicate) {
                        current = result.state
                        onState(current, event.type.publishesRunUiImmediately())
                    }
                    if (isTerminalEvent(event) || isTerminal(current.deliveryStatus)) {
                        terminal = true
                    }
                }
                if (terminal) return current
                if (isTerminal(current.deliveryStatus)) return current
            } catch (error: Exception) {
                if (!coroutineContext.isActive) return null
                if (error.isAuthFailure()) throw error
            }
        }
        return null
    }

    private fun isTerminalEvent(event: RunStreamEvent): Boolean = isTerminalRunStreamEvent(event)

    private fun isTerminal(status: String): Boolean = isRunTerminalStatus(status)
}

private fun Exception.isAuthFailure(): Boolean =
    (this as? ApiProblem)?.problem?.isAuthRequired() == true

object RunObserverSchedule {
    val inConnectionRetryDelaysMs: List<Long> = listOf(0L, 1_000L, 2_000L, 4_000L, 8_000L)
    val reconnectDelaysMs: List<Long> = listOf(30_000L, 60_000L, 120_000L)
    const val reconnectMaxTotalMs: Long = 300_000L

    /** 30s → 60s → 120s 循环，最后一次按剩余预算截断，总时长不超过 5 分钟。 */
    fun reconnectWaitPlan(): List<Long> {
        val plan = mutableListOf<Long>()
        var elapsed = 0L
        var attempt = 0
        while (elapsed < reconnectMaxTotalMs) {
            val waitMs = minOf(reconnectDelaysMs[attempt % reconnectDelaysMs.size], reconnectMaxTotalMs - elapsed)
            plan += waitMs
            elapsed += waitMs
            attempt += 1
        }
        return plan
    }
}

internal val OBSERVER_RETRY_DELAYS_MS = RunObserverSchedule.inConnectionRetryDelaysMs

/** Tool and run lifecycle events paint immediately; text deltas may coalesce one frame. */
internal fun String.publishesRunUiImmediately(): Boolean =
    startsWith("tool.") ||
        startsWith("run.") ||
        this == "model.round.completed" ||
        this == "interrupt.created" ||
        this == "interrupt.resolved" ||
        this == "interrupt.cancelled" ||
        this == "user.intervention"

internal class RunSseGapException(
    val runId: String,
) : Exception("Run SSE gap for $runId")

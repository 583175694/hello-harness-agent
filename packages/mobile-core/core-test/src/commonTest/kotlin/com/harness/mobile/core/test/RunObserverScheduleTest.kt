package com.harness.mobile.core.test

import com.harness.mobile.core.engine.RunObserverSchedule
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class RunObserverScheduleTest {
    @Test
    fun inConnectionRetryStaysShort() {
        assertEquals(listOf(0L, 1_000L, 2_000L, 4_000L, 8_000L), RunObserverSchedule.inConnectionRetryDelaysMs)
    }

    @Test
    fun reconnectBackoffMatchesPlan() {
        assertEquals(listOf(30_000L, 60_000L, 120_000L), RunObserverSchedule.reconnectDelaysMs)
    }

    @Test
    fun reconnectBudgetIsFiveMinutes() {
        assertEquals(300_000L, RunObserverSchedule.reconnectMaxTotalMs)
        assertTrue(RunObserverSchedule.reconnectDelaysMs.sum() < RunObserverSchedule.reconnectMaxTotalMs)
    }

    @Test
    fun reconnectPlanNeverExceedsBudget() {
        val plan = RunObserverSchedule.reconnectWaitPlan()
        assertEquals(300_000L, plan.sum())
        assertTrue(plan.all { it > 0L })
        assertEquals(listOf(30_000L, 60_000L, 120_000L, 30_000L, 60_000L), plan)
    }
}

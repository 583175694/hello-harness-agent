package com.harness.mobile.core.test

import com.harness.mobile.core.api.ConnectionState
import com.harness.mobile.core.api.EngineConfig
import com.harness.mobile.core.engine.DefaultHarnessMobileEngineFactory
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class EngineSmokeTest {
    private fun engine() =
        DefaultHarnessMobileEngineFactory.create(
            EngineConfig(
                apiBaseUrlProvider = { "http://127.0.0.1:4318" },
                getSessionCookieHeader = { null },
            ),
        )

    @Test
    fun engineStartsIdle() {
        assertEquals(ConnectionState.Idle, engine().connectionState.value)
    }

    @Test
    fun workbenchChromeProjectsToActiveSnapshot() {
        val engine = engine()
        runBlocking { engine.beginNewConversation() }
        engine.setWorkbenchOpen(true)
        engine.setFollowMode("pinned")
        val snap = engine.activeSnapshot.value
        assertTrue(snap?.workbenchOpen == true)
        assertEquals("pinned", snap?.followMode)
        engine.setWorkbenchOpen(false)
        assertTrue(engine.activeSnapshot.value?.workbenchOpen == false)
    }

    @Test
    fun setFollowModeNormalizesValues() {
        val engine = engine()
        runBlocking { engine.beginNewConversation() }
        engine.setFollowMode("pinned")
        assertEquals("pinned", engine.activeSnapshot.value?.followMode)
        engine.setFollowMode("other")
        assertEquals("auto", engine.activeSnapshot.value?.followMode)
    }
}

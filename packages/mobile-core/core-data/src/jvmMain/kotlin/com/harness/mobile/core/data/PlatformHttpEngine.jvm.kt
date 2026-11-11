package com.harness.mobile.core.data

import io.ktor.client.engine.HttpClientEngine
import io.ktor.client.engine.cio.CIO

internal actual fun createPlatformHttpEngine(): HttpClientEngine = CIO.create()

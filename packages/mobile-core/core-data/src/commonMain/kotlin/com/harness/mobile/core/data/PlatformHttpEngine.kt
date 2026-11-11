package com.harness.mobile.core.data

import io.ktor.client.engine.HttpClientEngine

internal expect fun createPlatformHttpEngine(): HttpClientEngine

package com.harness.mobile.core.data

import io.ktor.client.engine.HttpClientEngine
import io.ktor.client.engine.okhttp.OkHttp

internal actual fun createPlatformHttpEngine(): HttpClientEngine = OkHttp.create()

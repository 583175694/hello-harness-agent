package com.harness.agent.port

import kotlinx.coroutines.flow.Flow

/** Production Core Port 在 API 失败时发出一次性 Toast 文案。 */
interface ApiErrorToastSource {
    val apiErrorToasts: Flow<String>
}

package com.harness.agent.auth

import com.harness.agent.core.CoreServices
import com.harness.agent.preview.PreviewAuthProfile
import com.harness.agent.ui.settings.LoginCoordinator
import com.harness.mobile.core.api.ApiProblem

class ProductionLoginCoordinator(
    private val services: CoreServices,
) : LoginCoordinator {
    override suspend fun sendVerificationCode(phone: String): Result<Unit> =
        runCatching {
            services.authClient().sendPhoneCode(phone)
        }

    override suspend fun verifyAndLogin(
        phone: String,
        code: String,
    ): Result<PreviewAuthProfile> {
        return runCatching {
            val result = services.authClient().verifyPhone(phone, code)
            services.tokenStore.setToken(result.sessionToken)
            val user = result.user
            PreviewAuthProfile(
                displayName = user.displayName.ifBlank { user.phone ?: phone },
                phone = user.phone ?: phone,
            )
        }.fold(
            onSuccess = { Result.success(it) },
            onFailure = { error ->
                val message =
                    (error as? ApiProblem)?.problem?.detail
                        ?: error.message
                        ?: "Login failed"
                Result.failure(IllegalStateException(message, error))
            },
        )
    }
}

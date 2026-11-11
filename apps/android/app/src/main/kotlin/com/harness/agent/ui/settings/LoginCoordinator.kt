package com.harness.agent.ui.settings

import com.harness.agent.preview.PreviewAuthProfile

interface LoginCoordinator {
    suspend fun sendVerificationCode(phone: String): Result<Unit>

    suspend fun verifyAndLogin(
        phone: String,
        code: String,
    ): Result<PreviewAuthProfile>
}

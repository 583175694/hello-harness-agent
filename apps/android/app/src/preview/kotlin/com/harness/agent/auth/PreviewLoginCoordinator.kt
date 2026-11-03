package com.harness.agent.auth

import com.harness.agent.preview.PreviewAuthProfile
import com.harness.agent.ui.settings.LoginCoordinator

/** Gate A Preview：不发真实 HTTP。 */
object PreviewLoginCoordinator : LoginCoordinator {
    override suspend fun sendVerificationCode(phone: String): Result<Unit> {
        if (phone.trim().length < 6) {
            return Result.failure(IllegalStateException("Invalid phone"))
        }
        return Result.success(Unit)
    }

    override suspend fun verifyAndLogin(
        phone: String,
        code: String,
    ): Result<PreviewAuthProfile> {
        val trimmed = phone.trim()
        if (trimmed.length < 6 || code.trim().length < 4) {
            return Result.failure(IllegalStateException("Invalid credentials"))
        }
        return Result.success(
            PreviewAuthProfile(
                displayName = maskPhone(trimmed),
                phone = trimmed,
            ),
        )
    }

    private fun maskPhone(phone: String): String {
        val digits = phone.filter { it.isDigit() }
        if (digits.length < 7) return phone
        return "${digits.take(3)}****${digits.takeLast(4)}"
    }
}

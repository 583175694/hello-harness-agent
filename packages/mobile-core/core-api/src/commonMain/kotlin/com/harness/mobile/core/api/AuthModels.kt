package com.harness.mobile.core.api

import kotlinx.serialization.Serializable

@Serializable
data class AuthUserView(
    val id: String,
    val displayName: String,
    val email: String? = null,
    val phone: String? = null,
    val role: String = "user",
    val status: String = "active",
)

@Serializable
data class AuthLoginResponse(
    val user: AuthUserView,
)

data class AuthVerifyResult(
    val user: AuthUserView,
    val sessionToken: String,
)

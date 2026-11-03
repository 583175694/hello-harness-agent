package com.harness.mobile.core.api

/** E15：createRun 失败时 assistant 行展示文案。 */
fun formatCreateRunFailureDetail(failure: Throwable): String {
    val problem = (failure as? ApiProblem)?.problem
    return problem?.detail?.takeIf { it.isNotBlank() }
        ?: problem?.title?.takeIf { it.isNotBlank() }
        ?: failure.message?.takeIf { it.isNotBlank() }
        ?: "无法创建 Run"
}

fun ProblemDetails.isAuthRequired(): Boolean = status == 401 || code == "AUTH_REQUIRED"

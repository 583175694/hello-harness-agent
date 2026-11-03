package com.harness.mobile.core.test

import com.harness.mobile.core.api.ApiProblem
import com.harness.mobile.core.api.ProblemDetails
import com.harness.mobile.core.api.formatCreateRunFailureDetail
import com.harness.mobile.core.api.isAuthRequired
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class CreateRunFailureTest {
    @Test
    fun formatPrefersProblemDetail() {
        val failure =
            ApiProblem(
                ProblemDetails(
                    type = "about:blank",
                    title = "Conflict",
                    status = 409,
                    code = "ACTIVE_RUN",
                    detail = "会话已有进行中的 Run",
                ),
            )
        assertEquals("会话已有进行中的 Run", formatCreateRunFailureDetail(failure))
    }

    @Test
    fun authRequiredDetection() {
        val auth =
            ProblemDetails(
                type = "about:blank",
                title = "Unauthorized",
                status = 401,
                code = "AUTH_REQUIRED",
                detail = "请先登录",
            )
        assertTrue(auth.isAuthRequired())
        assertFalse(
            ProblemDetails("t", "t", 409, "ACTIVE_RUN", "d").isAuthRequired(),
        )
    }
}

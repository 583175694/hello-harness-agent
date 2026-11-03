package com.harness.agent.ui.chat

import com.harness.mobile.core.api.ProblemDetails

fun formatApiProblemToast(problem: ProblemDetails): String =
    formatApiProblemToast(problem.title, problem.detail) ?: "请求失败"

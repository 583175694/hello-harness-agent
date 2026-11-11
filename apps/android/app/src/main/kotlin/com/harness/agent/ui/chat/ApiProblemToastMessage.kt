package com.harness.agent.ui.chat

/** 轻提示文案：优先 detail，必要时附带 title。 */
fun formatApiProblemToast(
    title: String?,
    detail: String?,
): String? {
    val d = detail?.trim().orEmpty()
    val t = title?.trim().orEmpty()
    return when {
        d.isNotBlank() && t.isNotBlank() && !t.equals(d, ignoreCase = true) -> "$t：$d"
        d.isNotBlank() -> d
        t.isNotBlank() -> t
        else -> null
    }
}

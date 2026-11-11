package com.harness.mobile.core.api

private val SKILL_NAME_PATTERN = Regex("^[a-z0-9][a-z0-9._-]*$", RegexOption.IGNORE_CASE)

/** 对齐 createRunRequestSchema.skillNames；非法项丢弃。 */
fun normalizeSkillNameForRun(raw: String): String? {
    val normalized = raw.trim().removePrefix("/").trim()
    if (normalized.isEmpty()) return null
    if (!SKILL_NAME_PATTERN.matches(normalized)) return null
    return normalized
}

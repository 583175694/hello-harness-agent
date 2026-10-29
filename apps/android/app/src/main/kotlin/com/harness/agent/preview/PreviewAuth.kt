package com.harness.agent.preview

enum class PreviewComposerBlockKind {
    NONE,
    LOGIN_REQUIRED,
    TRANSCRIPT_INCOMPATIBLE,
}

data class PreviewAuthProfile(
    val displayName: String,
    val phone: String,
)

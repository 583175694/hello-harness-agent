package com.harness.agent.model

data class UserAttachmentItem(
    val fileId: String,
    val fileName: String,
    val mediaType: String,
    val size: Int = 0,
    val previewUrl: String? = null,
    val fileKind: String? = null,
)

data class ComposerAttachmentItem(
    val id: String,
    val fileName: String,
    val mediaType: String,
    val status: String,
    val previewUri: String? = null,
)

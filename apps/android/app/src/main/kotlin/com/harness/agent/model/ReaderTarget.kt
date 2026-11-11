package com.harness.agent.model

data class ReaderTarget(
    val artifactId: String? = null,
    val fileId: String? = null,
    val fileName: String = "文件",
    val mediaType: String = "",
    val fileKind: String = "",
)

data class ArtifactPreviewPayload(
    val bytes: ByteArray,
    val contentType: String,
    val fileName: String,
    val binary: Boolean,
)

data class ArtifactDownloadPayload(
    val bytes: ByteArray,
    val contentType: String,
    val fileName: String,
)

fun ArtifactItem.toReaderTarget(): ReaderTarget =
    ReaderTarget(
        artifactId = artifactId.takeIf { it.isNotBlank() },
        fileId = fileId.takeIf { it.isNotBlank() },
        fileName = fileName,
        mediaType = mediaType,
        fileKind = fileKind,
    )

fun WorkbenchDeliverableFile.toReaderTarget(): ReaderTarget =
    ReaderTarget(
        artifactId = artifactId.takeIf { it.isNotBlank() },
        fileId = fileId.takeIf { it.isNotBlank() },
        fileName = fileName,
        mediaType = mediaType,
        fileKind = fileKind,
    )

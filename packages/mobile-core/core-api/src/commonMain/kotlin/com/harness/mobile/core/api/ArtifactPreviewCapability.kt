package com.harness.mobile.core.api

/** 与 Web `ArtifactPreviewBody` 决策树对齐；平台 UI 据此选择渲染路径。 */
enum class ArtifactPreviewMode {
    InlineText,
    InlineImage,
    RemoteAuthenticatedUrl,
    ExternalOpen,
    DownloadOnly,
}

object ArtifactPreviewCapability {
  fun resolve(ref: ArtifactRef): ArtifactPreviewMode = resolve(ref.fileKind, ref.mediaType, ref.fileName)

    fun resolve(
        fileKind: String,
        mediaType: String,
        fileName: String,
    ): ArtifactPreviewMode {
        val kind = fileKind.lowercase()
        val type = mediaType.lowercase()
        val name = fileName.lowercase()
        if (kind == "html" || type.contains("html")) {
            return ArtifactPreviewMode.RemoteAuthenticatedUrl
        }
        if (type.startsWith("image/") || kind == "image") {
            return ArtifactPreviewMode.InlineImage
        }
        if (isNormalizedDocument(kind, name, type)) {
            return ArtifactPreviewMode.InlineText
        }
        if (
            kind in setOf("markdown", "text", "json", "csv") ||
                type.startsWith("text/") ||
                type.contains("json")
        ) {
            return ArtifactPreviewMode.InlineText
        }
        if (requiresExternalDocumentOpener(kind, type)) {
            return ArtifactPreviewMode.ExternalOpen
        }
        return ArtifactPreviewMode.DownloadOnly
    }

    private fun isNormalizedDocument(
        kind: String,
        name: String,
        type: String,
    ): Boolean {
        if (kind in setOf("docx", "xlsx", "pptx", "pdf")) return true
        if (name.endsWith(".docx") || name.endsWith(".xlsx") || name.endsWith(".pptx") || name.endsWith(".pdf")) {
            return true
        }
        return type.contains("wordprocessingml") ||
            type.contains("spreadsheetml") ||
            type.contains("presentationml") ||
            type.contains("pdf")
    }

    private fun requiresExternalDocumentOpener(
        kind: String,
        type: String,
    ): Boolean =
        kind in setOf("docx", "xlsx", "pptx", "pdf") ||
            type.contains("wordprocessingml") ||
            type.contains("spreadsheetml") ||
            type.contains("presentationml") ||
            type.contains("pdf")
}

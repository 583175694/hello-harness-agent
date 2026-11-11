package com.harness.agent.media

/** 将服务端相对 preview 路径转为可请求的绝对 URL（COS 内容经 API 代理，非直连桶）。 */
fun resolveArtifactPreviewUrl(
    apiBaseUrl: String,
    artifactId: String,
): String? {
    val base = apiBaseUrl.trim().removeSuffix("/")
    if (base.isEmpty() || artifactId.isBlank()) return null
    return "$base/api/agent/artifacts/${artifactId.trim()}/preview"
}

fun resolveAgentFilePreviewUrl(
    apiBaseUrl: String,
    fileId: String,
): String? {
    val base = apiBaseUrl.trim().removeSuffix("/")
    if (base.isEmpty() || fileId.isBlank()) return null
    return "$base/api/agent/files/${fileId.trim()}/preview"
}

fun resolveAttachmentPreviewUri(
    apiBaseUrl: String,
    fileId: String,
    serverPreviewUrl: String?,
    localPreviewUri: String?,
): String? {
    localPreviewUri?.trim()?.takeIf { it.isNotEmpty() }?.let { return it }
    normalizePreviewUri(apiBaseUrl, serverPreviewUrl, fileId)?.let { return it }
    return resolveAgentFilePreviewUrl(apiBaseUrl, fileId)
}

fun normalizePreviewUri(
    apiBaseUrl: String,
    preview: String?,
    fileId: String,
): String? {
    val raw = preview?.trim().orEmpty()
    if (raw.isEmpty()) return null
    if (isLocalPreviewUri(raw)) return raw
    if (raw.startsWith("http://", ignoreCase = true) || raw.startsWith("https://", ignoreCase = true)) {
        return raw
    }
    val base = apiBaseUrl.trim().removeSuffix("/")
    if (base.isEmpty()) return null
    return if (raw.startsWith("/")) "$base$raw" else "$base/$raw"
}

fun isLocalPreviewUri(uri: String): Boolean =
    uri.startsWith("content://", ignoreCase = true) ||
        uri.startsWith("file://", ignoreCase = true)

fun needsSessionCookieForPreview(uri: String): Boolean = !isLocalPreviewUri(uri)

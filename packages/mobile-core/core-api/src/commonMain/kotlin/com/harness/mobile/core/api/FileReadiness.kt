package com.harness.mobile.core.api

import kotlinx.coroutines.delay

/** 对齐 Web：上传后 `processing` 时轮询 `GET /api/agent/files/:id` 直至可发 Run。 */
suspend fun awaitFileReady(
    getFile: suspend (fileId: String) -> FileRef,
    fileId: String,
    maxAttempts: Int = 40,
    delayMs: Long = 500L,
): FileRef {
    repeat(maxAttempts) {
        val ref = getFile(fileId)
        when (ref.status) {
            "ready" -> return ref
            "failed", "rejected" ->
                error(ref.errorCode ?: "文件处理失败（${ref.status}）")
            else -> delay(delayMs)
        }
    }
    error("文件处理超时")
}

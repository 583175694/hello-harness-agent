package com.harness.mobile.core.engine

import com.harness.mobile.core.api.FileRef

/**
 * Composer attachments are scoped to the session that will receive the next run.
 * Public for cross-module contract tests; the engine still owns mutation.
 */
class SessionAttachmentQueue {
    private val bySession = mutableMapOf<String, MutableList<FileRef>>()

    fun add(sessionId: String, file: FileRef) {
        bySession.getOrPut(sessionId) { mutableListOf() }.apply {
            removeAll { it.fileId == file.fileId }
            add(file)
        }
    }

    fun refs(sessionId: String): List<FileRef> = bySession[sessionId].orEmpty().toList()

    fun fileIds(sessionId: String): List<String> = refs(sessionId).map { it.fileId }

    fun remove(fileId: String) {
        bySession.values.forEach { refs -> refs.removeAll { it.fileId == fileId } }
    }

    fun clear(sessionId: String) {
        bySession.remove(sessionId)
    }

    fun clearAll() {
        bySession.clear()
    }
}

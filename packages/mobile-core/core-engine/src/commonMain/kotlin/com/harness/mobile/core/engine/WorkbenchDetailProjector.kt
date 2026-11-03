package com.harness.mobile.core.engine

import com.harness.mobile.core.api.MobileWorkbenchActivityEvent
import com.harness.mobile.core.api.MobileWorkbenchSnapshot
import com.harness.mobile.core.api.MobileWorkbenchSource
import com.harness.mobile.core.api.MobileWorkbenchToolExecution
import com.harness.mobile.core.api.RunDetailResponse
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

object WorkbenchDetailProjector {
    fun fromRunDetail(detail: RunDetailResponse): MobileWorkbenchSnapshot {
        val executions = detail.executions.mapNotNull(::parseExecution)
        val sources = detail.sources.mapNotNull(::parseSource)
        val reportMarkdown = extractReportMarkdown(detail.blocks)
        val bashSnippet = extractBashSnippet(detail.blocks, executions)
        val timeline =
            executions.map { exec ->
                MobileWorkbenchActivityEvent(
                    id = exec.id,
                    kind = "tool",
                    title = exec.title,
                    status = exec.status,
                    highlighted = exec.status == "running",
                )
            }
        val linkedIndexes = linkSourcesToTools(executions, sources)
        val toolExecutions =
            executions.mapIndexed { index, exec ->
                exec.copy(linkedSourceIndexes = linkedIndexes[index])
            }
        val count = executions.size + if (sources.isNotEmpty()) 1 else 0
        val initialView =
            when {
                sources.isNotEmpty() && executions.isEmpty() -> "sources"
                reportMarkdown != null -> "report"
                else -> "activity"
            }
        val sourcesRetrievalOnly =
            sources.isNotEmpty() &&
                executions.isNotEmpty() &&
                executions.all { it.toolName == "web_search" } &&
                sources.all { it.passageBody.isNullOrBlank() }
        return MobileWorkbenchSnapshot(
            runId = detail.runId,
            initialView = initialView,
            initialSheetIndex = if (sources.isNotEmpty()) 2 else 2,
            workbenchCount = count.coerceAtLeast(if (sources.isNotEmpty() || executions.isNotEmpty()) 1 else 0),
            hasDeliverables = executions.isNotEmpty() || sources.isNotEmpty() || reportMarkdown != null,
            activityEmphasis = if (sources.isNotEmpty()) "sources" else "default",
            activityTimeline = timeline,
            toolExecutions = toolExecutions,
            sources = sources,
            sourcesRetrievalOnly = sourcesRetrievalOnly,
            reportMarkdown = reportMarkdown,
            bashSnippet = bashSnippet,
        )
    }

    /** R11 / O5：保留用户已打开的 detent / tab 偏好，只合并 deliverables。 */
    fun mergeDeliverables(
        incoming: MobileWorkbenchSnapshot,
        previous: MobileWorkbenchSnapshot?,
    ): MobileWorkbenchSnapshot {
        if (previous == null) return incoming
        return incoming.copy(
            initialView = previous.initialView,
            initialSheetIndex = previous.initialSheetIndex,
            activityEmphasis = previous.activityEmphasis,
        )
    }

    private fun parseExecution(element: JsonElement): MobileWorkbenchToolExecution? {
        val obj = element as? JsonObject ?: return null
        val toolCallId = obj.string("toolCallId") ?: return null
        val toolName = obj.string("toolName") ?: "tool"
        val status = obj.string("status") ?: "completed"
        val durationMs = obj.int("durationMs") ?: 0
        val input = obj["input"]?.jsonObject
        val title = toolTitle(toolName, input)
        val inputSummary = toolInputSummary(toolName, input)
        val outputPreview = obj.string("outputPreview")
        val bashOutput =
            if (toolName == "bash") {
                outputPreview ?: input?.string("command")
            } else {
                null
            }
        return MobileWorkbenchToolExecution(
            id = toolCallId,
            toolName = toolName,
            title = title,
            inputSummary = inputSummary,
            outputSummary = outputPreview?.takeIf { it.isNotBlank() },
            detail = toolDetail(status, toolName),
            status = status,
            elapsed = formatDuration(durationMs),
            bashOutput = bashOutput,
        )
    }

    private fun parseSource(element: JsonElement): MobileWorkbenchSource? {
        val obj = element as? JsonObject ?: return null
        val finalUrl = obj.string("finalUrl")
        return if (finalUrl != null) {
            val passages = obj["passages"]?.jsonArray
            val firstPassage = passages?.firstOrNull()?.jsonObject
            MobileWorkbenchSource(
                title = obj.string("title") ?: finalUrl,
                url = finalUrl,
                snippet =
                    firstPassage?.string("text")
                        ?: "已读取网页，但没有匹配当前问题的原文片段。",
                passageHeading = firstPassage?.string("heading"),
                passageBody = firstPassage?.string("text"),
            )
        } else {
            MobileWorkbenchSource(
                title = obj.string("title") ?: obj.string("url") ?: "来源",
                url = obj.string("url") ?: "",
                snippet = obj.string("snippet") ?: "",
            )
        }
    }

    private fun extractReportMarkdown(blocks: List<JsonElement>): String? {
        val parts = mutableListOf<String>()
        for (element in blocks) {
            val obj = element as? JsonObject ?: continue
            when (obj.string("type")) {
                "text" -> {
                    if (obj.string("phase") == "final" || obj.string("phase") == null) {
                        obj.string("content")?.let { parts += it }
                    }
                }
                "report" -> {
                    obj.string("markdown")?.let { return it }
                    obj.string("content")?.let { return it }
                }
            }
        }
        return parts.joinToString("\n\n").ifBlank { null }
    }

    private fun extractBashSnippet(
        blocks: List<JsonElement>,
        executions: List<MobileWorkbenchToolExecution>,
    ): String? {
        executions.firstOrNull { it.toolName == "bash" }?.bashOutput?.let { return it }
        for (element in blocks) {
            val obj = element as? JsonObject ?: continue
            if (obj.string("type") == "tool_activity" && obj.string("toolName") == "bash") {
                obj.string("summary")?.let { return it }
            }
        }
        return null
    }

    private fun linkSourcesToTools(
        executions: List<MobileWorkbenchToolExecution>,
        sources: List<MobileWorkbenchSource>,
    ): List<List<Int>> {
        if (sources.isEmpty()) return executions.map { emptyList() }
        return executions.map { exec ->
            when (exec.toolName) {
                "web_search", "web_fetch" -> sources.indices.toList()
                else -> emptyList()
            }
        }
    }

    private fun toolTitle(
        toolName: String,
        input: JsonObject?,
    ): String =
        when (toolName) {
            "web_search" -> "网页检索"
            "web_fetch" -> input?.string("title") ?: input?.string("url") ?: "读取网页"
            "bash" -> "终端"
            "read_file", "read_file_lines", "search_file" -> input?.string("fileName") ?: "文件"
            "create_report" -> "生成报告"
            else -> toolName
        }

    private fun toolInputSummary(
        toolName: String,
        input: JsonObject?,
    ): String =
        when (toolName) {
            "web_search" -> input?.string("query") ?: ""
            "bash" -> input?.string("command") ?: ""
            "web_fetch" -> input?.string("url") ?: input?.string("title") ?: ""
            "read_file", "read_file_lines", "search_file" ->
                input?.string("fileName") ?: input?.string("query") ?: ""
            else -> input?.string("message") ?: input?.toString().orEmpty()
        }

    private fun toolDetail(
        status: String,
        toolName: String,
    ): String? =
        when (status) {
            "failed" -> "执行失败"
            "cancelled" -> "已取消"
            "completed" -> if (toolName == "bash") "已完成" else null
            else -> null
        }

    private fun formatDuration(durationMs: Int): String? {
        if (durationMs <= 0) return null
        return if (durationMs < 1000) {
            "$durationMs 毫秒"
        } else {
            val tenths = (durationMs + 50) / 100
            "${tenths / 10}.${tenths % 10} 秒"
        }
    }

    private fun JsonObject.string(key: String): String? =
        this[key]?.jsonPrimitive?.contentOrNull?.takeIf { it.isNotBlank() }

    private fun JsonObject.int(key: String): Int? = this[key]?.jsonPrimitive?.intOrNull
}

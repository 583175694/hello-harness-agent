package com.harness.agent.preview

import android.content.Context
import com.harness.agent.model.ActiveSessionState
import com.harness.agent.model.ChromeState
import com.harness.agent.model.ClarificationFixture
import com.harness.agent.model.ComposerState
import com.harness.agent.model.FollowUpFixture
import com.harness.agent.model.PlanFixture
import com.harness.agent.model.PreviewComposerPatch
import com.harness.agent.model.PreviewTransitionBundle
import com.harness.agent.model.PlanStepFixture
import com.harness.agent.model.ToolApprovalFixture
import com.harness.agent.model.ToolApprovalItemFixture
import com.harness.agent.model.ConversationItem
import com.harness.agent.model.ProcessBlock
import com.harness.agent.model.ReplayConfig
import com.harness.agent.model.SessionDrawerItem
import com.harness.agent.model.SessionDrawerState
import com.harness.agent.model.UiHints
import com.harness.agent.model.WorkbenchActivityEvent
import com.harness.agent.model.WorkbenchArtifactVersion
import com.harness.agent.model.WorkbenchDeliverableFile
import com.harness.agent.model.WorkbenchSourceCard
import com.harness.agent.model.WorkbenchState
import com.harness.agent.model.WorkbenchToolExecution
import com.harness.agent.port.PreviewFixtureDescriptor
import org.json.JSONArray
import org.json.JSONObject

class MobileContractPreviewLoader(
    private val context: Context,
) {
    fun listFixtures(): List<PreviewFixtureDescriptor> =
        context.assets.list(FIXTURE_DIR)?.orEmpty()?.filter { it.endsWith(".json") }?.sorted()?.map { file ->
            val json = readFixtureJson(file)
            PreviewFixtureDescriptor(
                fileName = file,
                scenarioId = json.optString("scenarioId", file.removeSuffix(".json")),
                title = json.optString("title", file),
            )
        } ?: emptyList()

    fun load(fileName: String): ActiveSessionState {
        val json = readFixtureJson(fileName)
        return parseActiveSession(json)
    }

    private fun readFixtureJson(fileName: String): JSONObject {
        context.assets.open("$FIXTURE_DIR/$fileName").use { stream ->
            val text = stream.bufferedReader().readText()
            return JSONObject(text)
        }
    }

    private fun parseActiveSession(json: JSONObject): ActiveSessionState {
        val conversation = json.optJSONArray("conversation")?.toConversationItems().orEmpty()
        val composerJson = json.optJSONObject("composer")
        val chromeJson = json.optJSONObject("chrome")
        val problemJson = json.optJSONObject("problemDetails")
        val problemTitle = problemJson?.optString("title")?.ifBlank { null }
        val problem = problemJson?.optString("detail")?.ifBlank { null }
        return ActiveSessionState(
            schemaVersion = json.optInt("schemaVersion", 1),
            scenarioId = json.optString("scenarioId"),
            title = json.optString("title", "Preview"),
            conversation = conversation,
            composer = composerJson.toComposerState(),
            chrome =
                ChromeState(
                    connectionState = chromeJson?.optString("connectionState") ?: "idle",
                    serviceState = chromeJson?.optString("serviceState") ?: "ready",
                    runSummary = chromeJson?.optString("runSummary"),
                    peekBarTitle = chromeJson?.optString("peekBarTitle")?.ifBlank { null },
                    peekBarSubtitle = chromeJson?.optString("peekBarSubtitle")?.ifBlank { null },
                ),
            problemTitle = problemTitle,
            problemDetail = problem,
            sessionDrawer = json.optJSONObject("sessionDrawer")?.toSessionDrawer() ?: SessionDrawerState(),
            uiHints =
                UiHints(
                    initialDrawerOpen = json.optJSONObject("uiHints")?.optBoolean("initialDrawerOpen") ?: false,
                ),
            replay = json.optJSONObject("replay")?.toReplayConfig(),
            workbench = json.optJSONObject("workbench")?.toWorkbenchState() ?: WorkbenchState(),
            previewTransitions = json.optJSONObject("previewTransitions")?.toPreviewTransitions(),
        )
    }

    private fun JSONObject.toPreviewTransitions(): PreviewTransitionBundle =
        PreviewTransitionBundle(
            afterClarification = optJSONObject("afterClarification")?.toTransitionComposerPatch(),
            afterHitlApprove = optJSONObject("afterHitlApprove")?.toTransitionComposerPatch(),
            afterHitlReject = optJSONObject("afterHitlReject")?.toTransitionComposerPatch(),
        )

    private fun JSONObject.toTransitionComposerPatch(): PreviewComposerPatch {
        val comp = optJSONObject("composer") ?: this
        return PreviewComposerPatch(
            mode = comp.optString("mode").ifBlank { null },
            submitting = if (comp.has("submitting")) comp.optBoolean("submitting") else null,
            composerTextMode = comp.optString("composerTextMode").ifBlank { null },
            showPlan = if (comp.has("showPlan")) comp.optBoolean("showPlan") else null,
        )
    }

    private fun JSONObject.toWorkbenchState(): WorkbenchState {
        val sourcesArray = optJSONArray("sources")
        val sources = mutableListOf<WorkbenchSourceCard>()
        if (sourcesArray != null) {
            for (i in 0 until sourcesArray.length()) {
                val row = sourcesArray.getJSONObject(i)
                sources +=
                    WorkbenchSourceCard(
                        title = row.optString("title"),
                        url = row.optString("url"),
                        snippet = row.optString("snippet"),
                        passageHeading = row.optString("passageHeading").ifBlank { null },
                        passageBody = row.optString("passageBody").ifBlank { null },
                    )
            }
        }
        val timelineArray = optJSONArray("activityTimeline")
        val timeline = mutableListOf<WorkbenchActivityEvent>()
        if (timelineArray != null) {
            for (i in 0 until timelineArray.length()) {
                val row = timelineArray.getJSONObject(i)
                timeline +=
                    WorkbenchActivityEvent(
                        id = row.optString("id", "evt-$i"),
                        kind = row.optString("kind", "tool"),
                        title = row.optString("title"),
                        status = row.optString("status", "completed"),
                        highlighted = row.optBoolean("highlighted", false),
                    )
            }
        }
        val versionsArray = optJSONArray("artifactVersions")
        val versions = mutableListOf<WorkbenchArtifactVersion>()
        if (versionsArray != null) {
            for (i in 0 until versionsArray.length()) {
                val row = versionsArray.getJSONObject(i)
                versions +=
                    WorkbenchArtifactVersion(
                        id = row.optString("id", "ver-$i"),
                        label = row.optString("label"),
                        selected = row.optBoolean("selected", false),
                    )
            }
        }
        val toolExecArray = optJSONArray("toolExecutions")
        val toolExecutions = mutableListOf<WorkbenchToolExecution>()
        if (toolExecArray != null) {
            for (i in 0 until toolExecArray.length()) {
                val row = toolExecArray.getJSONObject(i)
                val srcIdx = row.optJSONArray("linkedSourceIndexes")
                val indexes = mutableListOf<Int>()
                if (srcIdx != null) {
                    for (j in 0 until srcIdx.length()) {
                        indexes += srcIdx.optInt(j)
                    }
                }
                toolExecutions +=
                    WorkbenchToolExecution(
                        id = row.optString("id", "tool-$i"),
                        toolName = row.optString("toolName", "tool"),
                        title = row.optString("title"),
                        inputSummary = row.optString("inputSummary"),
                        outputSummary = row.optString("outputSummary").ifBlank { null },
                        detail = row.optString("detail").ifBlank { null },
                        status = row.optString("status", "completed"),
                        elapsed = row.optString("elapsed").ifBlank { null },
                        bashOutput = row.optString("bashOutput").ifBlank { null },
                        linkedSourceIndexes = indexes,
                    )
            }
        }
        val filesArray = optJSONArray("deliverableFiles")
        val deliverableFiles = mutableListOf<WorkbenchDeliverableFile>()
        if (filesArray != null) {
            for (i in 0 until filesArray.length()) {
                val row = filesArray.getJSONObject(i)
                deliverableFiles +=
                    WorkbenchDeliverableFile(
                        id = row.optString("id", "file-$i"),
                        fileName = row.optString("fileName"),
                        subtitle = row.optString("subtitle"),
                        previewMarkdown = row.optString("previewMarkdown").ifBlank { null },
                    )
            }
        }
        val bashSnippet = optString("bashSnippet").ifBlank { null }
        val resolvedToolExecutions =
            if (toolExecutions.isNotEmpty()) {
                toolExecutions
            } else {
                synthesizeToolExecutions(timeline, bashSnippet)
            }
        val resolvedFiles =
            if (deliverableFiles.isNotEmpty()) {
                deliverableFiles
            } else {
                versions.map { ver ->
                    WorkbenchDeliverableFile(
                        id = ver.id,
                        fileName = ver.label.substringBefore(" ·").ifBlank { ver.label },
                        subtitle = ver.label,
                        previewMarkdown = optString("artifactDiffPreview").ifBlank { null },
                    )
                }
            }
        return WorkbenchState(
            initialView = optString("initialView", "activity"),
            initialSheetIndex = optInt("initialSheetIndex", 2).coerceIn(0, 2),
            workbenchCount = optInt("workbenchCount", 0),
            hasDeliverables = if (has("hasDeliverables")) optBoolean("hasDeliverables") else null,
            activityEmphasis = optString("activityEmphasis", "default"),
            activityTimeline = timeline,
            toolExecutions = resolvedToolExecutions,
            deliverableFiles = resolvedFiles,
            bashSnippet = bashSnippet,
            reportMarkdown = optString("reportMarkdown").ifBlank { null },
            sources = sources,
            sourcesRetrievalOnly = optBoolean("sourcesRetrievalOnly", false),
            artifactVersions = versions,
            artifactDiffPreview = optString("artifactDiffPreview").ifBlank { null },
            artifactRestorePrompt = optString("artifactRestorePrompt").ifBlank { null },
            contextJsonPreview = optString("contextJsonPreview").ifBlank { null },
        )
    }

    private fun JSONObject.toReplayConfig(): ReplayConfig? {
        val tail = optJSONObject("assistantTail") ?: return null
        return ReplayConfig(
            tickMs = tail.optLong("tickMs", 100),
            codepointsPerTick = tail.optInt("codepointsPerTick", 6),
        )
    }

    private fun JSONObject.toSessionDrawer(): SessionDrawerState {
        val sessionsArray = optJSONArray("sessions") ?: return SessionDrawerState()
        val sessions = mutableListOf<SessionDrawerItem>()
        for (i in 0 until sessionsArray.length()) {
            val item = sessionsArray.getJSONObject(i)
            sessions +=
                SessionDrawerItem(
                    id = item.optString("id"),
                    title = item.optString("title"),
                    time = item.optString("time"),
                    active = item.optBoolean("active"),
                    pinned = item.optBoolean("pinned"),
                    running = item.optBoolean("running"),
                )
        }
        return SessionDrawerState(
            draftTitle = optString("draftTitle", "新对话"),
            searchPlaceholder = optString("searchPlaceholder", "搜索会话"),
            sessions = sessions,
        )
    }

    private fun JSONArray.toConversationItems(): List<ConversationItem> {
        val items = mutableListOf<ConversationItem>()
        for (i in 0 until length()) {
            val obj = getJSONObject(i)
            when (obj.optString("kind")) {
                "user" ->
                    items +=
                        ConversationItem.User(
                            content = obj.optString("content"),
                        )
                "assistant" -> {
                    val blocks = obj.optJSONArray("blocks")
                    val pendingRaw = obj.optString("pendingText")
                    val deliveryStatus = obj.optString("deliveryStatus", "completed")
                    val streaming = deliveryStatus == "streaming"
                    val joinedBlocks = blocks?.joinTextBlockContent()?.trim().orEmpty()
                    val finalizedBody =
                        when {
                            streaming -> null
                            joinedBlocks.isNotEmpty() -> joinedBlocks
                            pendingRaw.isNotBlank() -> pendingRaw
                            else -> null
                        }
                    items +=
                        ConversationItem.Assistant(
                            deliveryStatus = deliveryStatus,
                            pendingText = if (streaming) null else pendingRaw.ifBlank { null },
                            summary = null,
                            tailTarget = if (streaming) pendingRaw.ifBlank { null } else null,
                            markdownContent = finalizedBody,
                            process = obj.optJSONArray("process")?.toProcessBlocks().orEmpty(),
                        )
                }
            }
        }
        return items
    }

    private fun JSONArray.toProcessBlocks(): List<ProcessBlock> {
        val blocks = mutableListOf<ProcessBlock>()
        for (i in 0 until length()) {
            val obj = getJSONObject(i)
            when (obj.optString("type")) {
                "tool_activity" -> {
                    val item = obj.optJSONObject("item") ?: continue
                    blocks +=
                        ProcessBlock.ToolActivity(
                            id = item.optString("id"),
                            name = item.optString("name"),
                            summary = item.optString("summary"),
                            status = item.optString("status", "completed"),
                            duration = item.optString("duration").ifBlank { null },
                            statusLabel = item.optString("statusLabel").ifBlank { null },
                        )
                }
                "reasoning" ->
                    blocks +=
                        ProcessBlock.Reasoning(
                            content = obj.optString("content"),
                            durationMs = obj.optLong("durationMs").takeIf { it > 0 },
                            streaming = obj.optBoolean("streaming"),
                        )
                "text" ->
                    blocks += ProcessBlock.Text(content = obj.optString("content"))
            }
        }
        return blocks
    }

    private fun JSONObject?.toComposerState(): ComposerState {
        if (this == null) return ComposerState()
        val clarificationJson = optJSONObject("clarification")
        val clarification =
            clarificationJson?.let {
                ClarificationFixture(
                    question = it.optString("question"),
                    options =
                        it.optJSONArray("options")?.let { arr ->
                            (0 until arr.length()).map { i -> arr.getString(i) }
                        } ?: emptyList(),
                    allowFreeText = it.optBoolean("allowFreeText", true),
                )
            }
        val approvalJson = optJSONObject("toolApproval")
        val toolApproval =
            approvalJson?.let {
                val itemsArr = it.optJSONArray("items")
                val items = mutableListOf<ToolApprovalItemFixture>()
                if (itemsArr != null) {
                    for (i in 0 until itemsArr.length()) {
                        val row = itemsArr.getJSONObject(i)
                        items +=
                            ToolApprovalItemFixture(
                                itemId = row.optString("itemId"),
                                toolName = row.optString("toolName"),
                                command = row.optString("command"),
                            )
                    }
                }
                ToolApprovalFixture(
                    title = it.optString("title", "需要批准工具调用"),
                    items = items,
                    sandboxNote = it.optString("sandboxNote").ifBlank { null },
                )
            }
        val skillsArr = optJSONArray("selectedSkills")
        val skills = mutableListOf<String>()
        if (skillsArr != null) {
            for (i in 0 until skillsArr.length()) {
                skills += skillsArr.getString(i)
            }
        }
        val attachmentsArr = optJSONArray("attachmentNames")
        val attachments = mutableListOf<String>()
        if (attachmentsArr != null) {
            for (i in 0 until attachmentsArr.length()) {
                attachments += attachmentsArr.getString(i)
            }
        }
        val planJson = optJSONObject("plan")
        val plan =
            planJson?.let {
                val stepsArr = it.optJSONArray("steps")
                val steps = mutableListOf<PlanStepFixture>()
                if (stepsArr != null) {
                    for (i in 0 until stepsArr.length()) {
                        val row = stepsArr.getJSONObject(i)
                        steps +=
                            PlanStepFixture(
                                step = row.optString("step"),
                                status = row.optString("status", "pending"),
                            )
                    }
                }
                PlanFixture(
                    explanation = it.optString("explanation").ifBlank { null },
                    steps = steps,
                    initialExpanded = it.optBoolean("initialExpanded"),
                )
            }
        val followArr = optJSONArray("followUps")
        val followUps = mutableListOf<FollowUpFixture>()
        if (followArr != null) {
            for (i in 0 until followArr.length()) {
                val row = followArr.getJSONObject(i)
                followUps +=
                    FollowUpFixture(
                        id = row.optString("id", "fu-$i"),
                        content = row.optString("content"),
                    )
            }
        }
        return ComposerState(
            mode = optString("mode", "default"),
            composerTextMode = optString("composerTextMode", "new-run"),
            submitting = optBoolean("submitting"),
            clarification = clarification,
            toolApproval = toolApproval,
            selectedSkills = skills,
            showPlan = optBoolean("showPlan"),
            plan = plan,
            attachmentNames = attachments,
            selectedModelLabel = optString("selectedModelLabel", "默认模型").ifBlank { "默认模型" },
            followUps = followUps,
        )
    }

    private fun synthesizeToolExecutions(
        timeline: List<WorkbenchActivityEvent>,
        bashSnippet: String?,
    ): List<WorkbenchToolExecution> {
        val fromTimeline =
            timeline.map { ev ->
                val toolName =
                    when {
                        ev.kind.contains("bash", ignoreCase = true) -> "bash"
                        ev.title.contains("web_search", ignoreCase = true) -> "web_search"
                        ev.title.contains("search", ignoreCase = true) -> "web_search"
                        ev.title.contains("fetch", ignoreCase = true) -> "web_fetch"
                        ev.title.contains("read", ignoreCase = true) -> "read_file"
                        else -> ev.kind.ifBlank { "tool" }
                    }
                WorkbenchToolExecution(
                    id = ev.id,
                    toolName = toolName,
                    title = ev.title.substringBefore(" ·").ifBlank { ev.title },
                    inputSummary = ev.title,
                    status = ev.status,
                    bashOutput = if (toolName == "bash") bashSnippet else null,
                )
            }
        if (fromTimeline.isNotEmpty()) return fromTimeline
        if (!bashSnippet.isNullOrBlank()) {
            return listOf(
                WorkbenchToolExecution(
                    id = "bash-1",
                    toolName = "bash",
                    title = "bash",
                    inputSummary = "shell",
                    bashOutput = bashSnippet,
                    status = "completed",
                ),
            )
        }
        return emptyList()
    }

    private fun JSONArray.joinTextBlockContent(): String? {
        val parts = mutableListOf<String>()
        for (i in 0 until length()) {
            val block = getJSONObject(i)
            if (block.optString("type") == "text") {
                val content = block.optString("content")
                if (content.isNotBlank()) parts += content
            }
        }
        return parts.joinToString("\n\n").ifBlank { null }
    }

    companion object {
        private const val FIXTURE_DIR = "mobile-contract/fixtures/preview"
    }
}

import Foundation

struct PreviewFixtureDescriptor: Identifiable, Hashable {
    var id: String { fileName }
    let fileName: String
    let scenarioId: String
    let title: String
}

struct ActiveSessionState: Equatable {
    var schemaVersion: Int = 1
    var scenarioId: String = "empty-landing"
    var title: String = "新对话"
    var conversation: [ConversationItem] = []
    var chrome: ChromeState = .init()
    var problemTitle: String?
    var problemDetail: String?
    var sessionDrawer: SessionDrawerState = .init()
    var uiHints: UiHints = .init()
    var replay: ReplayConfig?
    var composer: ComposerState = .init()
    var workbench: WorkbenchState = .init()
    var previewTransitions: PreviewTransitionBundle?
}

enum ConversationItem: Equatable {
    case user(String)
    case assistant(
        status: String,
        pendingText: String?,
        summary: String?,
        tailTarget: String?,
        markdownContent: String?,
        process: [ProcessBlock]
    )
}

struct ChromeState: Equatable {
    var connectionState: String = "idle"
    var serviceState: String = "ready"
    var runSummary: String?
    var peekBarTitle: String?
    var peekBarSubtitle: String?
}

final class MobileContractPreviewLoader {
    func listPreviewFixtures() -> [PreviewFixtureDescriptor] {
        guard let urls = Bundle.main.urls(forResourcesWithExtension: "json", subdirectory: "preview") else {
            return fallbackDescriptors()
        }
        return urls
            .map { $0.lastPathComponent }
            .sorted()
            .compactMap { fileName in
                guard let data = try? Data(contentsOf: urls.first { $0.lastPathComponent == fileName }!),
                      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
                else { return nil }
                return PreviewFixtureDescriptor(
                    fileName: fileName,
                    scenarioId: json["scenarioId"] as? String ?? fileName.replacingOccurrences(of: ".json", with: ""),
                    title: json["title"] as? String ?? fileName
                )
            }
    }

    func load(fileName: String) -> ActiveSessionState {
        let base = fileName.replacingOccurrences(of: ".json", with: "")
        guard let url = Bundle.main.url(forResource: base, withExtension: "json", subdirectory: "preview"),
              let data = try? Data(contentsOf: url),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else {
            return ActiveSessionState(scenarioId: base, title: "Missing \(fileName)")
        }
        return parse(json: json)
    }

    private func parse(json: [String: Any]) -> ActiveSessionState {
        var conversation: [ConversationItem] = []
        if let rows = json["conversation"] as? [[String: Any]] {
            for row in rows {
                let kind = row["kind"] as? String ?? ""
                if kind == "user" {
                    conversation.append(.user(row["content"] as? String ?? ""))
                } else if kind == "assistant" {
                    let status = row["deliveryStatus"] as? String ?? "completed"
                    let pendingRaw = row["pendingText"] as? String
                    let streaming = status == "streaming"
                    let joined = joinTextBlocks(row["blocks"] as? [[String: Any]])
                    let isMarkdown = !streaming && (joined?.contains("```") == true || joined?.contains("\n#") == true || joined?.contains("\n- ") == true)
                    var summary: String?
                    if !streaming, !isMarkdown {
                        if let pendingRaw, !pendingRaw.isEmpty {
                            summary = pendingRaw
                        } else {
                            summary = joined
                        }
                    }
                    conversation.append(
                        .assistant(
                            status: status,
                            pendingText: streaming ? nil : pendingRaw,
                            summary: streaming ? nil : summary,
                            tailTarget: streaming ? pendingRaw : nil,
                            markdownContent: isMarkdown ? joined : nil,
                            process: parseProcess(row["process"] as? [[String: Any]])
                        )
                    )
                }
            }
        }
        let chromeJson = json["chrome"] as? [String: Any]
        let problemJson = json["problemDetails"] as? [String: Any]
        let problemTitle = problemJson?["title"] as? String
        let problem = problemJson?["detail"] as? String
        return ActiveSessionState(
            schemaVersion: json["schemaVersion"] as? Int ?? 1,
            scenarioId: json["scenarioId"] as? String ?? "",
            title: json["title"] as? String ?? "Preview",
            conversation: conversation,
            chrome: ChromeState(
                connectionState: chromeJson?["connectionState"] as? String ?? "idle",
                serviceState: chromeJson?["serviceState"] as? String ?? "ready",
                runSummary: chromeJson?["runSummary"] as? String,
                peekBarTitle: chromeJson?["peekBarTitle"] as? String,
                peekBarSubtitle: chromeJson?["peekBarSubtitle"] as? String
            ),
            problemTitle: problemTitle,
            problemDetail: problem,
            sessionDrawer: parseDrawer(json["sessionDrawer"] as? [String: Any]),
            uiHints: UiHints(
                initialDrawerOpen: (json["uiHints"] as? [String: Any])?["initialDrawerOpen"] as? Bool ?? false
            ),
            replay: parseReplay(json["replay"] as? [String: Any]),
            composer: parseComposer(json["composer"] as? [String: Any]),
            workbench: parseWorkbench(json["workbench"] as? [String: Any]),
            previewTransitions: parsePreviewTransitions(json["previewTransitions"] as? [String: Any])
        )
    }

    private func parsePreviewTransitions(_ json: [String: Any]?) -> PreviewTransitionBundle? {
        guard let json else { return nil }
        return PreviewTransitionBundle(
            afterClarification: parseComposerPatch(json["afterClarification"] as? [String: Any]),
            afterHitlApprove: parseComposerPatch(json["afterHitlApprove"] as? [String: Any]),
            afterHitlReject: parseComposerPatch(json["afterHitlReject"] as? [String: Any])
        )
    }

    private func parseComposerPatch(_ json: [String: Any]?) -> PreviewComposerPatch? {
        guard let json else { return nil }
        let comp = json["composer"] as? [String: Any] ?? json
        return PreviewComposerPatch(
            mode: comp["mode"] as? String,
            submitting: comp["submitting"] as? Bool,
            composerTextMode: comp["composerTextMode"] as? String,
            showPlan: comp["showPlan"] as? Bool
        )
    }

    private func parseWorkbench(_ json: [String: Any]?) -> WorkbenchState {
        guard let json else { return WorkbenchState() }
        let sourcesRaw = json["sources"] as? [[String: Any]] ?? []
        let sources = sourcesRaw.map {
            WorkbenchSourceCard(
                title: $0["title"] as? String ?? "",
                url: $0["url"] as? String ?? "",
                snippet: $0["snippet"] as? String ?? "",
                passageHeading: $0["passageHeading"] as? String,
                passageBody: $0["passageBody"] as? String
            )
        }
        let timelineRaw = json["activityTimeline"] as? [[String: Any]] ?? []
        let timeline = timelineRaw.enumerated().map { index, row in
            WorkbenchActivityEvent(
                id: row["id"] as? String ?? "evt-\(index)",
                kind: row["kind"] as? String ?? "tool",
                title: row["title"] as? String ?? "",
                status: row["status"] as? String ?? "completed",
                highlighted: row["highlighted"] as? Bool ?? false
            )
        }
        let versionsRaw = json["artifactVersions"] as? [[String: Any]] ?? []
        let versions = versionsRaw.enumerated().map { index, row in
            WorkbenchArtifactVersion(
                id: row["id"] as? String ?? "ver-\(index)",
                label: row["label"] as? String ?? "",
                selected: row["selected"] as? Bool ?? false
            )
        }
        let bashSnippet = json["bashSnippet"] as? String
        let toolExecRaw = json["toolExecutions"] as? [[String: Any]] ?? []
        var toolExecutions = toolExecRaw.enumerated().map { index, row in
            WorkbenchToolExecution(
                id: row["id"] as? String ?? "tool-\(index)",
                toolName: row["toolName"] as? String ?? "tool",
                title: row["title"] as? String ?? "",
                inputSummary: row["inputSummary"] as? String ?? "",
                outputSummary: row["outputSummary"] as? String,
                detail: row["detail"] as? String,
                status: row["status"] as? String ?? "completed",
                elapsed: row["elapsed"] as? String,
                bashOutput: row["bashOutput"] as? String,
                linkedSourceIndexes: row["linkedSourceIndexes"] as? [Int] ?? []
            )
        }
        if toolExecutions.isEmpty {
            toolExecutions = synthesizeToolExecutions(timeline: timeline, bashSnippet: bashSnippet)
        }
        let filesRaw = json["deliverableFiles"] as? [[String: Any]] ?? []
        var deliverableFiles = filesRaw.enumerated().map { index, row in
            WorkbenchDeliverableFile(
                id: row["id"] as? String ?? "file-\(index)",
                fileName: row["fileName"] as? String ?? "",
                subtitle: row["subtitle"] as? String ?? "",
                previewMarkdown: row["previewMarkdown"] as? String
            )
        }
        if deliverableFiles.isEmpty {
            deliverableFiles = versions.map { ver in
                WorkbenchDeliverableFile(
                    id: ver.id,
                    fileName: ver.label.components(separatedBy: " ·").first ?? ver.label,
                    subtitle: ver.label,
                    previewMarkdown: json["artifactDiffPreview"] as? String
                )
            }
        }
        return WorkbenchState(
            initialView: json["initialView"] as? String ?? "activity",
            initialSheetIndex: min(max(json["initialSheetIndex"] as? Int ?? 2, 0), 2),
            workbenchCount: json["workbenchCount"] as? Int ?? 0,
            hasDeliverables: json["hasDeliverables"] as? Bool,
            activityTimeline: timeline,
            toolExecutions: toolExecutions,
            deliverableFiles: deliverableFiles,
            bashSnippet: bashSnippet,
            reportMarkdown: json["reportMarkdown"] as? String,
            sources: sources,
            sourcesRetrievalOnly: json["sourcesRetrievalOnly"] as? Bool ?? false,
            artifactVersions: versions,
            artifactDiffPreview: json["artifactDiffPreview"] as? String,
            artifactRestorePrompt: json["artifactRestorePrompt"] as? String,
            contextJsonPreview: json["contextJsonPreview"] as? String
        )
    }

    private func parseComposer(_ json: [String: Any]?) -> ComposerState {
        guard let json else { return ComposerState() }
        let clarJson = json["clarification"] as? [String: Any]
        let clar: ClarificationFixture? = clarJson.map {
            ClarificationFixture(
                question: $0["question"] as? String ?? "",
                options: $0["options"] as? [String] ?? [],
                allowFreeText: $0["allowFreeText"] as? Bool ?? true
            )
        }
        let approvalJson = json["toolApproval"] as? [String: Any]
        let approval: ToolApprovalFixture? = approvalJson.map { row in
            let itemsRaw = row["items"] as? [[String: Any]] ?? []
            let items = itemsRaw.map {
                ToolApprovalItemFixture(
                    itemId: $0["itemId"] as? String ?? UUID().uuidString,
                    toolName: $0["toolName"] as? String ?? "tool",
                    command: $0["command"] as? String ?? ""
                )
            }
            return ToolApprovalFixture(
                title: row["title"] as? String ?? "需要批准工具调用",
                items: items,
                sandboxNote: row["sandboxNote"] as? String
            )
        }
        let planJson = json["plan"] as? [String: Any]
        let plan: PlanFixture? = planJson.map { row in
            let stepsRaw = row["steps"] as? [[String: Any]] ?? []
            let steps = stepsRaw.map {
                PlanStepFixture(
                    step: $0["step"] as? String ?? "",
                    status: $0["status"] as? String ?? "pending"
                )
            }
            return PlanFixture(
                explanation: row["explanation"] as? String,
                steps: steps,
                initialExpanded: row["initialExpanded"] as? Bool ?? false
            )
        }
        return ComposerState(
            mode: json["mode"] as? String ?? "default",
            composerTextMode: json["composerTextMode"] as? String ?? "new-run",
            submitting: json["submitting"] as? Bool ?? false,
            clarification: clar,
            toolApproval: approval,
            selectedSkills: json["selectedSkills"] as? [String] ?? [],
            showPlan: json["showPlan"] as? Bool ?? false,
            plan: plan,
            attachmentNames: json["attachmentNames"] as? [String] ?? [],
            selectedModelLabel: json["selectedModelLabel"] as? String ?? "默认模型",
            followUps: parseFollowUps(json["followUps"] as? [[String: Any]])
        )
    }

    private func parseFollowUps(_ rows: [[String: Any]]?) -> [FollowUpFixture] {
        guard let rows else { return [] }
        return rows.enumerated().map { index, row in
            FollowUpFixture(
                id: row["id"] as? String ?? "fu-\(index)",
                content: row["content"] as? String ?? ""
            )
        }
    }

    private func parseReplay(_ json: [String: Any]?) -> ReplayConfig? {
        guard let tail = json?["assistantTail"] as? [String: Any] else { return nil }
        return ReplayConfig(
            tickMs: UInt64(tail["tickMs"] as? Int ?? 100),
            codepointsPerTick: tail["codepointsPerTick"] as? Int ?? 6
        )
    }

    private func parseDrawer(_ json: [String: Any]?) -> SessionDrawerState {
        guard let json else { return SessionDrawerState() }
        let rows = json["sessions"] as? [[String: Any]] ?? []
        let sessions = rows.map { row in
            SessionDrawerItem(
                id: row["id"] as? String ?? UUID().uuidString,
                title: row["title"] as? String ?? "",
                time: row["time"] as? String ?? "",
                active: row["active"] as? Bool ?? false,
                pinned: row["pinned"] as? Bool ?? false,
                running: row["running"] as? Bool ?? false
            )
        }
        return SessionDrawerState(
            draftTitle: json["draftTitle"] as? String ?? "新对话",
            searchPlaceholder: json["searchPlaceholder"] as? String ?? "搜索会话",
            sessions: sessions
        )
    }

    private func parseProcess(_ rows: [[String: Any]]?) -> [ProcessBlock] {
        guard let rows else { return [] }
        var result: [ProcessBlock] = []
        for row in rows {
            let type = row["type"] as? String ?? ""
            switch type {
            case "tool_activity":
                guard let item = row["item"] as? [String: Any] else { continue }
                result.append(
                    .toolActivity(
                        id: item["id"] as? String ?? "",
                        name: item["name"] as? String ?? "tool",
                        summary: item["summary"] as? String ?? "",
                        status: item["status"] as? String ?? "completed",
                        duration: item["duration"] as? String
                    )
                )
            case "reasoning":
                result.append(
                    .reasoning(
                        content: row["content"] as? String ?? "",
                        durationMs: row["durationMs"] as? Int,
                        streaming: row["streaming"] as? Bool ?? false
                    )
                )
            case "text":
                result.append(.text(row["content"] as? String ?? ""))
            default:
                break
            }
        }
        return result
    }

    private func joinTextBlocks(_ blocks: [[String: Any]]?) -> String? {
        guard let blocks else { return nil }
        let parts = blocks.compactMap { block -> String? in
            guard block["type"] as? String == "text" else { return nil }
            let content = block["content"] as? String ?? ""
            return content.isEmpty ? nil : content
        }
        let joined = parts.joined(separator: "\n\n")
        return joined.isEmpty ? nil : joined
    }

    private func synthesizeToolExecutions(
        timeline: [WorkbenchActivityEvent],
        bashSnippet: String?
    ) -> [WorkbenchToolExecution] {
        var list = timeline.map { ev in
            let toolName: String = {
                let t = ev.title.lowercased()
                if ev.kind.contains("bash") || t.contains("bash") { return "bash" }
                if t.contains("web_search") || t.contains("search") { return "web_search" }
                if t.contains("fetch") { return "web_fetch" }
                if t.contains("read") { return "read_file" }
                return ev.kind.isEmpty ? "tool" : ev.kind
            }()
            return WorkbenchToolExecution(
                id: ev.id,
                toolName: toolName,
                title: ev.title.components(separatedBy: " ·").first ?? ev.title,
                inputSummary: ev.title,
                status: ev.status,
                elapsed: nil,
                bashOutput: toolName == "bash" ? bashSnippet : nil
            )
        }
        if list.isEmpty, let bash = bashSnippet?.trimmingCharacters(in: .whitespacesAndNewlines), !bash.isEmpty {
            list = [
                WorkbenchToolExecution(
                    id: "bash-1",
                    toolName: "bash",
                    title: "bash",
                    inputSummary: "shell",
                    status: "completed",
                    bashOutput: bash
                ),
            ]
        }
        return list
    }

    private func fallbackDescriptors() -> [PreviewFixtureDescriptor] {
        [
            "empty-landing.json",
            "streaming-assistant-tail.json",
            "long-thread-scroll.json",
            "process-timeline-tools.json",
            "hitl-clarification.json",
            "hitl-tool-approval.json",
            "workbench-activity-bash.json",
            "workbench-report-markdown.json",
            "workbench-sources.json",
            "connection-offline-error.json",
        ].map {
            PreviewFixtureDescriptor(fileName: $0, scenarioId: $0.replacingOccurrences(of: ".json", with: ""), title: $0)
        }
    }
}

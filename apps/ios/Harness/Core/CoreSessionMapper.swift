import Foundation

#if CORE_PORT
import HarnessMobileCore

enum CoreSessionMapper {
    static func merge(
        snapshot: MobileActiveSessionSnapshot?,
        connection: ConnectionState,
        problem: ProblemDetails?
    ) -> ActiveSessionState {
        let conversation: [ConversationItem] =
            snapshot?.conversation.compactMap { line -> ConversationItem? in
                let kind = line.kind
                if kind == "user" {
                    let attachments =
                        line.attachments.map { attachment in
                            UserAttachmentItem(
                                fileId: attachment.fileId,
                                fileName: attachment.fileName,
                                previewUrl: attachment.previewUrl
                            )
                        }
                    return .user(content: line.content, attachments: attachments)
                }
                if kind == "assistant" {
                    let status = line.deliveryStatus ?? "completed"
                    let streaming = status == "streaming"
                    let runInProgress = line.pending || streaming
                    let pendingBody = line.pendingText?.trimmingCharacters(in: .whitespacesAndNewlines)
                    let finalBody = line.finalText?.trimmingCharacters(in: .whitespacesAndNewlines)
                    return .assistant(
                        status: status,
                        pending: line.pending,
                        pendingText: runInProgress ? (pendingBody?.isEmpty == false ? pendingBody : nil) : nil,
                        finalText: runInProgress ? (finalBody?.isEmpty == false ? finalBody : nil) : nil,
                        summary: nil,
                        tailTarget: nil,
                        markdownContent: runInProgress ? nil : (finalBody?.isEmpty == false ? finalBody : (line.content.isEmpty ? nil : line.content)),
                        process: !line.process.isEmpty
                            ? line.process.compactMap { block in
                                switch block.kind {
                                case "reasoning": return .reasoning(content: block.content, durationMs: block.durationMs?.intValue, streaming: block.streaming)
                                case "tool": return .toolActivity(id: block.id, name: block.name, summary: block.summary, status: block.status, duration: block.duration)
                                case "text": return .text(block.content)
                                default: return nil
                                }
                            }
                            : (line.reasoning?.isEmpty == false
                            ? [.reasoning(content: line.reasoning!, durationMs: nil, streaming: streaming && line.reasoningStreaming)]
                            : [])
                    )
                }
                return nil
            } ?? []

        let drawerRows: [SessionDrawerItem] =
            snapshot?.drawerSessions.map { row in
                SessionDrawerItem(
                    id: row.id,
                    title: row.title,
                    time: row.timeLabel,
                    active: row.active,
                    pinned: row.pinned,
                    running: row.running
                )
            } ?? []

        var chrome = ChromeState()
        switch connection {
        case .idle:
            chrome.connectionState = "idle"
            chrome.serviceState = "unknown"
        case .connecting:
            chrome.connectionState = "connecting"
            chrome.serviceState = "checking"
        case .live:
            chrome.connectionState = "live"
            chrome.serviceState = "ready"
        case .reconnecting:
            chrome.connectionState = "reconnecting"
            chrome.serviceState = "ready"
        case .offline:
            chrome.connectionState = "offline"
            chrome.serviceState = "unavailable"
        case .serviceunavailable:
            chrome.connectionState = "live"
            chrome.serviceState = "unavailable"
        default:
            chrome.connectionState = "idle"
            chrome.serviceState = "unknown"
        }

        let followUps: [FollowUpFixture] =
            snapshot?.followUps.map { row in
                FollowUpFixture(id: row.id, content: row.content)
            } ?? []

        let clarification = snapshot?.composerClarification
        let toolApproval = snapshot?.composerToolApproval
        let runtimeSteer =
            drawerRows.contains { $0.active && $0.running }
            && clarification == nil
            && toolApproval == nil
        let composerMode: String =
            if clarification != nil {
                "clarification"
            } else if toolApproval != nil {
                "hitl"
            } else {
                "default"
            }
        var composer = ComposerState()
        composer.mode = composerMode
        composer.followUps = followUps
        composer.composerTextMode = runtimeSteer ? "steer" : "new-run"
        composer.submitting = runtimeSteer || (snapshot?.composerSubmitting ?? false)
        composer.clarification =
            clarification.map { row in
                ClarificationFixture(
                    question: row.question,
                    options: row.options as? [String] ?? [],
                    allowFreeText: row.allowFreeText
                )
            }
        composer.toolApproval =
            toolApproval.map { row in
                ToolApprovalFixture(
                    title: row.title,
                    items: row.items.map { item in
                        ToolApprovalItemFixture(
                            itemId: item.itemId,
                            toolName: item.toolName,
                            command: item.command
                        )
                    },
                    sandboxNote: row.sandboxNote
                )
            }
        composer.revisionDraftSeed = snapshot?.composerRevisionSeed

        return ActiveSessionState(
            scenarioId: snapshot?.sessionId ?? "core-landing",
            title: snapshot?.title ?? "新对话",
            conversation: conversation,
            chrome: chrome,
            problemTitle: problem?.title,
            problemDetail: problem?.detail,
            sessionDrawer: SessionDrawerState(sessions: drawerRows),
            uiHints: UiHints(
                workbenchOpen: snapshot?.workbenchOpen ?? false,
                workbenchFocusedToolCallId: snapshot?.workbenchFocusedToolCallId,
                workbenchFocusHint: snapshot?.workbenchFocusHint
            ),
            composer: composer,
            workbench: WorkbenchSnapshotMapper.toUi(snapshot?.workbench),
            canLoadOlderMessages: snapshot?.canLoadOlderMessages ?? false,
            loadingOlderMessages: snapshot?.loadingOlderMessages ?? false
        )
    }
}

#endif

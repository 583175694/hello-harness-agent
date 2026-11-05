import Foundation

struct ReplayConfig: Equatable {
    var tickMs: UInt64 = 100
    var codepointsPerTick: Int = 6
}

final class ReplayController {
    private var task: Task<Void, Never>?

    func cancel() {
        task?.cancel()
        task = nil
    }

    func startAssistantTailIfNeeded(
        config: ReplayConfig?,
        conversation: [ConversationItem],
        onUpdate: @escaping ([ConversationItem]) -> Void
    ) {
        cancel()
        guard let config else { return }
        guard let index = conversation.lastIndex(where: {
            if case .assistant(id: _, status: let status, pending: _, pendingText: _, finalText: _, summary: _, tailTarget: let tail, markdownContent: _, process: _, artifacts: _) = $0 {
                return status == "streaming" && tail != nil
            }
            return false
        }) else { return }

        guard case .assistant(
            id: let messageId,
            status: let status,
            pending: _,
            pendingText: _,
            finalText: _,
            summary: _,
            tailTarget: let tailTarget,
            markdownContent: _,
            process: let process,
            artifacts: let artifacts
        ) = conversation[index],
              status == "streaming",
              let target = tailTarget,
              !target.isEmpty
        else { return }

        task = Task {
            var end = 0
            var current = conversation
            while end < target.count, !Task.isCancelled {
                try? await Task.sleep(nanoseconds: config.tickMs * 1_000_000)
                end = min(end + config.codepointsPerTick, target.count)
                let slice = String(target.prefix(end))
                current[index] = .assistant(
                    id: messageId,
                    status: "streaming",
                    pending: true,
                    pendingText: slice,
                    finalText: nil,
                    summary: nil,
                    tailTarget: target,
                    markdownContent: nil,
                    process: process,
                    artifacts: artifacts
                )
                await MainActor.run { onUpdate(current) }
            }
            guard !Task.isCancelled else { return }
            current[index] = .assistant(
                id: messageId,
                status: "completed",
                pending: false,
                pendingText: nil,
                finalText: nil,
                summary: nil,
                tailTarget: nil,
                markdownContent: target,
                process: process,
                artifacts: artifacts
            )
            await MainActor.run { onUpdate(current) }
        }
    }
}

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
            if case .assistant(status: let status, pendingText: _, summary: _, tailTarget: let tail, markdownContent: _, process: _) = $0 {
                return status == "streaming" && tail != nil
            }
            return false
        }) else { return }

        guard case .assistant(
            status: let status,
            pendingText: _,
            summary: _,
            tailTarget: let tailTarget,
            markdownContent: _,
            process: _
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
                current[index] = .assistant(status: "streaming", pendingText: slice, summary: nil, tailTarget: target, markdownContent: nil, process: [])
                await MainActor.run { onUpdate(current) }
            }
            guard !Task.isCancelled else { return }
            current[index] = .assistant(
                status: "completed",
                pendingText: nil,
                summary: nil,
                tailTarget: nil,
                markdownContent: target,
                process: []
            )
            await MainActor.run { onUpdate(current) }
        }
    }
}

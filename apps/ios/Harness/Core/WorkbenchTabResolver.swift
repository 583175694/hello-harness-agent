import Foundation

/// 与 mobile-core `WorkbenchTabResolver` 规则对齐（KMP JVM 单测为权威）。
enum WorkbenchTabResolver {
    static func visibleTabs(state: WorkbenchState) -> [String] {
        var tabs = ["activity"]
        if !state.sources.isEmpty { tabs.append("sources") }
        if let md = state.reportMarkdown, !md.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            tabs.append("report")
        }
        if hasArtifactTab(state) { tabs.append("artifact") }
        return tabs
    }

    static func coerceActiveTab(state: WorkbenchState, requested: String) -> String {
        let tabs = visibleTabs(state: state)
        if tabs.contains(requested) { return requested }
        let initial = state.initialView.isEmpty ? "activity" : state.initialView
        if tabs.contains(initial) { return initial }
        return tabs.first ?? "activity"
    }

    static func tabLabel(_ tab: String) -> String {
        switch tab {
        case "activity": return "实时跟随"
        case "sources": return "来源"
        case "report": return "报告"
        case "artifact": return "文件"
        default: return tab
        }
    }

    private static func hasArtifactTab(state: WorkbenchState) -> Bool {
        !state.deliverableFiles.isEmpty || !state.artifactVersions.isEmpty || state.hasDeliverables == true
    }
}

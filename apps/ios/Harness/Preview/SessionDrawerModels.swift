import Foundation

struct SessionDrawerItem: Identifiable, Equatable, Hashable {
    let id: String
    var title: String
    let time: String
    var active: Bool
    var pinned: Bool
    var running: Bool
}

struct SessionDrawerState: Equatable {
    var draftTitle: String = "新对话"
    var searchPlaceholder: String = "搜索会话"
    var sessions: [SessionDrawerItem] = []
}

struct UiHints: Equatable {
    var initialDrawerOpen: Bool = false
}

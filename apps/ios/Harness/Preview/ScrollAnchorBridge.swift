import SwiftUI
import UIKit

enum ScrollViewAnchorRegistry {
    static weak var scrollView: UIScrollView?
}

struct VisibleRowFramePreferenceKey: PreferenceKey {
    static var defaultValue: [String: CGFloat] = [:]
    static func reduce(value: inout [String: CGFloat], nextValue: () -> [String: CGFloat]) {
        value.merge(nextValue(), uniquingKeysWith: { first, _ in first })
    }
}

/// 读取 SwiftUI ScrollView 底层 contentOffset，用于历史插入后恢复同一像素位置。
struct ScrollAnchorBridge: UIViewRepresentable {
    var onOffsetChange: (CGFloat) -> Void
    /// 仅主对话列表注册为锚点恢复目标；推理块等内层滚动不得覆盖它。
    var registersGlobally: Bool = false

    func makeCoordinator() -> Coordinator {
        Coordinator(onOffsetChange: onOffsetChange, registersGlobally: registersGlobally)
    }

    func makeUIView(context: Context) -> UIView {
        let view = UIView(frame: .zero)
        view.isUserInteractionEnabled = false
        return view
    }

    func updateUIView(_ view: UIView, context: Context) {
        let coordinator: Coordinator = context.coordinator
        coordinator.onOffsetChange = onOffsetChange
        coordinator.registersGlobally = registersGlobally
        coordinator.attach(from: view)
    }

    final class Coordinator: NSObject {
        var onOffsetChange: (CGFloat) -> Void
        var registersGlobally: Bool
        private var observed: UIScrollView?

        init(onOffsetChange: @escaping (CGFloat) -> Void, registersGlobally: Bool) {
            self.onOffsetChange = onOffsetChange
            self.registersGlobally = registersGlobally
        }

        func attach(from view: UIView) {
            DispatchQueue.main.async { [weak self, weak view] in
                guard let self, let view, let scrollView = Self.findScrollView(from: view) else { return }
                guard self.observed !== scrollView else { return }
                self.observed?.removeObserver(self, forKeyPath: "contentOffset")
                scrollView.addObserver(self, forKeyPath: "contentOffset", options: [.new], context: nil)
                self.observed = scrollView
                if self.registersGlobally {
                    ScrollViewAnchorRegistry.scrollView = scrollView
                }
            }
        }

        override func observeValue(
            forKeyPath keyPath: String?,
            of object: Any?,
            change: [NSKeyValueChangeKey: Any]?,
            context: UnsafeMutableRawPointer?
        ) {
            guard keyPath == "contentOffset", let scrollView = object as? UIScrollView else { return }
            onOffsetChange(scrollView.contentOffset.y)
        }

        private static func findScrollView(from view: UIView) -> UIScrollView? {
            var current: UIView? = view
            while let node = current {
                if let scrollView = node as? UIScrollView { return scrollView }
                current = node.superview
            }
            return nil
        }

        deinit {
            observed?.removeObserver(self, forKeyPath: "contentOffset")
        }
    }
}

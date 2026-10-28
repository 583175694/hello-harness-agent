import Foundation
import QuartzCore
import UIKit

/// Gate A §8.2：`-GateAScrollPerf` 启动时自动滚动 long-thread 并写入 Documents/gate-a-scroll-perf.json。
enum GateAScrollPerformanceMonitor {
    private static let launchArg = "-GateAScrollPerf"
    private static let fileName = "gate-a-scroll-perf.json"

    static var shouldAutoRun: Bool {
        ProcessInfo.processInfo.arguments.contains(launchArg)
    }

    private static var link: CADisplayLink?
    private static var linkTarget: DisplayLinkTarget?
    private static var lastTimestamp: CFTimeInterval = 0
    private static var frameDurationsMs: [Double] = []
    private static var scrollTimer: Timer?

    static func startIfNeeded(onScrollTick: @escaping () -> Void) {
        guard shouldAutoRun, link == nil else { return }
        lastTimestamp = 0
        frameDurationsMs = []
        let target = DisplayLinkTarget(tick: { ts in
            if lastTimestamp > 0 {
                let ms = (ts - lastTimestamp) * 1000
                if ms > 0, ms < 500 { frameDurationsMs.append(ms) }
            }
            lastTimestamp = ts
        })
        linkTarget = target
        let displayLink = CADisplayLink(target: target, selector: #selector(DisplayLinkTarget.step(_:)))
        displayLink.add(to: .main, forMode: .common)
        link = displayLink

        var ticks = 0
        scrollTimer = Timer.scheduledTimer(withTimeInterval: 0.12, repeats: true) { timer in
            onScrollTick()
            ticks += 1
            if ticks >= 120 {
                timer.invalidate()
                finish()
            }
        }
    }

    static func finish() {
        scrollTimer?.invalidate()
        scrollTimer = nil
        link?.invalidate()
        link = nil
        linkTarget = nil
        guard !frameDurationsMs.isEmpty else { return }

        let sorted = frameDurationsMs.sorted()
        let p50 = sorted[sorted.count / 2]
        let budget = 16.67
        let severe = frameDurationsMs.filter { $0 > 2 * budget }.count
        let payload: [String: Any] = [
            "scene": "long-thread-scroll",
            "frameCount": frameDurationsMs.count,
            "p50FrameDurationMs": p50,
            "medianFps": 1000.0 / p50,
            "severeFramePct": Double(severe) / Double(frameDurationsMs.count) * 100,
            "severeFrameCount": severe,
            "recordedAt": ISO8601DateFormatter().string(from: Date()),
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted]),
              let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
        else { return }
        try? data.write(to: dir.appendingPathComponent(fileName), options: .atomic)
    }

    private final class DisplayLinkTarget: NSObject {
        private let tick: (CFTimeInterval) -> Void
        init(tick: @escaping (CFTimeInterval) -> Void) { self.tick = tick }
        @objc func step(_ link: CADisplayLink) { tick(link.timestamp) }
    }
}

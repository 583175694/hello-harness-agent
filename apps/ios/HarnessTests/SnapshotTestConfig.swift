import Foundation
import SnapshotTesting

enum SnapshotTestConfig {
    /// 本地重录：`TEST_RUNNER_SNAPSHOT_RECORD=1 xcodebuild test ...`（`xcodebuild` 不会把裸 `SNAPSHOT_RECORD` 传给测试进程）
    static var record: SnapshotTestingConfiguration.Record {
        let env = ProcessInfo.processInfo.environment
        if env["SNAPSHOT_RECORD"] == "1" || env["TEST_RUNNER_SNAPSHOT_RECORD"] == "1" {
            return .all
        }
        return .missing
    }
}

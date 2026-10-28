# Harness iOS（Native Mobile Phase A）

SwiftUI + `CoreUI` primitives；Debug **不链接 MobileCore**，仅 `PreviewAgentSessionPort`。

## 生成工程并打开 Preview / Dev Menu

```bash
cd apps/ios
xcodegen generate
open Harness.xcodeproj
```

1. Scheme：**Harness** → 任意 iOS 17+ 模拟器。
2. Run（⌘R）→ 首屏 **Preview / Dev Menu**，点场景进入 Chat 预览壳。

`PreviewFixtures` 与 `design-tokens.json` 通过 Xcode 资源引用 `packages/mobile-contract`（与 Android assets 同步策略等价）。

RN 对照：`apps/mobile/app/preview/index.tsx`。

## Gate A 验证

```bash
# 仓库根目录（需 iPhone 17 Simulator）
pnpm gate-a:verify:ios
pnpm gate-a:verify:all
```

Runbook（Snapshot / Instruments）：[`docs/gate-a-runbook.md`](docs/gate-a-runbook.md)。任务书：[`docs/44-native-mobile-phase-a-static-ui.md`](../../docs/44-native-mobile-phase-a-static-ui.md)。

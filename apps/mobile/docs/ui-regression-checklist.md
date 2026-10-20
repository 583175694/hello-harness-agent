# Mobile UI regression (Workbench / Drawer)

Manual checks on iOS Simulator after better-ui polish changes.

1. Home default fixture → open Workbench → **产物** tab at ~60% detent: Plan pill must not overlap diff code.
2. Same state: artifact footer actions clear of home indicator (safe area).
3. Session Drawer open: conversation behind does not scroll; closes → conversation scrolls again.
4. Workbench Sheet open: conversation does not scroll; only sheet content scrolls.
5. Workbench Sheet open: backdrop dim covers **ChatTopBar** (header not left bright white above shadow).
6. **Overlay mutex**: Workbench open → tap **+** closes Workbench and shows attachment sheet only; attachment open → open Workbench closes attachment.
7. **Attachment sheet** open: conversation does not scroll; Plan pill suppressed (same as Workbench).
8. **Session Drawer**: panel slides from left (~200ms); dismiss scrim top aligns with safe area (not `pt-14` gap).
9. **Reduce Motion** on: Drawer/attachment have no slide (instant sheet + optional scrim fade); spinners static.
10. `/preview/artifact`: auto-open sheet satisfies 1–2.
11. `/preview/d-drawer`: Drawer slide + scrim alignment.
12. Drawer → **设置**: Drawer 瞬时收起，设置页 **从右侧 push**（非自下而上 modal）。
13. **主 CTA**：澄清「提交回答」、Follow-up 发送钮有 scale 反馈；Workbench 关闭钮约 40pt 可点区域。
14. Workbench 分段 Tab：选中黑底白字，未选中灰字；按下仅背景变化、无 scale。
15. Workbench 已展开时切换 Tab：**抽屉 detent 高度不变**（不随内容跳动）；拉到最高档时 Sheet 顶缘在会话标题栏**下方**，标题在 scrim 下变暗。
16. **仅检索无文件**：`/preview/b-sources` 无「文件」分段，主区为来源卡片；**default** 有「实时跟随 | 文件」两档。
17. **Plan 浮卡**：点 pill 展开/收起详情，**无全屏 scrim**；pill 位置不跳、无闪一下换实例。

Run: `pnpm --filter @harness/mobile ios` or Expo dev client.

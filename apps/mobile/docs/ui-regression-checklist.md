# Mobile UI regression (Workbench / Drawer)

Manual checks on iOS Simulator after better-ui polish changes.

1. Home default fixture → open Workbench → **产物** tab at ~60% detent: Plan pill must not overlap diff code.
2. Same state: artifact footer actions clear of home indicator (safe area).
3. Session Drawer open: Drawer Modal 拦截触摸；关闭 Drawer 后交互恢复正常（**不要求** ChatScreen 互相关闭其它浮层）。
4. Workbench Sheet open: Sheet 内容与 backdrop 可交互；**不要求**父级禁用会话滚动或互关附件/Drawer。
5. Workbench Sheet open: backdrop 与 `topInset` 视觉对齐（标题区在 scrim 下变暗即可）。
6. **浮层独立**：Workbench、Session Drawer、附件菜单 **互不** 在代码里 `dismiss` / 关 state；一层打开时点不到其它入口属正常，无需 mutex。
7. **Attachment sheet** open: Plan pill 仅在 Composer 内随附件/Skill 抽屉隐藏（与 Workbench/Drawer 无关）。
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
18. **Settings**：主题切换 Light/Dark；字号 12–17 改变对话正文；API URL 编辑后重启 App 仍保留。
19. **Settings → 记忆**：Hub 开关持久化；列表新增/编辑/删除仅本地；返回栈正常。
20. **Settings → MCP**：列表 → 编辑/新建表单滚动与 Switch；保存 Alert 不崩溃。
21. **Composer**：`+` → 附件与 Skill 入口；Skill picker 多选；用户消息 skill chips（`/preview/agent` → skills）。
22. **Composer peek**：`/preview/agent` → composer-peek；点 peek 条打开 Workbench half。
23. **来源 Passage**：Workbench 来源卡片「查看全文」半屏 Modal。
24. **Reader**：Artifact 卡片或报告「全屏阅读」→ `/reader/*` 返回栈。
25. **iPad 并排**：`/preview/ipad-split` 双栏；Phone 仍为 Bottom Sheet。

Run: `pnpm --filter @harness/mobile ios` or Expo dev client.

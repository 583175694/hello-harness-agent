# HarmonyOS Markdown M3（POC）

> **状态**：POC / 冻结手写解析 — Production 对话 **不得** 再扩展 `ChatMarkdown.ets` 的 line-split parser。  
> **对齐文档**：[46-native-mobile-markdown-strategy.md](./46-native-mobile-markdown-strategy.md)

## 1. 现状

| 项 | 说明 |
| --- | --- |
| 入口 | `apps/harmony/entry/src/main/ets/coreui/ChatMarkdown.ets` |
| 能力 | 标题 / 段落 / 简单列表 / fenced code / 引用 / 分隔线 |
| 缺失 | GFM 表格、任务列表、删除线、链接样式、嵌套 inline、图片 |
| 与 Android/iOS | Android **Markwon**、iOS **MarkdownUI** 已落地；鸿蒙为 **Phase H1 阻塞项** |

## 2. 候选方案（按优先级）

### H1-A — cmark-gfm NAPI（推荐终态）

- 上游：[github.com/github/cmark-gfm](https://github.com/github/cmark-gfm)
- 形态：Harmony **NAPI** 模块输出 HTML 或 AST → ArkUI `RichText` / 自研 span 映射
- 优点：与 Web GFM 语义一致；社区成熟
- 成本：C++ 交叉编译 + 鸿蒙 SDK 集成 + 主题映射 HarnessColors

### H1-B — 系统 / 生态 Rich 组件

- 调研 `@ohos` 是否提供可嵌入的 Markdown/RichText 渲染（随 API 版本变化，需真机 POC）
- 若仅支持 HTML 子集，可 cmark-gfm → HTML → 官方组件

### H1-C — 仓颉 / 三方 ArkTS 库

- 评估维护活跃度与 GFM table 支持；**禁止** 再 fork 一份 line-parser

## 3. POC 验收标准

1. 跑通 `chat-markdown-gallery.json` + `markdown-golden-*.json` 四条 golden 正文  
2. **表格** 可读（列对齐或横向滚动）  
3. 主题：`HarnessColors` 链接 / 代码块 / 表头底色  
4. 流式：与 Android 相同 — 节流后整段渲染  

## 4. 冻结规则（立即生效）

- `ChatMarkdown.ets` 内 **仅允许** bugfix（crash、空白），**禁止** 新 block 类型、GFM 表格自绘  
- 新能力必须在 POC 通过后 **整文件替换** 为 NAPI/库方案  
- Preview Dev Menu 已含 `chat-markdown-gallery.json`，用于 POC 前后对照  

## 5. 建议排期

| 阶段 | 工作 |
| --- | --- |
| POC-1 | cmark-gfm 编译为 `ohos-arm64-v8a` 静态库 + 最小 NAPI `parse(md) -> html` |
| POC-2 | ArkUI 包装为 `@Component struct ChatMarkdown`，签名与 Android `ChatMarkdown` 一致 |
| POC-3 | golden 人工对照 + 写入 Gate A 鸿蒙清单（不阻塞 Android/iOS Gate A） |

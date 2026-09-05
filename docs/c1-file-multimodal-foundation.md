# C1 文件与多模态基础 / 需求文档与功能范围

> 文档状态：C1 评审稿。本文定义 C1 的用户价值、产品契约、功能边界和验收标准；不替代总路线图、共享协议或安全规范。C1 完成后，C2-C7 才在此基础上扩展。

> **优先级调整（2026-09-04）**：C1 按“先图片、后文件”的顺序交付。第一波是图片上传与视觉输入（P0），原因是当前 DeepSeek、GLM 已具备多模态能力；第二波是文本、CSV、JSON、PDF 等通用文件处理（P1），不阻塞图片 MVP。

> **本轮交付口径**：本轮只验收 C1-A0 图片闭环；C1-A0 只支持单图，C1-A1 才扩展到多图、失败恢复和图片粘贴。TXT、Markdown、CSV、JSON、PDF 的解析、文本注入和页码/行号定位属于后续 C1-B，不进入本轮验收。

## 1. 一句话定义

C1 让用户可以在本地任务工作台中安全地添加文件或图片，并让 Agent 在后续对话中可靠地理解这些材料、说明处理状态和引用原始文件位置。

## 2. 背景与问题

当前 Agent 的上下文主要来自文字消息和公开网页。真实任务经常从“看一下截图中的错误”“识别这张照片里的信息”开始；DeepSeek、GLM 等目标模型已经支持多模态输入，因此图片是 C1 最短的价值验证路径。C1 提供统一的文件输入层，但不把它扩展成报告、代码执行、浏览器或长期记忆系统。

## 3. 目标与成功指标

### 3.1 产品目标

- 用户能在会话中选择、拖拽或粘贴文件，并在发送前看到附件状态。
- Agent 能优先读取图片并作为视觉输入传给支持视觉的模型，同时读取受支持文件的文本和结构化元数据。
- 文件处理失败、超限或模型不支持时，用户得到可理解且可恢复的提示。
- 文件事实、解析结果和引用位置可随会话恢复，不能依赖浏览器内存。
- 外部文件内容始终是不可信数据，不能改变系统指令、工具权限或执行边界。

### 3.2 首版指标（建议）

- 95% 的受支持小型文件在 10 秒内完成可用预览。
- 100% 的超限、格式不支持和恶意内容被明确拒绝，不产生伪成功状态。
- 刷新或重新打开会话后，附件元数据和处理状态与服务端一致。
- 文本引用可定位到文件名及页码/行号（能力可用时）。

## 4. 用户场景

1. 用户上传一份 PDF，询问“提炼三条风险”，Agent 基于解析出的正文回答并标注文件页码。
2. 用户上传 PNG 截图，询问“这个报错是什么意思”，支持视觉的模型查看图片并回答。
3. 用户一次上传多个材料，要求比较其中差异；Agent 能区分每个文件，不混淆来源。
4. 文件正在解析时用户继续编辑问题；发送动作要么等待附件就绪，要么明确阻止并说明原因。
5. 文件损坏或不支持时，用户可以移除该附件后重新发送，不影响会话本身。

## 5. 功能范围（In Scope）

### 5.0 分层交付顺序

C1 采用“先最小闭环，再稳定增强，最后扩展文件类型”的分层方式。每一层都必须形成可运行、可验证的纵向链路，后层不作为前层的开发前置条件。

| 层级               | 优先级 | 范围                      | 交付目标                                                                                      |
| ------------------ | ------ | ------------------------- | --------------------------------------------------------------------------------------------- |
| C1-A0 最小图片闭环 | P0     | PNG/JPEG/WebP             | 单图上传、服务端校验、COS 保存、缩略图、ready、单图视觉问答、附件恢复                         |
| C1-A1 稳定图片能力 | P0     | C1-A0 增强                | 多图同消息、取消/重试、失败状态、模型视觉能力提示、图片粘贴、短期签名 URL、删除清理和安全回归 |
| C1-B 文件基础      | P1     | TXT/Markdown/CSV/JSON/PDF | 文件解析、受限预览、文本上下文注入、页码/行号定位                                             |
| C1-C 后续增强      | P2     | 非 MVP 能力               | 直传/分片上传、异步 Worker 恢复、OCR、复杂来源投影、更多格式和供应商 Files API                |

C1-A0 完成真实模型验证后进入 C1-A1；C1-A1 稳定后再进入 C1-B。所有层共用 `fileId`、附件关系、COS 存储模块、权限和基础生命周期，但不提前实现后续层的复杂能力。

### 5.1 文件选择与生命周期

- Web 端支持文件选择器、拖拽上传；移动端粘贴不作为 C1 必做项。
- C1-A1 增加桌面端将剪贴板图片直接粘贴到 Composer 的能力；粘贴图片与文件选择、拖拽共用同一个前端上传回调和服务端上传接口，不新增独立文件协议。普通文本粘贴保持原有输入框行为。
- 附件状态：`selected -> uploading -> processing -> ready | failed | rejected`。
- 支持在发送前移除附件；发送后附件与用户消息建立不可变关联。C1-A0 中消息只允许绑定已进入 `ready` 的一张图片。
- 会话历史展示附件卡片（名称、类型、大小、状态、失败原因）；不默认展示原始二进制。
- 服务端保存文件元数据和内容引用，浏览器刷新后可恢复。

### 5.2 首版格式与优先级

**P0（图片 MVP，必须先交付）**：`png`、`jpeg/jpg`、`webp`。

**P1（文档基础，随后交付）**：`txt`、`md`、`csv`、`json`、`pdf`。

- 文本类：保留 UTF-8 文本，必要时进行受控编码检测。
- CSV/JSON：提供可读文本视图和基本结构元数据，不承诺表格计算或 schema 推断。
- PDF：提取文本、页数和页码定位；扫描件 OCR 属于可选增强，未启用时明确提示。
- 图片：保存原图元数据并作为 multimodal input；可生成受限尺寸的预览缩略图。C1-A0 支持单图发送和预览；多图同消息、失败重试及更完整的模型能力提示属于 C1-A1。

不因扩展名直接信任类型，必须校验 MIME、文件签名和解析结果。

### 5.3 Agent 上下文接入

- 文件就绪后，Context Compiler 可按本轮预算注入文件内容或摘要；不得无界注入全文。
- 图片以模型适配器支持的 canonical image content 表示；模型目录必须声明 `supportsVision`，不支持视觉的模型在发送前给出明确提示或阻止发送。DeepSeek、GLM 的具体请求格式差异只能收敛在 Model Adapter 内。
- 每个附件带稳定 `fileId`、`messageId` 和 `sourceRef`，工具、投影和后续 C2 可复用。
- 文件解析结果与用户原文分离，外部文本作为不可信材料注入 Tool/Document message。

### 5.4 预览与定位

- 文本/PDF 提供受限预览；大文件只显示片段和“已截断”标识。
- 解析出的引用位置至少包含文件名；PDF 包含页码，文本包含行号或字符区间（按解析器能力）。
- 用户可查看文件处理错误和基础元数据，但 C1 不提供在线编辑器。

### 5.5 存储与清理

- C1 默认使用腾讯云 COS 保存原图和必要的预览缩略图，数据库保存 fileId、COS object key、哈希、状态和关联关系；不引入 C2 的 Artifact 语义。
- C1-A0 暂不要求会话内去重、独立处理 Worker 或多版本 prepared image；这些能力在确认性能瓶颈后再增加。
- 会话删除时清理关联元数据和 COS 对象；清理失败必须记录待处理状态。删除补偿任务属于 C1-A1 的稳定性工作。
- 不引入多租户共享或跨用户文件空间。

### 5.6 除图片和文件本体之外的 C1 基础范围

这些能力属于 C1 的必要支撑，不应被视为 C2 或其他后续能力：

- **附件生命周期**：选择、上传、处理、就绪、失败、拒绝、取消、重试、移除和删除状态。
- **模型能力协商**：模型目录声明是否支持视觉、支持的图片类型/数量/尺寸；切换模型时给出明确的兼容性提示。
- **多模态协议**：在 `agent-protocol` 中定义图片内容、文件引用、附件排序、处理状态和错误码；供应商私有格式只存在于 Model Adapter。
- **上下文编排**：按 token/图片数量/像素预算选择或裁剪材料，确保图片和文本不会无界注入模型上下文。
- **来源与定位**：回答可以指向 `fileId`、文件名、图片或 PDF 页码/文本区间，为 C2 后续引用复用。
- **预览与交互**：缩略图、文件卡片、处理进度、错误解释、键盘操作和可访问性。
- **安全与隐私**：MIME/魔数校验、路径隔离、大小和压缩比限制、恶意内容防护、短期授权预览、日志脱敏。
- **持久化与恢复**：文件元数据、哈希、解析器版本、处理状态和消息关联可在刷新、重启及会话删除后保持一致。
- **可观测性与测试**：上传/解析耗时、结果码、失败原因、容量限制和多模型兼容性的 unit/integration/E2E 覆盖。

上述范围不包括文件内容的业务加工（如报告排版、表格计算、代码运行、网站生成），这些分别属于 C2、C3 和 C5。

## 6. 非功能要求

- 安全：路径穿越防护、大小/数量/压缩比限制、MIME 与魔数校验、恶意 PDF/图片解析隔离、拒绝可执行文件和宏文件。
- 隐私：日志不得记录文件正文、图片内容或敏感路径；下载/预览使用短期、会话绑定的授权。
- 可靠性：上传可取消；处理失败可重试一次；API 重启后不把未完成文件伪装为 ready。
- 性能：单文件和单消息限制必须在共享协议中定义；解析使用超时和内存上限。
- 可观测性：记录 fileId、阶段、耗时、大小、结果码，不记录原文。
- 可访问性：附件状态有文本标签；拖拽区支持键盘操作；颜色不是唯一状态表达。

## 7. 建议产品限制（首版默认值）

| 项目           |                             默认值 |
| -------------- | ---------------------------------: |
| 单文件大小     |                             20 MiB |
| 单条消息附件数 |                                 10 |
| 单会话文件总量 |                            100 MiB |
| PDF 页数       |                             200 页 |
| 文本注入上限   |    40,000 Unicode code points/文件 |
| 图片长边       |   8,000 px（超出则生成受控缩略图） |
| 解析超时       |                         30 秒/文件 |
| 文件保留       | 随会话生命周期；不做独立长期文件库 |

具体数值在压测后可调整，但必须保持服务端、协议和 UI 一致。

## 8. 分层领域对象与协议要求

### 8.1 C1-A0 最小对象

第一层只增加图片闭环必需的对象：

- `FileRef`：`fileId`、原始名称、媒体类型、大小、sha256、创建时间、图片尺寸、COS object key。
- `AttachmentRef`：`sessionId`、`messageId`、`fileId`、用户可见排序。
- `FileProcessingStatus`：状态、错误码和可重试标记。
- `ModelVisionCapability`：是否支持图片、支持的媒体类型和单轮图片数量上限。

数据库先实现 `File` 和 `MessageAttachment` 两类关系；二进制内容不进入消息正文或 SSE。

附件关系沿用当前 Run 链路，不为 C1-A0 另造独立的 Run 输入模型：

```text
File（归属当前 Session）
  -> MessageAttachment（发送时绑定 user Message）
  -> inputMessageId
  -> AgentRun
  -> Context / Model Adapter
```

上传阶段文件尚未绑定消息，只记录 `sessionId` 和 `fileId`；创建用户消息时，在同一事务中写入 `MessageAttachment`。Run 通过 `inputMessageId` 获取附件。C1-A0 暂不建立独立的 Task/Run 文件关系，也不把图片二进制或签名 URL 写入 `Message`、transcript 或 SSE。

这借鉴 Codex 的“草稿附件状态与正式用户输入分离”思路：附件先在 composer 中独立管理，提交时才进入用户输入；但 Web C1 不保存或传递本地路径，而是提交服务端生成的 `fileId`。因此当前实现的关系保持为 `MessageAttachment -> inputMessageId -> AgentRun`，而不是让 Run 直接持有客户端文件路径。

同一消息在 C1-A0 中最多绑定一张图片；附件未 `ready`、已拒绝或已失败时，整条消息不能提交。C1-A0 中用户需要移除失败附件后再发送，重试上传属于 C1-A1。

### 8.1.1 C1-A0 最小请求契约

上传接口返回 `fileId` 和处理状态；创建 Run/用户消息时只提交 `fileId`，不提交二进制、COS object key 或签名 URL：

```ts
type UploadFileResponse = {
  fileId: string;
  status: 'processing' | 'ready' | 'failed' | 'rejected';
  fileName: string;
  mediaType: string;
  size: number;
};

type CreateRunInput = {
  content: string;
  attachmentIds?: string[]; // C1-A1 最多四个，按用户选择/粘贴顺序
  attachmentId?: string; // 兼容 C1-A0 旧客户端，服务端转换为数组
};
```

服务端在创建消息/Run 的事务中校验所有附件属于当前 Session、状态为 `ready`、数量不超过四个且为允许的图片类型，然后按数组顺序创建 `MessageAttachment.ordinal`。重复 file ID 必须拒绝；旧 `attachmentId` 请求先转换为单元素数组。

### 8.2 C1-A1 与 C1-B 对象

确认最小图片闭环稳定后，再增加：

- 文件事件和完整删除/重试状态；
- 图片发送尺寸、detail 和处理观测字段；
- `FilePart`：文本片段、页码/行号/字符区间和截断信息；
- 解析器版本、文本注入预算和定位投影。

不要为了满足 C1-A0 预先实现通用 `FilePart`、全文解析或复杂来源系统。

## 9. 端到端流程

```text
选择/拖拽文件
  -> 校验类型与大小
  -> 上传并持久化 File 元数据
  -> 解析/缩略图处理
  -> ready（可预览、可作为上下文）
  -> 用户发送消息并绑定 AttachmentRef
  -> Context Compiler 按预算选择文本片段/图片
  -> Agent 回答并返回文件定位信息
```

任一步失败都必须保留可解释状态；不得把未处理文件静默当作已读材料。

## 10. 明确不在 C1 范围（Out of Scope）

- C2：Artifact、报告生成、导出 DOCX/PDF、正式引用审校和报告流水线。
- C3：代码执行、表格计算引擎、沙箱或 Notebook。
- C4：MCP Server/Client、动态工具注册。
- C5：基于文件生成网站或部署预览。
- C6：登录态网页、浏览器自动化、网页截图抓取。
- C7：Skills、`NOTES.md`、`TODO.md`、跨会话 Memory、自动长期摘要。
- OCR、音视频转写、Office 复杂版式、压缩包递归解析、密码保护文件（可作为后续增强）。
- 多用户权限、协作共享、跨用户文件空间和全文搜索索引。

## 11. 分层验收标准

### 11.1 C1-A0 最小图片闭环

1. 用户可上传 PNG/JPEG/WebP，服务端完成 MIME、魔数、大小和图片解码校验。
2. 图片写入 COS 后生成可访问的缩略图和稳定的 `fileId`，状态可从上传进入 processing，再进入 ready 或明确失败。
3. 支持视觉的模型可读取一张图片并回答；图片 URL 使用短期签名，不暴露永久公开对象。
4. 图片可预览、移除，刷新或重新打开会话后附件元数据和 ready/failed 状态可恢复。

### 11.2 C1-A1 稳定图片能力

1. 支持多图同消息、取消、一次可控重试和模型不支持视觉时的明确提示。
2. 支持桌面端从剪贴板粘贴图片；检测到图片剪贴板数据时阻止默认二进制粘贴并进入与文件选择相同的上传、预览、处理和错误状态流程；普通文本粘贴不受影响。
3. 删除会话后附件关系不可见，COS 清理结果可观测，失败清理可补偿。
4. 类型伪装、损坏图片、超限图片不会进入模型上下文；常规日志不记录图片正文或签名 URL。

### 11.3 C1-B 文件基础

1. ready 的 TXT/Markdown/CSV/JSON/PDF 文件可在同一会话提问，多个附件不会混淆。
2. 文本注入受预算限制，PDF 至少支持页码定位，文本支持行号或字符区间定位。
3. 解析失败、超时、OCR 未启用等状态向用户明确呈现，不伪造成功。

## 12. 实施拆分建议

### C1-A0：最小图片闭环

1. `agent-protocol` 增加图片内容、`FileRef`、`AttachmentRef` 和最小处理状态。
2. API 增加图片上传和会话归属校验；服务端完成 MIME/魔数/解码/大小/尺寸检查。
3. 通过独立的 COS 存储模块保存原图和缩略图；数据库保存文件事实和消息附件关系。
4. Model Adapter 支持 user 消息中的文本 + 图片 block，并使用短期签名 URL。
5. Web 支持选择、上传状态、缩略图、预览、移除和会话恢复。

### C1-A1：稳定图片能力

1. 增加多图、多模型能力提示、取消、重试、失败恢复和删除补偿。
2. 增加 Composer 剪贴板图片粘贴，并复用选择/拖拽上传链路；为图片粘贴、普通文本粘贴、重复粘贴和上传失败补充回归测试。
3. 增加发送图片的尺寸/detail 记录、请求预算保护、集成/E2E 和真实 DeepSeek/GLM 验证。

### C1-B：通用文件

1. 在图片闭环稳定后增加 TXT/Markdown/CSV/JSON/PDF 解析和受限预览。
2. 增加 `FilePart`、文本上下文预算、页码/行号定位和文件引用投影。

### C1-C：后续增强

按实际瓶颈再评估直传/分片上传、异步 Worker 恢复、OCR、复杂来源系统、更多格式和供应商 Files API。

本轮 C1-A1 完成条件是图片链路具备多图、失败恢复、粘贴和清理补偿能力，并通过协议、前端和构建回归；真实 COS 故障注入与完整 E2E 仍作为后续验收项。C1-B 暂不进入本轮。所有未支持能力必须显示为明确 unavailable，而不是伪造成功。

## 13. Codex 开源实现对照

截至 2026 年 9 月 4 日，`openai/codex` 公开仓库（main，远端提交
`ea2046f36d5ee12d39c8e168fc3e5129301afa2b`）已经包含可直接借鉴的图片输入实现，但不应理解为已经提供了完整的 C1 文件服务。

### 13.1 可以直接借鉴的部分

- **输入协议**：Codex 将用户输入建模为 `Text`、`Image`、`LocalImage` 等显式 union；本地图片在请求序列化阶段转换为可传输的 data URL。参考
  [`protocol/src/user_input.rs`](https://github.com/openai/codex/blob/ea2046f36d5ee12d39c8e168fc3e5129301afa2b/codex-rs/protocol/src/user_input.rs) 和
  [`protocol/src/local_media.rs`](https://github.com/openai/codex/blob/ea2046f36d5ee12d39c8e168fc3e5129301afa2b/codex-rs/protocol/src/local_media.rs)。
- **图片预处理**：通过统一的图片工具完成格式识别、解码、尺寸缩放、重新编码、EXIF/ICC 处理、data URL 生成和缓存。参考
  [`utils/image/src/lib.rs`](https://github.com/openai/codex/blob/ea2046f36d5ee12d39c8e168fc3e5129301afa2b/codex-rs/utils/image/src/lib.rs)。
- **图片细节等级**：协议提供 `auto`、`low`、`high`、`original` 四档 detail；这比单一的“原图/缩略图”开关更适合作为 C1 的模型适配层能力。参考
  [`protocol/src/models.rs`](https://github.com/openai/codex/blob/ea2046f36d5ee12d39c8e168fc3e5129301afa2b/codex-rs/protocol/src/models.rs)。
- **模型能力声明**：Codex 使用 `InputModality::Text/Image/Audio` 描述模型接受的输入模态，并在上下文编译阶段依据能力处理不支持的图片。参考
  [`protocol/src/openai_models.rs`](https://github.com/openai/codex/blob/ea2046f36d5ee12d39c8e168fc3e5129301afa2b/codex-rs/protocol/src/openai_models.rs) 和
  [`core/src/context_manager/normalize.rs`](https://github.com/openai/codex/blob/ea2046f36d5ee12d39c8e168fc3e5129301afa2b/codex-rs/core/src/context_manager/normalize.rs)。
- **Composer 附件状态**：TUI 有独立的附件状态，支持本地图片、远程图片、附件占位符、删除后的重新编号和历史草稿恢复。参考
  [`tui/src/bottom_pane/chat_composer/attachment_state.rs`](https://github.com/openai/codex/blob/ea2046f36d5ee12d39c8e168fc3e5129301afa2b/codex-rs/tui/src/bottom_pane/chat_composer/attachment_state.rs)。
- **剪贴板图片**：Codex 支持从系统剪贴板读取图片，统一编码为 PNG，再作为临时本地图片参与提交。参考
  [`tui/src/clipboard_paste.rs`](https://github.com/openai/codex/blob/ea2046f36d5ee12d39c8e168fc3e5129301afa2b/codex-rs/tui/src/clipboard_paste.rs)。
- **图片隐私与事件脱敏**：用户事件和通知投影会移除原始图片内容，只保留必要的本地图片引用或文本占位符。参考
  [`app-server/src/notification_media.rs`](https://github.com/openai/codex/blob/ea2046f36d5ee12d39c8e168fc3e5129301afa2b/codex-rs/app-server/src/notification_media.rs)。
- **可插拔附件存储**：仓库抽象了 `AttachmentStore`，既可以内联 data URL，也可以替换成持久化或远端存储实现。参考
  [`attachment-store/src/lib.rs`](https://github.com/openai/codex/blob/ea2046f36d5ee12d39c8e168fc3e5129301afa2b/codex-rs/attachment-store/src/lib.rs)。

### 13.2 Codex 没有直接提供的部分

- **Web/API 通用上传服务**：开源核心更偏向本地 CLI/TUI 和 app-server 输入协议；不能直接替代我们的 multipart 上传、会话绑定、短期预览授权和数据库生命周期。
- **通用用户文件解析流水线**：没有发现面向 C1 用户输入的完整 TXT/CSV/JSON/PDF/Office 解析、页码切片和文档预览产品。仓库中的 `codex-api/src/files.rs` 主要是把文件上传到 OpenAI 后端，服务于 Apps/MCP 文件参数，不是通用文件阅读器。参考
  [`codex-api/src/files.rs`](https://github.com/openai/codex/blob/ea2046f36d5ee12d39c8e168fc3e5129301afa2b/codex-rs/codex-api/src/files.rs)。
- **DeepSeek/GLM 供应商适配**：Codex 的 `InputModality` 可以借鉴，但其请求编码、视觉 detail 和模型目录不能直接移植到我们的 OpenAI-compatible DeepSeek/GLM Adapter。

### 13.3 对我们 C1 的结论

建议采用“协议和算法借鉴，产品链路自研”的方式：

1. C1-A 先复刻 Codex 的 `LocalImage -> validate/decode/resize -> canonical image content` 主链路。
2. 将 `ImageDetail` 和 `InputModality` 思路纳入我们的 `agent-protocol`，并把 `supportsVision` 扩展为更完整的视觉能力描述。
3. 借鉴其图片预算、缩放、缓存、非视觉模型降级和通知脱敏策略。
4. 不直接复制 Codex 的本地路径语义；我们的 Web 端必须使用 `fileId`/`AttachmentRef`，避免把客户端路径暴露给模型或跨机器传输。
5. C1-B 的文本/PDF 解析、预览和定位仍需我们独立设计和实现。

Codex CLI/SDK 的图片入口也已公开文档化：CLI 使用 `-i/--image`，SDK 使用
`{ type: "local_image", path: "..." }`；Web 端支持拖拽、粘贴和附件入口。这些可作为我们的交互参考，但不等同于开源仓库已包含完整 Web 上传实现。参考
[`Codex image inputs`](https://developers.openai.com/codex/image-inputs) 和
[`TypeScript SDK attaching images`](https://github.com/openai/codex/blob/ea2046f36d5ee12d39c8e168fc3e5129301afa2b/sdk/typescript/README.md#attaching-images)。

## 14. DeepSeek Vision 模型与图像传参基线

### 14.1 模型配置

首个视觉模型固定为：

```text
id       = deepseek-v4-flash-vision-exp
provider = deepseek
baseUrl  = https://api.deepseek.com
```

该模型已加入 API 模型目录，并设为默认模型。模型上下文窗口仍沿用当前 DeepSeek 受控配置，但 Vision 专属上下文事实暂标记为 `verified: false`，避免把 Vision 文档未声明的窗口值误当作已验证事实。

### 14.2 Chat Completions 的 canonical 传参

DeepSeek Vision 使用 OpenAI-compatible Chat Completions 时，用户消息的 `content` 必须是 block 数组，不能是纯字符串：

```json
{
  "model": "deepseek-v4-flash-vision-exp",
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "请描述这张图片。" },
        {
          "type": "image_url",
          "image_url": {
            "url": "data:image/jpeg;base64,<BASE64_DATA>",
            "detail": "high"
          }
        }
      ]
    }
  ]
}
```

C1 的 canonical 层应表达为：

```ts
type UserImageContent = {
  type: 'image_url';
  imageUrl: string; // data URL 或受策略允许的 https URL
  detail?: 'auto' | 'low' | 'high' | 'original';
};
```

供应商编码时再转换为 DeepSeek 字段名：

```ts
{
  type: 'image_url',
  image_url: {
    url: imageUrl,
    ...(detail ? { detail } : {}),
  },
}
```

### 14.3 三种图片传入方式

| 方式         | Chat Completions 形态                       | C1 策略                                                          |
| ------------ | ------------------------------------------- | ---------------------------------------------------------------- |
| COS 签名 URL | `image_url.url = https://...`               | C1-A 默认路径；服务端按每次模型请求生成短期签名 URL              |
| Base64 内联  | `image_url.url = data:image/...;base64,...` | 仅在供应商无法访问 COS 或签名 URL 方案验证失败时作为受控降级     |
| 外部 URL     | `image_url.url = https://...`               | C1-A 不直接接受任意 URL；如未来开放，必须增加 SSRF/域名/超时防护 |
| Files API    | `{ type: "file", file_id: "file-api-..." }` | C1-A 暂不依赖；作为大图和跨请求复用的后续路径                    |

官方限制需要在配置和校验层体现：

- 支持 JPEG、PNG、GIF、WebP；必须根据文件实际内容判断，不能只信任扩展名或声明的 MIME。
- Base64 或 `file_data` 内联图片计入 48 MiB 请求体限制。
- 外部 URL 最长 8192 字符，远程图片最大 32 MiB，下载最长 60 秒。
- Files API 引用的图片最大 64 MiB，且不受 32 MiB 单图检查限制。
- `image_url` 的 `detail` 可选；支持 `low`、`high`、`original`、`auto`。
- Chat Completions 中图片只能放在 `user` 消息；system/assistant 图片会返回 400。
- 只有 `deepseek-v4-flash-vision-exp` 接受图片，其他 DeepSeek 模型会返回不支持图片的 400。

### 14.4 C1-A 的实际发送路径

```text
浏览器 File
  -> 服务端上传与魔数校验
  -> 读取尺寸 / EXIF
  -> 按 detail 和请求预算缩放
  -> 保存原图与缩略图到 COS
  -> 按本次请求生成短期 COS 签名 URL
  -> Model Adapter 转换为 image_url block
  -> DeepSeek Chat Completions
```

C1-A 默认使用 COS 私有对象的短期签名 URL。数据库只保存稳定的 COS object key，不保存签名 URL；每次发送、重试或恢复时重新签名。只有在模型供应商无法访问 COS，或真实模型验证表明 URL 传参不稳定时，才使用受控 Base64 内联降级。

### 14.5 Token 与缩放策略

DeepSeek 会在进入模型前自动缩放图片：小于约 `384 × 384` 的图片保持比例放大，更大的图片保持比例缩小到约 `800 × 800` 的总像素级别；单张图片 Token 消耗上限为 384，多图按图片分别计算。

因此 C1 需要同时保留：

- 原始尺寸：用于预览、审计和后续重新处理。
- 发送尺寸：用于实际模型请求。
- `detail`：用于用户/模型选择的质量档位。
- `preparedBytes` 与 `preparedWidth/Height`：用于请求体和可观测性。

本地 Context Compiler 不应仅按 Base64 字符数估算图片成本；至少要记录图片数量、detail、发送尺寸和供应商返回的实际 usage。

### 14.6 Adapter 实施要求

- `ModelMessage` 需要支持“文本 + 图片 block”的用户消息，而不能继续只接受 `content: string`。
- 图片只能出现在 user input；如果未来支持 Responses API，再单独扩展 developer/tool output 的 `input_image` 规则。
- `deepseek-v4-flash-vision-exp` 的图片请求不得携带 DeepSeek Thinking 专属字段，除非官方接口验证明确支持；视觉 MVP 先以普通 Chat Completions 请求闭环。
- DeepSeek Vision 的 `reasoning_content`、Tool Calling 和图片 block 是三个独立兼容性问题，不能把视觉模型默认当作已经验证了 Thinking + Tool Calling。
- Adapter 必须拒绝不支持的图片 MIME、超大内联请求、无效 data URL 和 system/assistant 图片，并返回稳定错误码。

## 15. 腾讯云 COS 存储方案

### 15.1 COS 独立模块边界

COS 作为独立的 `FileStorage` 模块接入，文件领域服务不直接依赖腾讯云 SDK。C1 的其他模块只通过稳定接口访问对象存储：

```ts
interface FileStorage {
  putOriginal(input: { fileId: string; content: Buffer; contentType: string }): Promise<{
    objectKey: string;
    etag?: string;
  }>;
  putPreview(input: { fileId: string; content: Buffer; contentType: string }): Promise<{
    objectKey: string;
  }>;
  createReadUrl(input: { fileId: string; variant: 'original' | 'preview' }): Promise<string>;
  deleteFile(input: { fileId: string }): Promise<void>;
}
```

`FileStorage` 负责 COS 配置、object key 生成、上传、短期签名 URL 和删除；不负责 MIME/魔数校验、图片解码、文件状态、会话权限、消息绑定或模型请求。文件服务负责先校验并持久化文件事实，再调用该模块保存对象。签名 URL 只在模型请求或预览时临时生成，不写入数据库、消息、transcript、SSE 或普通日志。

本地开发和测试可以提供 `LocalFileStorage` 实现，但生产 C1 必须使用 `CosFileStorage`。两者遵循同一接口，业务层不感知存储供应商。

### 15.2 部署基线

| 配置项   | 值                                                             |
| -------- | -------------------------------------------------------------- |
| 服务     | 腾讯云对象存储（COS）                                          |
| Bucket   | `hello-agent-1256175414`                                       |
| 地域     | 广州，中国（`ap-guangzhou`）                                   |
| 访问域名 | `https://hello-agent-1256175414.cos.ap-guangzhou.myqcloud.com` |
| 权限     | 私有读写；模型和预览通过短期签名 URL 访问                      |

SecretId 和 SecretKey 不写入仓库、文档、日志、SSE 或数据库。服务端通过部署环境注入，例如：

```text
COS_SECRET_ID
COS_SECRET_KEY
COS_BUCKET=hello-agent-1256175414
COS_REGION=ap-guangzhou
```

密钥必须使用最小权限策略，仅允许该 Bucket 的对象读写、列举和删除；开发、测试、生产环境使用不同密钥。密钥泄露后必须立即禁用并轮换，不能只修改文档或环境变量。

### 15.3 Object Key 约定

COS 对象 key 不使用用户原始文件名作为路径，不接受客户端直接指定完整 key。建议由服务端生成：

```text
sessions/{sessionId}/files/{fileId}/original
sessions/{sessionId}/files/{fileId}/prepared/{variant}
sessions/{sessionId}/files/{fileId}/preview
```

原始文件名只作为数据库元数据保存并做展示转义。`fileId` 使用服务端生成的不可猜测标识；对象 key 不作为用户权限判断依据。

### 15.4 请求与生命周期

```text
浏览器 -> API：上传文件
API -> 校验：大小、MIME、魔数、图片解码和尺寸
API -> COS：写入 original
API -> DB：写入 File 和处理状态
Worker/API -> COS：生成 prepared image 与 preview
API -> DB：标记 ready
模型请求 -> API：按 fileId 生成短期签名 URL
模型适配器 -> Provider：发送 image_url
```

- 签名 URL 只在模型请求和预览期间临时生成，不持久化。
- 签名有效期应覆盖当前请求、网络超时和允许的重试窗口；重试时重新签名。
- COS 对象默认私有，禁止使用永久公开 URL。
- API 必须验证请求中的 `sessionId`、`fileId` 和用户归属，不能只凭 COS URL 放行。
- 会话删除先删除数据库关联，再异步清理 COS 对象；清理失败记录明确的待清理状态并支持重试。
- API 重启后，`uploading`/`processing` 文件不能直接恢复为 `ready`，必须通过校验任务重新确认。

### 15.5 COS 方案的边界

COS 只负责二进制对象存储和传输，不替代以下 C1 能力：

- `File`、`FilePart`、`MessageAttachment` 元数据和关系；
- 图片魔数校验、解码、尺寸限制和缩略图处理；
- 文本/PDF 解析、文本截断、页码/行号定位；
- 模型视觉能力协商和图片上下文预算；
- 文件处理状态、失败重试、取消、删除和重启恢复；
- 来源引用、权限校验、审计和日志脱敏。

因此 COS 会简化 C1-A 的存储与模型传参，但不会把 C1 简化成“上传后直接把 URL 放进消息”。

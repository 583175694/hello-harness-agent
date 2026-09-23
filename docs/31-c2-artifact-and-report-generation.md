# C2 Artifact & Report Generation / 产物与报告生成方案

> 文档状态：**C2-A–C2-D 已实施**。后续 Workbench 重构、模板/产物组等见各节「明确不做 / 后续升级」。
>
> 最后更新：2026-09-23。
>
> 本文记录 C2 产物与报告生成能力的阶段方向、冻结契约与验收标准。当前 C2-B 仍复用 Artifact 查看与下载链路，不冻结专用 Report Workbench。

## 1. 规划原则

C2 建立在现有 Agent Kernel 和 C1 文件基础之上，通过统一的 Tool、File、Artifact、Source 和 Workbench 边界接入，不为单个功能改写 Runtime 主循环。

阶段设计遵循以下原则：

- 每个阶段形成用户可验证的端到端闭环，不交付只有内部基础设施、无法使用的半成品。
- 已有通用能力优先复用，不为新入口复制上传、存储、状态、预览或恢复链路。
- 模型负责语义决策，Runtime 负责通用执行边界，Tool 负责具体能力，服务端负责持久化事实，前端只消费 canonical 投影。
- 当前尚未细化的阶段只记录方向和核心内容，不提前冻结数据结构、接口或实现细节。
- 未实现的能力不创建空工具、空页面或伪成功状态。

## 2. C2 阶段总览

```text
C2  Artifact & Report Generation
    -> C2-A 通用生成文件 Artifact
    -> C2-B 正式报告生成
    -> C2-C 多格式输出
    -> C2-D 产物版本与迭代
```

当前细化程度：

| 阶段      | 状态           | 说明                                                     |
| --------- | -------------- | -------------------------------------------------------- |
| C2-A      | 已实现         | 通用生成文件、Artifact、预览、下载、删除和恢复闭环已落地 |
| C2-B      | 当前范围已实现 | 正式 Markdown 报告、多报告持久化、Artifact 交付与恢复    |
| C2-C      | 已实现         | Markdown、HTML、PDF、DOCX、XLSX 多格式输出闭环已落地    |
| C2-D      | 已实现         | 线性不可变版本、revise/restore、乐观并发、Workbench 版本入口 |

## 3. C2 总体目标

C2 的目标是把 Agent 生成内容从 Conversation 中的一次性文本升级为可以持久化、预览、下载和继续迭代的用户交付物。

```text
C1：用户提供文件，Agent 读取
C2：Agent 生成文件，用户消费
```

## 4. C2-A 通用生成文件 Artifact

### 4.1 阶段定位

C2-A 一次性打通完整 Artifact 闭环，不再拆分为 Tool、Delivery 和 Lifecycle 三个子阶段。

阶段目标：

> 让 Agent 能通过受控工具创建一个与 Session/Run 关联，并可由用户可靠预览、下载、删除和恢复的生成文件。

C2-A 约束通用生成产物的技术生命周期，但不要求内容必须是一份报告。报告的结构、质量和正式交付语义属于 C2-B。

### 4.2 核心链路

```text
用户提出生成文件的任务
-> 模型决定调用 create_file
-> FileCreateTool 校验请求
-> FileCreateTool 创建 agent_generated File
-> FileStorage 保存 COS 内容并生成规范化正文
-> ArtifactService 创建关联关系
-> 工具返回 file_ref 和文件元数据
-> Runtime 继续模型循环并记录工具事实
-> Conversation / Workbench 展示文件卡片
-> 用户预览或下载
-> 刷新后从服务端恢复
```

这条链路复用现有 Model-led Tool Boundary，不新增独立 Artifact Runtime。

### 4.3 工具命名与职责

新增工具采用统一的文件能力命名：

```text
实现类：FileCreateTool
模型工具名：create_file
```

选择 `FileCreateTool` 而不是 `ArtifactCreateTool`，是因为“创建文件”对模型和用户更直接；Artifact 仍作为内部领域和持久化概念。

与读取工具形成一致的模型能力表面：

```text
search_file  搜索用户提供的可读文件
read_file    读取用户提供的可读文件
create_file  创建用户可消费的生成文件
```

C2-A 创建的文本类 Artifact 在处理方式上与用户上传的文本文件保持一致：生成内容先成为一个 `agent_generated` 类型的 File，后续对话需要使用已有产物内容时，模型通过现有 `read_file` 能力按需读取，不新增独立的 `ArtifactReadTool`。模型使用 `fileId/file_ref` 作为统一引用，Artifact 只作为服务端的交付关系，不参与文件内容读取。

`create_file` 不是任意文件系统写入工具：

- 模型不能传入绝对路径、相对存储路径或 object key。
- 模型不能覆盖用户工作区文件或上传文件。
- 服务端生成 `fileId`，选择受控存储位置，并在内部建立 Artifact 关系。
- 工具只创建新的生成产物；首版不提供覆盖、追加或任意路径写入。

### 4.4 内部架构边界

```text
FileCreateTool
-> FilesService / FileStorage
-> File metadata + COS object + normalized content
-> ArtifactService / ArtifactRepository
-> Artifact delivery relation
```

各层职责：

- `FileCreateTool`：模型工具声明、输入校验、执行策略和规范化工具结果。
- `FilesService / FileStorage`：统一负责 File 的内容保存、规范化正文、预览、下载和按需读取；用户上传文件与 Agent 生成文件共用这一层。
- `ArtifactService`：创建和管理生成交付关系，负责 Artifact 与 Session、Run、工具调用及 File 的关联，不重复保存文件内容。
- `ArtifactRepository`：保存 Artifact 与 File、Session、Run 的稳定关系。
- Projection：将 Artifact 事实投影为用户可理解的文件卡片和状态。
- API：提供受权的元数据、预览、下载和删除入口。

Runtime 继续只负责工具分派、超时、取消和模型循环，不理解文件内容，也不决定 Artifact 是否具有报告语义。

### 4.5 首版产物范围

C2-A 首版优先支持模型可以直接可靠生成的文本类文件，例如：

```text
Markdown
纯文本
JSON
```

首版重点是验证生成、保存、预览、下载和恢复闭环，不以支持大量格式为完成条件。

首版 `create_file` 使用一次性完整内容写入模型：模型提供文件名和内容，服务端根据受支持的扩展名推导并校验 MIME 类型后，按 Agent 生成文件创建 `File`，保存到 COS 并生成可读取的规范化正文。C2-A 不提供分段写入、追加或覆盖能力。

生成文件与用户上传文件共用 File 内容模型：

```text
File.origin = user_uploaded | agent_generated
File.fileId -> COS 原始内容和规范化正文
Artifact.fileId -> 生成交付对应的 File
```

`File` 是内容和读取的统一原语；`Artifact` 是该 File 作为 Agent 交付结果时的轻量业务关系。Artifact 不重复保存 `storageKey`、正文、解析状态或预览状态，也不引入独立的 `ArtifactStore`。

以下内容不阻塞 C2-A：

- 正式报告结构和报告质量判断。
- DOCX、PDF、XLSX 等格式渲染。
- 在线编辑器和段落级修改。
- 模板系统和复杂文档 AST。
- 正式 Evidence/Citation Validator。
- 任意工作区文件写入。
- 独立 Artifact 执行循环。

这些限制不影响一次 Run 创建多个独立 Artifact。每次成功调用 `create_file` 都形成一个独立文件，C2-A 不增加主产物、附属产物或复杂产物组关系。

### 4.6 完整阶段范围

C2-A 在一个阶段内完成：

- 模型可以调用 `create_file` 创建受支持文件。
- File 内容和元数据可靠保存，并复用 COS、规范化正文、预览和读取链路。
- Artifact 与对应 File、当前 Session、Run 和工具调用建立稳定关联。
- 工具结果返回稳定 `file_ref`/`fileId` 及必要文件元数据；不返回内部路径或 object key。
- Conversation 或 Workbench 展示生成文件卡片。
- 用户可以预览和下载受支持文件。
- 页面刷新和会话恢复后文件仍然可见。
- 创建、保存或投影失败时展示明确状态，不产生伪成功产物。
- 用户可以删除允许删除的生成文件，并清理对应存储内容。
- Session 删除时清理关联 Artifact。
- 工具执行支持现有取消、超时、日志脱敏和错误语义。
- 一次 Run 可以创建多个独立 Artifact；每个文件单独展示、预览和下载。
- 创建文本类 Artifact 后，后续 Run 可以通过 `read_file(fileId)` 按需读取对应 File 的内容。
- Markdown、纯文本和 JSON 使用对应的受控预览方式；预览受大小限制，下载返回完整原始内容。
- Markdown 预览默认展示渲染结果，下载保留 Markdown 源文；JSON 预览使用格式化后的代码视图。
- 创建、读取和下载均通过服务端归属和权限校验，不开放任意路径或 object key。

重新生成和复杂版本关系暂不作为 C2-A 的独立系统。用户可以通过新的 Run 创建新的 File 和 Artifact；如果需要修改已有文本文件，模型可以先通过 `read_file` 获取对应 `fileId` 的内容，再调用 `create_file` 生成新的 `agent_generated` File。旧 File 和旧 Artifact 不被静默覆盖，正式版本关系在 C2-D 细化。

### 4.7 File 与 Artifact 的关系

C2-A 采用以下稳定边界：

```text
File       = 文件内容、COS 存储、规范化正文、预览和读取
Artifact   = File 作为 Agent 生成交付物时的业务关系
fileId     = 模型和 read_file 使用的统一文件身份
artifactId = 服务端和交付投影使用的产物身份
```

创建流程为：

```text
create_file
-> 创建 File(origin = agent_generated)
-> 保存 COS 原始内容
-> 生成 normalized content
-> File.status = ready
-> 创建 Artifact(fileId, sessionId, runId, toolCallId)
-> 返回 file_ref(fileId, 文件元数据)
```

用户上传的 File 不自动创建 Artifact；只有 Agent 通过 `create_file` 生成的 File 才建立 Artifact 交付关系。`read_file` 只面向当前 Session 中状态为 `ready` 且允许读取的 File，底层不需要区分其来源是用户上传还是 Agent 生成。

后续上下文只需暴露当前对话中相关的轻量文件引用，例如文件名、`fileId`、媒体类型、大小和行数，并提示模型在需要正文时调用 `read_file`。不默认把 Artifact 全文重新注入 Context，也不要求模型使用 `artifactId` 读取文件。

### 4.8 与 Codex 的关系

Codex 可以通过文件系统能力写入工作区文件，并通过文件引用指令将输出文件展示给用户。可借鉴的核心模式是：

```text
模型决定生成文件
-> 受控工具执行写入
-> 工具返回文件事实
-> 界面展示文件引用
```

我们的应用不直接复制 Codex 的路径语义：

```text
Codex：模型 -> 工作区文件工具 -> 本地路径
本项目：模型 -> FileCreateTool -> File(fileId) + Artifact 交付关系
```

这样既保留工具驱动的模型自主性，也符合当前 Web、Session、Run、权限和服务端存储架构。

### 4.9 可靠性与容量边界

- 每次新的成功调用都创建新的 File 和 Artifact，不做内容级去重。
- 同一个 `runId + toolCallId` 的工具调用重放时返回同一个结果，不重复创建 File 和 Artifact；这只是最小重放幂等，不引入通用幂等系统。
- 单次 `create_file` 受文本内容大小限制；超过限制时返回明确错误，不静默截断。分段写入和大型文件生成不属于 C2-A。
- 创建过程中允许存在处理中状态；只有 File 内容、必要元数据和 Artifact 关系都完成持久化后，才投影为成功交付。
- COS 对象已写入但元数据未完成时，由服务端记录并清理孤儿对象；清理失败进入可重试清理状态。
- C2-A 中“恢复”仅指刷新、重连和重新进入 Session 后恢复已存在文件，不表示删除后的用户级恢复。
- 删除由 Artifact 交付入口协调对应 File 和 COS 内容的清理；删除后的文件不可继续通过 `read_file` 读取。删除恢复和版本回滚留给 C2-D。

### 4.10 C2-A 完成标准

- 用户明确要求生成文件时，模型可以自主调用 `create_file`。
- 成功结果形成真实 File 和 Artifact 关系，而不是只在 assistant 消息中声称“文件已生成”。
- 生成 File 可以预览、下载、删除，并在刷新或重新进入 Session 后恢复展示。
- Artifact 归属当前 Session 和 Run，跨 Session 不可越权访问。
- 模型和客户端都无法指定或获得内部存储路径。
- 工具失败、取消或超时时不显示未完整持久化的文件；同一工具调用重放不会重复创建结果。
- Conversation 不需要重复内联完整的大段产物正文。
- C2-A 不要求产物具有报告结构、来源覆盖或正式报告质量。

### 4.11 已确定的产品与技术决策

以下决策作为 C2-A 实施基线：

1. `create_file` 一次接收完整文件内容；首版不做分段写入。
2. 一个 Run 可以创建多个独立 Artifact，不区分主产物和附属产物。
3. Agent 生成内容直接创建 `agent_generated` File；文本类生成 File 纳入 `read_file` 的可读范围，后续对话通过 `fileId` 按需读取，不新增独立的 Artifact 读取工具。
4. 文件在 Conversation 中以交付卡片展示，Workbench 只提供详情和预览，不新增独立的全局文件管理器。
5. Markdown 默认渲染预览，TXT 使用纯文本预览，JSON 使用格式化代码预览；预览有大小上限，下载返回完整原始内容。
6. 每次新的成功调用都创建新的 File 和 Artifact，不做内容去重；同一 `runId + toolCallId` 重放返回原结果，存储孤儿对象由服务端清理。
7. 模型提供文件名和内容，MIME 类型由服务端根据扩展名推导并校验。
8. C2-A 只保留 Session、Run 和工具调用等基础关联，不提前引入 Evidence、Citation 或复杂来源关系。
9. File 统一负责 COS 内容、规范化正文、预览、下载、搜索和读取；Artifact 只保存 `fileId` 及生成交付关系，不重复保存内容，也不新增 `ArtifactStore`。
10. C2-A 的恢复只指页面、连接和 Session 恢复；删除恢复、版本回滚和复杂版本关系属于 C2-D。

## 5. C2-B 正式报告生成

> 状态：当前范围已实现。专用 Report Workbench、单报告删除 UI 和报告版本能力不属于本阶段完成条件。

### 5.1 阶段目标

C2-B 在 C2-A 的通用 Artifact 能力上增加“正式报告”这一明确的交付语义。用户提出调研、分析、总结或方案类任务时，模型可以把较长且可独立消费的最终成果交付为 Markdown 报告；服务端保存 Report 关系，用户通过现有 Artifact 界面预览、下载，并能随 Session 恢复生成文件。

```text
模型完成调查或材料分析
-> 调用 create_report
-> 服务端校验报告和材料引用
-> 生成 canonical Markdown File
-> 建立 Artifact + Report 关系
-> Conversation 展示生成过程和报告 Artifact
-> Artifact Workbench 提供预览与下载
-> 用户预览、下载或在后续 Run 中继续处理
```

当前阶段不建设独立 Report Workbench。报告首先是一类具有 Report 语义的 Artifact；未来 Workbench 重构可以基于现有 Report 表和接口重新设计报告阅读体验。

### 5.2 市场产品启示

成熟 Agent 的实现细节并不完全公开，但公开产品行为已经呈现出几个稳定模式：

- ChatGPT Deep Research 把多来源调查汇总为结构化、带来源的独立报告，允许用户在执行期间调整计划和来源，并支持将包含表格、图片、链接引用和来源的报告导出为 PDF。
- Gemini Deep Research 先生成可编辑的调查计划，调查完成后在独立 Canvas 中打开报告；报告按关键发现组织，链接原始来源，并支持复制、分享和导出 Google Docs。
- Claude Research 强调迭代搜索和易于检查的引用；Claude Artifacts 则把重要、独立、值得后续复用的长内容放到 Conversation 之外的专用窗口，并提供下载和后续修改入口。
- Perplexity Research 将搜索、阅读、推理和报告写作区分为连续阶段，最终报告可以导出为 PDF/文档或转成可分享页面。

这些产品值得借鉴的不是某个专有状态机，而是以下交付原则：

1. **报告是独立交付物，不是超长聊天消息。** Conversation 负责说明结果，完整内容由 Artifact 预览和下载承载。
2. **调查事实和报告表现分离。** 来源先作为已读取材料存在，报告再引用这些事实；导出格式不是报告内容的唯一事实源。
3. **可核查比“看起来正式”更重要。** 至少保留使用过的来源及原始链接；更强的逐主张引用校验可以后续增强，但不能伪装成已经验证。
4. **报告完成后仍可继续工作。** 用户可以下载，也可以在后续对话中基于报告继续提问或要求修改；首版不必同时实现在线编辑器。
5. **过程状态应少而真实。** 用户需要知道正在研究还是已经交付，不需要看到虚构的 review、validation 阶段。

本项目采用这些原则，但不复制计划审批、后台通知、公开分享、在线协作和多格式导出；它们分别由现有 Plan/Run、后续产品阶段或 C2-C/C2-D 承担。

### 5.3 报告与普通 Artifact 的判定

不根据文件名、长度或 Markdown 标题推断报告。模型显式调用专用工具：

```text
实现类：ReportCreateTool
模型工具名：create_report
```

适合调用 `create_report` 的内容：

- 用户明确要求报告、调研结果、分析文档或正式方案；
- 内容较长、自包含，离开 Conversation 仍可独立理解；
- 用户很可能需要预览、下载、保存或继续修改。

简短回答、普通代码片段、原始 JSON、临时笔记和用户仅要求创建普通文件的场景继续使用最终回答或 `create_file`。Runtime 不强制每个 Run 生成报告，服务端也不对模型的语义选择进行二次猜测。

### 5.4 工具契约

首版输入保持紧凑，不引入章节 AST：

```ts
type CreateReportInput = {
  title: string;
  summary: string;
  fileName: string; // 仅 .md，不包含路径
  content: string; // 完整 canonical Markdown
  sourceIds?: string[]; // 模型声明与报告关联的网页来源
  fileIds?: string[]; // 当前 Session 中实际使用的材料文件
};
```

工具结果返回：

```ts
type CreateReportResult = {
  report: ReportRef;
  artifact: ArtifactRef;
  file: FileRef;
};
```

其中 `ReportRef` 包含报告持久化所需的稳定字段：`reportId`、`artifactId`、`runId`、`title`、`summary`、`sourceIds`、`fileIds`、`status`、`createdAt` 和 `updatedAt`。工具结果和实时完成事件携带该引用，但当前 Session 恢复只需要 ArtifactRef，不额外恢复 ReportRef；完整正文继续由 File/COS 和预览接口负责。

选择 Markdown 作为 C2-B canonical 内容，是因为它已经支持标题、段落、列表、表格、代码块和链接，并能直接复用现有安全预览、下载与文件读取链路。C2-B 不建立自定义文档 AST。C2-C 如需 DOCX/PDF/HTML，可从受控 Markdown 和 Report 元数据渲染；只有实际格式需求证明 Markdown 不足时，再引入更强的中间表示。

### 5.5 内容结构与服务端处理

工具描述要求模型生成一份可独立阅读的报告，通常包含：

- 标题与简短摘要；
- 与任务匹配的正文层级；
- 清晰的关键发现、结论或建议；
- 已知限制；
- 使用过的材料与网页来源。

这些是内容质量要求，不冻结所有报告必须共享同一模板。旅行方案、技术调查、市场分析和文件总结可以有不同章节，不为了形式完整强行生成空的“结论”或“限制”章节。

服务端负责：

- 校验标题、摘要、文件名、Markdown 总长度和引用数量；
- 拒绝原始 HTML、脚本、iframe、data URL 和其他危险嵌入；
- 根据 `sourceIds` 和已验证的 `fileIds` 记录报告的“参考来源/材料”关联；
- 保存 `.md` 原文并生成现有规范化正文；
- 不改写模型正文中的普通外链，但预览继续执行现有安全渲染与外链策略。

模型可以在正文中使用普通 Markdown 链接，但 C2-B 不把普通链接声称为已验证的逐主张 Citation。`sourceIds` 表示“报告使用了这些材料”，不表示来源必然支持报告中的每一句话。

### 5.6 数据模型

继续复用：

```text
File       内容、COS、规范化正文、预览、下载和 read_file
Artifact   Agent 交付关系
Report     Artifact 的报告语义和材料关联
```

新增轻量 `Report` 持久化关系，而不是把报告状态塞进 Message metadata：

```text
Report
  id
  artifactId       unique
  runId
  title
  summary
  sourceIds        JSON string[]
  fileIds          JSON string[]
  status           ready | deleted
  createdAt
  updatedAt
```

`Artifact` 和 `File` 继续拥有存储及删除生命周期，Report 不重复保存正文、object key、MIME 或预览数据。一个 Run 可以创建多个独立 Report，每次成功调用对应一个 Report；C2-B 不引入主报告、报告组、附件或版本树关系。

### 5.7 来源与材料关联

C2-B 支持最小、诚实的可追溯性：

- `sourceIds` 由模型声明；当前阶段不以“本次 Run 是否成功 Fetch、是否具有可用 Passage”作为创建报告的阻断条件。
- `fileIds` 只能指向当前 Session 中状态为 `ready` 的文件，包括用户上传文件和先前生成文件。
- 服务端对两类 ID 去重并按模型提交顺序保留；`fileIds` 中未知、越权、已删除或不可用的引用仍使本次工具调用失败。
- 没有网页来源是合法情况，例如报告完全基于用户文件或模型已有知识；UI 不显示空“来源”区域。

当前 Workbench 分别展示 Artifact 和本次 Run 的来源投影，不建设 report-scoped 来源联动。C2-B 不引入 Evidence、Claim、`[Sx]`、锚点级 cited-by 或 Citation Validator；这些属于 K6。

### 5.8 生命周期、幂等与失败边界

C2-B 不新增独立报告生成状态机。用户可见状态保持为：

```text
generating -> ready
           -> failed / cancelled
```

`generating` 由正在运行的 `create_report` Tool Activity 表达，不持久化一个长期 draft Report。只有 Markdown File、Artifact 和 Report 关系全部成功后才投影 `ready`；此前不会展示可下载的正式报告。

可靠性规则：

- 同一 `runId + toolCallId` 重放返回同一结果，不重复创建 File、Artifact 或 Report。
- 同一 `runId + toolCallId` 重放返回同一 Report；同一 Run 使用新的 `toolCallId` 可以继续创建另一份独立 Report。修改既有报告仍通过后续 Run 创建新报告，版本关系留给 C2-D。
- 输入校验在写入 COS 前完成。File/Artifact 创建成功而 Report 写入失败的极低概率跨存储异常，当前不提供强事务回滚；遗留对象会随 Session 删除进入统一清理流程。
- 工具失败、取消或超时不产生正式报告 Artifact；Runtime 可让模型修正参数后重试。同一 Run 可使用不同 `toolCallId` 创建多份报告。
- 当前不提供单报告删除 UI；用户删除 Session 时级联删除 File、Artifact 和 Report，并执行 COS 清理补偿。后端保留报告/Artifact 删除接口供后续 Workbench 使用。
- Run 最终回答失败但 Report 已经创建成功时，报告仍作为已交付事实保留，不能把已存在的文件回滚成不存在。

### 5.9 容量与安全边界

沿用 C2-A 的文件名、路径隔离、归属校验和 Markdown 安全渲染，并增加少量报告级限制：

- `title` 最多 200 个 Unicode 字符；`summary` 最多 1,000 个字符；
- `content` 首版最多 40,000 个 Unicode 字符，与 `create_file` 保持一致；
- `sourceIds` 和 `fileIds` 各最多 50 个，单个数组内不得重复；
- `fileName` 必须是普通 `.md` 文件名，不能包含路径；
- 超限或非法输入明确失败，不静默截断或移除引用；
- 不允许原始 HTML、可执行脚本、远程 iframe、内联 data URL 或模型指定 COS/object key。

首版允许安全 Markdown 表格和代码块；不支持内嵌上传图片、远程图片代理、图表、脚注级引用语法和附件打包。它们不阻塞一份高质量文本报告的交付。

### 5.10 Conversation 与 Artifact Workbench

Conversation 在报告成功后展示：

- `create_report` 工具活动及“生成报告：{标题}”摘要；
- 报告对应的 Markdown Artifact 卡片；
- 在 Artifact Workbench 中预览或下载 Markdown。

完整 Markdown 不重复插入最终聊天文本。模型最终回答只需说明已完成、概括关键结论并提醒重要限制。

当前生产链路复用 Artifact Workbench：

- 从 assistant metadata 中恢复报告对应的 ArtifactRef；
- 使用现有安全 Markdown 预览接口读取完整正文；
- 提供 Markdown 预览和下载入口；
- 刷新、切换 Session 和 SSE 重连后恢复相同 Artifact；
- 删除 Session 后清理报告数据库关系和存储对象。

专用 Report Tab、报告级来源/材料视图、单报告删除和编辑能力留给后续 Workbench/C2-D 重构。开发预览中的 Report fixture 不代表当前生产能力。

### 5.11 明确不属于 C2-B

- PDF、DOCX、HTML 等多格式渲染和格式模板，属于 C2-C；
- 在线编辑、局部修改、版本选择、覆盖与回滚，属于 C2-D；
- Evidence/Claim 模型、逐主张引用、`[Sx]`、Citation Validator 和自动事实复核，属于 K6；
- 自动生成图表、执行数据分析代码和复杂表格处理，依赖 C3；
- 公开分享链接、多人协作、评论、发布和全局报告管理器；
- 报告模板市场、品牌主题、目录 AST、脚注引擎和后台通知；
- 强制的 research plan 审批或专用 Deep Research Runtime。

### 5.12 当前实施范围与完成标准

C2-B 当前范围以下列内容作为完成标准：

1. `create_report` 工具、输入输出协议、参数摘要和模型工具说明落地。
2. Report migration、持久化关系、同 Run 多报告和 Session 归属校验落地。
3. 相同 `runId + toolCallId` 重放不重复创建；不同 `toolCallId` 可以创建多份报告。
4. 网页 `sourceIds` 不因当前 Run 的 Fetch 状态阻断创建；`fileIds` 继续执行就绪状态和 Session 归属校验。
5. Conversation 展示报告工具活动和 Markdown Artifact；刷新后可恢复 Artifact，并能预览和下载完整正文。
6. 删除 Session 时级联删除 Report/File/Artifact，并通过清理任务删除存储对象。
7. 标题、摘要、Markdown 长度、文件名、重复 ID 和危险内容继续使用协议及文件安全边界。
8. 使用真实模型完成单报告、多报告、无来源、部分来源失败、刷新恢复和会话删除的人工端到端验收。
9. README、implementation-status 和本文同步到真实能力。

当前明确接受并延期处理：

- 独立 Report Workbench 及报告专用查看、删除和来源联动；
- Session 恢复中的 ReportRef/reportId 投影。当前 Artifact 预览下载不依赖它，未来若要调用报告专用接口，必须补充 reportId 恢复或按 artifactId 查询 Report 的能力；
- File/Artifact 与 Report 跨步骤创建的强原子事务。当前失败可能留下无报告关系的隐藏 Artifact/File，随 Session 删除清理；
- 报告版本、局部编辑、覆盖和回滚。

### 5.13 调研来源

- [OpenAI：Deep research in ChatGPT](https://chatgpt.com/features/deep-research/)
- [OpenAI：ChatGPT Release Notes（Deep Research PDF export）](https://help.openai.com/en/articles/6825453-chatgpt-release-notes)
- [Google：Use Deep Research in Gemini Apps](https://support.google.com/gemini/answer/15719111?hl=en&co=GENIE.Platform%3DDesktop)
- [Google：Try Deep Research in Gemini](https://blog.google/products-and-platforms/products/gemini/google-gemini-deep-research/)
- [Anthropic：Use research on Claude](https://support.claude.com/en/articles/11088861-use-research-on-claude)
- [Anthropic：What are artifacts and how do I use them?](https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them)
- [Perplexity：What is Research mode?](https://www.perplexity.ai/help-center/en/articles/10738684-what-is-research-mode)

## 6. C2-C 多格式输出

> 状态：**已实施**（2026-09 前完成）。本阶段以“能稳定生成、打开、下载和恢复”为完成目标，不建设通用文档平台。

### 6.1 阶段目标与设计判断

C2-C 在现有 File、Artifact、COS 和规范化正文链路上增加 Markdown、HTML、PDF、DOCX、XLSX 五种生成格式。对模型继续只暴露一个 `create_file`，不新增 `create_pdf`、`create_docx`、`create_xlsx` 等格式专用工具。

核心分工保持为：

```text
模型负责生成内容或表格数据
-> create_file 表达文件交付意图
-> 服务端按文件扩展名执行确定性渲染
-> File 保存原文件和规范化正文
-> Artifact 建立本次 Run 的交付关系
```

统一发生在工具、存储和交付层，不强求所有格式共享同一种内容表示：

- Markdown、HTML、PDF、DOCX 属于文档类输出，统一使用 Markdown 作为生成源；
- XLSX 属于结构化工作簿输出，使用最小 `sheets/rows` 数据结构；
- 模型不直接生成 PDF 二进制、Office Open XML、Base64 文件或服务端路径；
- C2-C 不新增 Artifact Runtime、渲染微服务、任务队列、模板数据库或通用 Document AST。

这一设计承认 Markdown 不能完整表达专业 Word、PDF 和 Excel 的全部语义。它是当前功能阶段的 canonical 文档内容，不被定义为长期覆盖所有 Office 能力的永久中间表示。

### 6.2 `create_file` 输入协议

格式以 `fileName` 的受支持扩展名为唯一事实来源，首版不增加与扩展名重复的 `format` 字段。扩展名解析必须集中在协议校验和生成文件渲染入口，其他服务不得自行维护不同的格式映射。

概念输入为：

```ts
type CreateFileInput = {
  fileName: string;

  // txt、md、markdown、json、html、pdf、docx 使用
  content?: string;

  // xlsx 使用
  sheets?: Array<{
    name: string;
    rows: Array<Array<string | number | boolean | null>>;
  }>;
};
```

为保持兼容，C2-A 已支持的 TXT 和 JSON 继续保留。条件规则为：

- `.xlsx` 必须提供非空 `sheets`，且不得同时提供 `content`；
- 其他受支持格式必须提供非空 `content`，且不得提供 `sheets`；
- `fileName` 仍只能是普通文件名，不能包含路径、对象 key 或空字节；
- Markdown 文档源继续受字符数和字节数限制，XLSX 单独限制 Sheet 数、总行数、总单元格数和最终文件大小；
- 工具描述必须明确：HTML、PDF 和 DOCX 的 `content` 是 Markdown，不是原始 HTML、XML 或 Base64；
- JSON Schema 保持扁平，由 Zod `superRefine` 完成扩展名相关的条件校验，不为首版引入复杂工具 schema。

首版规模上限冻结为：最多 10 个 Sheet、每个 Sheet 最多 5,000 行、单次总计最多 100,000 个单元格、单个字符串单元格最多 32,000 个 Unicode 字符、最终 XLSX 文件最多 10 MB。Sheet 名最长 31 个 Unicode 字符；超出输入边界直接拒绝，不截断工作簿内容。

文档示例：

```json
{
  "fileName": "industry-report.pdf",
  "content": "# 行业调研报告\n\n## 结论\n\n正文……"
}
```

工作簿示例：

```json
{
  "fileName": "sales-summary.xlsx",
  "sheets": [
    {
      "name": "销售汇总",
      "rows": [
        ["区域", "销售额", "同比"],
        ["华东", 1200000, 0.18],
        ["华南", 930000, 0.12]
      ]
    }
  ]
}
```

### 6.3 最小内部实现

首版只增加一个薄的生成文件渲染模块，例如：

```text
apps/api/src/files/generated-file.renderer.ts
```

它可以是一个函数和一个扩展名 `switch`，不建立 Renderer 注册表、依赖注入 token 或插件体系：

```ts
type RenderedGeneratedFile = {
  buffer: Buffer;
  mediaType: string;
  fileKind: FileKind;
  normalizedContent: string;
};

async function renderGeneratedFile(input: CreateFileInput): Promise<RenderedGeneratedFile>;
```

生成链路从当前的 `content -> UTF-8 Buffer` 调整为：

```text
create_file input
-> renderGeneratedFile
-> Buffer + normalizedContent + mediaType + fileKind
-> 现有 FilesService / FileStorage
-> 现有 Artifact 创建与幂等链路
```

`originalKey` 保存用户下载的真实 HTML、PDF、DOCX 或 XLSX；`normalizedKey` 保存后续 `read_file/search_file` 使用的可读文本。文档类格式保存输入 Markdown 作为规范化正文，XLSX 保存带 Sheet 边界的 Markdown 表格或稳定纯文本表示。

数据库 `FileKind` 已包含 PDF、DOCX、XLSX 与 **html**（Prisma 枚举迁移已完成），并同步扩大 `fileRefSchema`、`artifactRefSchema`、文件 MIME 映射、文件图标和生成服务类型范围；不为多格式输出增加新表。首版只接受 `.html`，不增加 `.htm` 别名。

`createFileInputSummarySchema` 也必须覆盖两类输入：文档类记录文件名、内容字符数和字节数；工作簿类记录输入类型、Sheet 数、总行数和总单元格数。完整正文和完整 Sheet 数据不得进入工具事件、快照、日志或模型上下文。

### 6.4 各格式生成路线

#### Markdown、TXT 和 JSON

- Markdown/TXT 延续当前 UTF-8 保存方式；
- JSON 延续现有合法性校验和规范化正文；
- 不改变已有调用的输出和幂等语义。

#### HTML

```text
Markdown
-> remark/rehype 受控解析
-> 固定 HTML 文档外壳和基础 CSS
-> UTF-8 HTML Buffer
```

首版支持标题、段落、粗体、斜体、删除线、列表、链接、引用、代码块、分隔线和 GFM 表格。首版不支持图片、原始 HTML、脚本、iframe、事件属性、数学公式、脚注、Mermaid、SVG、模型自定义 CSS、`data:` 资源和自动远程资源加载。普通 `https://` 超链接可以保留，但 HTML/PDF 生成不得自动访问链接目标。HTML 的规范化正文仍为输入 Markdown。

`.html` 的 `content` 仍然是 Markdown，不是原始 HTML。服务端必须拒绝或转义原始 HTML，不能将模型提供的标签直接作为 HTML 文档执行。

#### PDF

```text
Markdown
-> 与 HTML 相同的受控 HTML 和打印 CSS
-> Playwright/Chromium page.pdf()
-> PDF Buffer
```

首版固定 A4 纵向、基础页边距和中文字体栈，不暴露页面尺寸、方向、页眉页脚和主题参数。Chromium 是该路线真实存在的生产依赖，需要在部署镜像中固定版本、字体和必要系统库，并限制单实例并发；本阶段不因此增加独立 PDF 服务。

PDF 生成使用进程级复用的 Browser、每次调用新建 Page 的最小生命周期：并发初始限制为 1–2 个 Page，成功、失败和取消都必须关闭 Page。Chromium 启动失败返回明确的渲染不可用错误，不静默降级为 HTML。PDF 页面不得访问任意外部网络资源，避免 SSRF、结果不稳定和无界等待。

#### DOCX

```text
Markdown
-> Markdown AST
-> docx-js 的 Paragraph/List/Table/TextRun
-> DOCX Buffer
```

首版只映射与 HTML/PDF 相同的基础 Markdown 子集，并使用固定 A4、中文字体、Heading 1-3、正文、代码块和基础表格样式。使用 `docx-js` 是用一定映射代码换取纯 Node、MIT 许可证和更低部署复杂度；如果后续需求进入脚注、复杂目录、精确分页、多栏或高保真模板，再根据真实需求评估 Pandoc 或模板方案，不在 C2-C 提前引入。

#### XLSX

```text
sheets[].rows
-> ExcelJS Workbook
-> XLSX Buffer
```

首版支持多个 Sheet，以及 string、number、boolean、null 四类单元格值。服务端仅应用固定的基础可用性处理：清理并去重 Sheet 名、首行加粗、冻结首行、开启筛选、根据内容设置有上下限的列宽。

首版不支持公式、图表、透视表、条件格式、图片、宏、外部链接、合并单元格或任意样式。普通字符串即使以 `= + - @` 开头也按文本处理，不自动推断为公式，避免公式注入和错误语义。

Sheet 名称处理规则冻结为：移除 Excel 禁止字符 `\\ / ? * [ ] :`，空名称改为 `Sheet1`、`Sheet2`，超长名称截断到 31 个字符，重名按 `名称 (2)`、`名称 (3)` 方式去重；普通名称冲突不使整个生成失败。最终名称必须写入 XLSX normalized 内容。

XLSX normalized 内容使用稳定的 Sheet 边界和 Markdown 表格：

```md
[Sheet: 销售汇总]

| 区域 |  销售额 | 同比 |
| ---- | ------: | ---: |
| 华东 | 1200000 | 0.18 |
```

表格生成时必须转义单元格中的 `|` 和换行；不为了追求漂亮预览而静默丢弃超长单元格。

### 6.5 依赖选择

首版优先保持在现有 Node/NestJS 运行时内：

| 用途                 | 首选方案                | 当前判断                                        |
| -------------------- | ----------------------- | ----------------------------------------------- |
| Markdown 解析与 HTML | unified、remark、rehype | AST 可复用于 HTML 和 DOCX，安全边界清晰         |
| PDF                  | Playwright/Chromium     | 与 HTML 共用排版，但必须接受浏览器运行时成本    |
| DOCX                 | `docx`                  | TypeScript 原生、MIT、无需 Pandoc/LibreOffice   |
| XLSX                 | `exceljs`               | Node 原生、MIT，满足首版多 Sheet 和类型化单元格 |

Pandoc、WeasyPrint、LibreOffice、Gotenberg、Carbone 和 Docxtemplater 均不作为首版必需依赖：

- Pandoc 转换能力成熟，但增加二进制部署和 GPL 许可证评估；
- WeasyPrint 的文档分页能力较好，但增加 Python 和原生库运行时；
- LibreOffice/Gotenberg 更适合复杂 Office 转换或独立转换服务，当前规模下偏重；
- Carbone/Docxtemplater 更适合后续品牌模板和固定业务单据，不适合当前通用内容 MVP。

### 6.6 保存、幂等与失败语义

C2-C 继续复用 C2-A 的 `runId + toolCallId` 幂等约束和 Artifact/File 清理逻辑。一次工具调用只创建一个格式文件，不自动额外创建 Markdown 源文件或多格式产物组。

推荐顺序为：

```text
校验 Run、Session 和幂等调用
-> 校验文件名与格式相关输入
-> 在内存中完成渲染并执行最低有效性检查
-> 创建 File(processing)
-> 保存 original 和 normalized
-> File ready
-> 创建 Artifact ready
```

渲染失败时：

- 不创建用户可见 Artifact；
- 不保留没有 Artifact 关联的生成 File；
- 不把 Markdown 文本伪装成 PDF、DOCX 或 XLSX；
- 返回统一的生成/渲染失败错误和可理解的 detail；
- 不因为目标格式失败而静默降级成另一种格式。

首版保持同步工具调用，将 `create_file` 超时从当前 10 秒调整到适合文档渲染的有限值，初始建议 30 秒。只有线上数据证明渲染经常超过同步预算时，才考虑异步处理或任务队列。

渲染必须承接现有 `ToolExecutionContext.signal`：

- Playwright 在取消或超时时关闭当前 Page；
- DOCX/XLSX 在开始和结束阶段检查取消信号，不能把已取消调用继续提交为成功 Artifact；
- 工具超时、用户取消和渲染异常继续分别映射为现有 `timeout`、`cancelled` 和 `failed` 语义；
- 所有成功、失败、取消路径都要释放 Browser/Page、临时 Buffer 和文件清理资源。

### 6.7 最低验证标准

验证目标是避免损坏文件和伪成功，不在首版建设视觉质量评分系统：

- HTML：是完整 UTF-8 文档，不包含被禁止的主动内容；
- PDF：以 `%PDF-` 开头，并能被现有 PDF 解析能力读取页数和文本；
- DOCX/XLSX：具有合法 ZIP/OOXML 文件头，并能被现有 Office 解析能力重新读取；
- 所有格式：中文内容不丢失，生成结果不为空，最终大小不超过限制；
- XLSX：Sheet 数、名称和单元格类型符合输入；
- 失败路径：对象保存部分失败时执行现有补偿清理，不投影成功文件卡片。

不要求首版完成逐页截图比对、跨 Office 版本兼容矩阵、像素级排版检查或自动质量打分。

下载接口必须继续返回与扩展名匹配的 MIME 类型，并通过现有 `Content-Disposition` 处理中文文件名。HTML 作为独立 `fileKind` 处理，不把它归入普通 `text`，以便文件图标、预览和后续统计保持一致。

### 6.8 预览与前端范围

C2-C 不新增预览工具。Conversation 和 Artifact Workbench 继续使用现有文件卡片、下载和恢复链路：

- Markdown 和 HTML 可以继续使用受控文本/Markdown 预览；
- PDF、DOCX、XLSX 首版可以展示规范化正文预览并提供真实原文件下载；
- 如果浏览器已有稳定 PDF 内嵌预览能力，可以复用，但不作为后端多格式生成完成的阻断项；
- 不在本阶段开发 Word 或 Excel 浏览器编辑器。

### 6.9 明确不属于 C2-C

- 模板上传、模板市场、品牌主题和自定义 CSS；
- 通用 Document AST 或跨格式无损往返；
- DOCX 批注、修订、脚注、复杂目录、多栏和精确分页；
- PDF 封面设计、复杂页眉页脚、水印和任意页面配置；
- XLSX 公式、图表、透视表、图片、宏和复杂样式；
- Mermaid、SVG 和远程图片抓取；
- 多格式产物组和“一次生成全部格式”；
- 独立渲染微服务、异步队列和渲染插件系统；
- 在线编辑和版本关系，仍属于 C2-D。

### 6.10 推荐实施顺序

```text
1. 扩大 create_file 输入、摘要和 Artifact/FileKind 协议
2. 提取 renderGeneratedFile，保持已有文本格式兼容
3. 完成 Markdown -> HTML
4. 复用 HTML 完成 PDF
5. 完成基础 Markdown AST -> DOCX
6. 完成 sheets/rows -> XLSX
7. 补齐下载、恢复、幂等、清理和格式有效性测试
```

实现前先用三份固定样例做技术验证：

1. 包含中文、标题、列表和表格的普通报告，验证 HTML、PDF、DOCX；
2. 包含代码块、长表格和分页边界的技术报告，观察三种文档格式的可接受程度；
3. 包含多个 Sheet、空值、数字和布尔值的 XLSX，验证类型与规范化正文。

技术验证的目的只是确认所选库可以覆盖冻结的 MVP，不把样例验证扩展成独立原型平台。

### 6.11 完成标准

C2-C 只有在以下内容一起完成时才算完成：

1. 模型通过同一个 `create_file` 生成 Markdown、HTML、PDF、DOCX、XLSX；TXT 和 JSON 保持兼容。
2. HTML、PDF、DOCX 使用 Markdown 文档源；XLSX 使用最小 `sheets/rows` 输入。
3. 所有输出都是可被标准软件打开的真实格式，不存在扩展名与内容不符的伪文件。
4. 生成文件复用现有 File、COS、Artifact、下载、删除、恢复和规范化正文读取链路。
5. 中文、基础标题、段落、列表、链接、代码块和表格在支持的文档格式中达到可用水平。
6. XLSX 支持多 Sheet 和基础单元格类型，且规范化正文可被 `read_file/search_file` 使用。
7. 重复工具调用、超时、取消、渲染失败、对象保存失败和清理补偿均有自动化测试。
8. 前端文件卡片、文件类型、下载和刷新恢复对五种目标格式正确工作。
9. 实现未引入新的格式专用模型工具、通用文档平台、模板系统或异步渲染基础设施。

协议和运行时实现还必须覆盖：

10. Markdown 不支持图片、原始 HTML、公式、Mermaid、SVG 和远程资源自动加载；
11. XLSX 上限、Sheet 清理去重、normalized Markdown 边界和单元格转义行为通过测试；
12. PDF Chromium 的 Page 生命周期、并发限制、取消清理和启动失败语义通过测试；
13. `html` FileKind、MIME 映射、下载文件名和 `create_file` 摘要协议与数据库迁移保持一致。

### 6.12 后续升级触发条件

后续能力不按理论完整性提前建设，只在出现可度量问题后升级：

- DOCX 基础 Markdown 映射无法满足明确的高频排版需求时，再评估 Pandoc 或模板引擎；
- PDF 同步渲染频繁超过超时或 Chromium 资源成为瓶颈时，再评估进程池、异步队列或 Gotenberg；
- 用户明确需要品牌一致性时，再增加少量服务端模板，不开放任意模板执行；
- XLSX 出现稳定的公式或图表需求时，再通过显式结构扩展，不能从普通字符串隐式推断；
- 多格式批量导出成为高频需求时，再设计产物组，不改变当前一次调用一个 Artifact 的语义。

### 6.13 实施会话交接清单（归档）

C2-C 已按 §6.11 完成标准交付。以下清单保留作实施记录；新能力扩展见 §6.12，不重复开工 C2-C 本体。

#### 开工前必须确认

1. 生产 API 镜像可以运行 Playwright/Chromium，并提供可用的中文字体和必要系统库；
2. HTML 作为独立 `FileKind`，接受一次 Prisma 枚举迁移；
3. `create_file` 继续使用 `fileName` 扩展名路由，不增加 `format` 字段；
4. 文档类 `content` 严格为 Markdown，XLSX 严格使用 `sheets/rows`。

如果第一项无法满足，必须在实现 PDF 前停下来重新选择 PDF 运行路线，不允许先生成一个不稳定的临时方案。

#### 首批代码落点

按以下顺序实施：

1. 更新 `createFileInputSchema`、`createFileInputSummarySchema`、`artifactRefSchema` 和工具定义；
2. 增加 `html` FileKind migration，并同步 MIME、文件引用、Artifact、文件图标和下载映射；
3. 提取 `apps/api/src/files/generated-file.renderer.ts`，保持 TXT/Markdown/JSON 兼容；
4. 实现 Markdown -> HTML；
5. 复用 HTML -> PDF，并完成 Browser/Page 并发、取消和清理；
6. 实现基础 Markdown AST -> DOCX；
7. 实现 `sheets/rows` -> XLSX 及 normalized Markdown；
8. 补充协议、渲染、存储、下载、恢复、幂等和失败清理测试。

#### 开工前固定测试样例

- 中文报告：标题、列表、GFM 表格、代码块和普通链接；
- 长文档：长表格、分页边界和中文混排；
- 多 Sheet 工作簿：空值、数字、布尔值、长字符串、非法 Sheet 字符和重名 Sheet。

验收只关注真实文件可打开、中文不丢失、下载 MIME 正确、normalized 内容可读取，以及失败/取消不产生伪 Artifact；不把首版验收扩展成像素级排版评审。

#### 实施会话的停止条件

实现过程中如果发现以下任一情况，应先回到方案评审，而不是自行扩展范围：

- 需要增加新的模型工具才能完成某个格式；
- 需要引入通用 Document AST、模板数据库或异步渲染平台；
- 需要让模型直接生成 HTML、OOXML、Base64 或文件路径；
- 需要隐式把普通字符串识别为 XLSX 公式；
- 需要为 PDF 生成访问任意外部网络资源。

除上述情况外，优先在当前 MVP 边界内完成闭环，再用真实失败数据决定是否升级。

### 6.14 调研来源

- [Pandoc：通用文档转换能力](https://pandoc.org/)
- [WeasyPrint：HTML/CSS 到 PDF](https://weasyprint.org/)
- [docx-js：TypeScript/JavaScript DOCX 生成](https://docx.js.org/)
- [ExcelJS：Node.js XLSX 读写](https://github.com/exceljs/exceljs)
- [Anthropic：公开 Agent Skills](https://github.com/anthropics/skills)
- [Anthropic：DOCX Skill](https://github.com/anthropics/skills/tree/main/skills/docx)
- [Anthropic：PDF Skill](https://github.com/anthropics/skills/tree/main/skills/pdf)
- [Anthropic：XLSX Skill](https://github.com/anthropics/skills/tree/main/skills/xlsx)
- [Gotenberg：文档转换服务](https://gotenberg.dev/)
- [Docxtemplater：Office 模板生成](https://docxtemplater.com/)

## 7. C2-D 产物版本与迭代

> 状态：**已实施**。实现落点：`ArtifactSeries` / 版本字段（Prisma）、`ArtifactsService`（create/revise/restore/current 推进）、Run `artifactVersionContext`、Workbench 版本 UI；集成测试见 `apps/api/test/integration/app.integration.spec.ts`（C2-D 版本链与并发冲突）。

### 7.1 阶段定位

C2-D 把现有“每次 `create_file` 创建一个独立 Artifact”的能力扩展为可追踪、可恢复的线性版本历史，但不把系统扩展成在线编辑器或完整版本控制平台。

阶段目标：

> 用户可以基于已有 Artifact 发起新的 Run 生成下一版本；所有成功版本保持不可变且可独立预览、下载和恢复；恢复旧版本本身也生成一个新的最新版本，不覆盖或删除任何历史事实。

该方案采用市场上成熟 Agent 产品已经验证的共同语义：不可变版本、线性历史、恢复生成新版本、Artifact 历史与聊天历史分离。首版只实现满足用户闭环所需的最小版本模型，不预先引入分支、合并、Draft 或多人协作能力。

### 7.2 核心原则

1. 每次修改由新的 Run 驱动，并创建新的 `File` 和 `Artifact`；旧 File、Artifact、Run、消息和工具调用不被覆盖或删除。
2. 同一个逻辑产物的版本组成单一线性时间线，首版不实现 Git 式 DAG、分支或合并。
3. 恢复旧版本不是把当前指针倒退，而是复制指定旧版本的内容并创建一个新的最新版本。
4. 只有 File 和 Artifact 均完整持久化并进入 `ready` 状态后，才能推进当前版本。
5. 失败、取消、超时和并发冲突保留对应 Run 事实，但不得改变当前版本或产生伪成功 Artifact。
6. `create_file` 仍是模型创建版本的唯一写入工具；C2-D 不新增 `edit_file`、局部 patch 或任意文件覆盖协议。
7. Markdown、HTML、PDF、DOCX、XLSX 使用相同的版本语义；格式差异只属于已有渲染与预览链路。

### 7.3 领域模型

C2-D 增加轻量 `ArtifactSeries`，用于表示跨版本稳定的“同一个逻辑产物”。它只承担系列身份、展示名称和当前版本指针，不承载分支、权限、协作者或发布流程。

```text
ArtifactSeries
- id
- sessionId
- logicalName
- currentArtifactId nullable
- createdAt
- updatedAt
```

现有 `Artifact` 增加以下版本字段：

```text
Artifact
- 现有字段
- seriesId
- versionNumber
- parentArtifactId nullable
- sourceArtifactId nullable
- operation: create | revise | restore
- changeSummary nullable
```

字段语义：

- `seriesId`：同一个逻辑产物跨版本的稳定身份。
- `versionNumber`：系列内单调递增的展示版本号，从 1 开始。
- `parentArtifactId`：线性时间线中的直接上一版本。
- `sourceArtifactId`：可选的内容来源。普通修改通常为空；恢复时指向被恢复的旧版本。
- `operation`：区分首次创建、基于版本修改和恢复。
- `changeSummary`：可选的人类可读摘要，不参与版本正确性判断。

必须满足以下约束：

```text
unique(seriesId, versionNumber)
unique(runId, toolCallId)  // 继续沿用现有工具重放幂等
currentArtifactId 必须属于同一个 series
currentArtifactId 只能指向 ready Artifact
每个 Artifact 继续一对一关联自己的 File
```

`ArtifactSeries` 是有意保持轻量的聚合根。只使用 `parentArtifactId` 虽然可以勉强表达版本链，但会把当前版本查询、并发更新、系列级名称和生命周期隐含在排序规则中；为这些稳定需求引入一个小型 Series 实体，收益高于额外模型成本，不视为过度设计。

### 7.4 创建和迭代流程

首次生成：

```text
新 Run 调用 create_file
-> 创建 File 并完成格式渲染、存储和 normalized content
-> 创建 ArtifactSeries
-> 创建 Artifact(versionNumber = 1, operation = create)
-> Artifact ready
-> 事务性设置 currentArtifactId = v1
```

基于已有版本修改：

```text
用户选择或明确引用 baseArtifactId
-> 创建新 Run
-> 通过现有文件读取能力取得该版本的 normalized content
-> 模型调用现有 create_file 生成完整新文件
-> 创建下一 versionNumber 的 File 和 Artifact
-> 成功后事务性推进 currentArtifactId
```

修改请求必须解析为明确的 `seriesId`、`baseArtifactId` 和 `expectedCurrentArtifactId`。模型可以基于任意历史版本生成内容，但新版本始终追加到该系列的当前线性时间线，不创建隐式分支。

不允许模型直接传入 `seriesId`、版本号、父节点或内部存储信息。Runtime/服务端根据用户选中的版本上下文、当前系列状态和工具调用事实建立关系，避免模型伪造版本拓扑。

### 7.5 恢复语义

恢复必须生成新版本。假设已有：

```text
v1 -> v2 -> v3 (current)
```

用户恢复 v1 后形成：

```text
v1 -> v2 -> v3 -> v4 (current)
                  operation = restore
                  parentArtifactId = v3
                  sourceArtifactId = v1
```

v2、v3 仍然可以预览和下载，聊天、Run 和工具事件也全部保留。恢复前需要用户确认；恢复成功应在会话时间线中留下可理解的事件，并能关联到来源版本和产生新版本的 Run。

恢复复用已持久化的原始文件内容，不重新要求模型复述或转换内容。恢复产生新的 File 和 Artifact，以保证新版本拥有独立、稳定的文件身份和下载语义。

### 7.6 并发、失败与幂等

推进当前版本必须在事务中执行，并使用最小乐观并发保护：

```text
UPDATE ArtifactSeries
SET currentArtifactId = newArtifactId
WHERE id = seriesId
  AND currentArtifactId = expectedCurrentArtifactId
```

条件不匹配表示生成期间已有其他版本成为 current。系统返回明确、可重试的版本冲突，不静默覆盖，也不在 C2-D 中尝试自动合并。冲突生成的未发布文件和记录按现有失败清理边界处理，不成为正式版本。

可靠性边界：

- 版本号分配、Artifact 创建和 current 推进需要通过数据库约束与事务避免重复或跳号造成错误指向。
- 同一 `runId + toolCallId` 重放返回同一结果，不重复创建版本。
- File 写入或渲染失败时不创建 ready Artifact，不推进 current，并清理孤儿存储对象。
- Artifact 已创建但 current 推进失败时，不得把它投影为当前成功版本；服务端应返回冲突并执行一致的失败清理或失败状态记录。
- 重试创建新的 Run；除工具调用幂等重放外，不复用失败 Run 冒充新的版本操作。

### 7.7 展示与交互范围

C2-D 首版提供：

- Artifact 卡片显示 `vN` 和当前版本标识；
- Workbench 展示同一 Series 的版本列表、时间、操作类型、变更摘要和来源 Run；
- 任一历史版本均可按其格式预览和下载；
- 支持“基于此版本修改”和“恢复此版本”；
- 恢复前明确确认，完成后显示新的恢复版本；
- 刷新、重连和重新进入 Session 后恢复 Series、当前版本、完整版本列表及其 Run/消息关系；
- Markdown 和 normalized text 可以使用已有文本能力展示基础差异，但 diff 不是首版完成条件。

首版不要求 PDF、DOCX、XLSX 的二进制或视觉 diff。版本列表展示的是不可变的已完成 Artifact，不展示未完成文件为可用版本。

### 7.8 明确不做

C2-D 首版不包括：

- 分支、合并、Draft 或 Git 式 DAG；
- 多人实时协作和在线富文本编辑；
- 任意局部 patch、覆盖写入或段落级编辑协议；
- 跨格式无损版本转换；
- 数据库或外部系统状态回滚；
- PDF、DOCX、XLSX 的二进制或视觉 diff；
- 复杂版本命名、书签、发布通道和版本删除恢复；

这些能力只有在真实使用数据证明必要时才另行设计，不提前污染当前 Artifact 和工具协议。

### 7.9 实施顺序

按以下顺序实施，不并行扩张协议：

1. 增加 `ArtifactSeries` 及 Artifact 版本字段、约束和迁移；
2. 扩展服务层，使现有 `create_file` 成功路径能够创建 v1 或追加新版本；
3. 实现 current 的事务推进、工具重放幂等、失败清理和乐观并发冲突；
4. 实现恢复服务，以旧版本内容创建新的 File 和 Artifact；
5. 扩展 canonical projection 和会话恢复数据，返回 Series、current 和版本列表；
6. 实现版本标识、版本列表、预览、下载、恢复确认和基于版本修改入口；
7. 补齐单元测试、集成测试、类型检查、构建和真实端到端测试。

如果实施发现必须引入新模型工具、分支合并、通用文档 AST、局部 patch 协议或在线编辑器才能完成，应停止实施并回到方案评审，不得自行扩大 C2-D。

### 7.10 完成标准

C2-D 只有在以下行为全部通过自动化测试和真实端到端验证后才视为完成：

1. 首次生成产物形成 v1，并正确成为 current；
2. 基于 v1 修改形成 v2，v1 和 v2 均可预览、下载；
3. 恢复 v1 形成新的 v3，v2 不被覆盖或删除；
4. 恢复后继续修改可以形成 v4，版本号和线性父子关系正确；
5. 失败、取消、超时不会改变 current，也不会展示伪成功版本；
6. 相同 `runId + toolCallId` 重放保持幂等，不重复创建版本；
7. 并发修改不会静默覆盖，冲突具有明确且可重试的错误语义；
8. 刷新、重连和重新进入 Session 后，Series、current、版本链及关联 Run/消息完整恢复；
9. 删除或清理行为不会留下可访问的孤儿版本或破坏其他历史版本；
10. Markdown、HTML、PDF、DOCX、XLSX 均遵循相同版本语义，历史版本实际可打开和下载。

### 7.11 方案依据

- [v0 Versions](https://v0.app/docs/versions)：消息驱动生成新版本；恢复旧版本会创建新的最新版本并保持线性历史。
- [Cursor Agent Checkpoints](https://cursor.com/cn/docs/agent/overview)：恢复文件状态但保留聊天事实，检查点与 Git 职责分离。
- [Lovable Version History](https://docs.lovable.dev/features/projects/history.md)：自动版本、只读预览、diff、聊天定位和非破坏性恢复。
- [Lovable Drafts](https://docs.lovable.dev/features/drafts.md)：分支式 Draft 有价值，但属于线性版本之后的独立能力。
- [Bolt Version History](https://support.bolt.new/building/using-bolt/rollback-backup.md)：自动历史、时间线预览、确认恢复和聊天记录。
- [GitHub Copilot Cloud Agent](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent)：任务、修改、审阅和持久化事实分层，所有变更可追踪。
- [Replit Agent](https://docs.replit.com/features/agent/overview)：Checkpoint、File History 和灾难恢复作为 Agent 迭代安全网。

## 8. C2 推荐开发顺序

```text
C2-A FileCreateTool + Artifact 完整闭环   （已完成）
-> C2-B 正式报告生成                      （已完成）
-> C2-C 多格式输出                        （已完成）
-> C2-D 版本与迭代                        （已完成）
```

C2-A 实施前需要进一步冻结的内容仅包括工具输入输出、Artifact 最小元数据、首版格式和 API/Workbench 投影；不重新讨论是否采用工具驱动、是否暴露路径或是否拆成多个交付阶段。

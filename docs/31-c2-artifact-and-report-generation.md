# C2 Artifact & Report Generation / 产物与报告生成方案

> 文档状态：C2 评审与实施规划稿。
>
> 最后更新：2026-09-14。
>
> 本文记录 C2 产物与报告生成能力的阶段方向、已落地的 C2-A 边界，以及已经冻结的 C2-B 完整实施方案。它不替代总路线图、实际完成状态和其他能力专题文档。

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

| 阶段 | 状态 | 说明 |
| --- | --- | --- |
| C2-A | 已实现 | 通用生成文件、Artifact、预览、下载、删除和恢复闭环已落地 |
| C2-B | 方案已冻结，待一次性实施 | 本文记录完整产品、协议、数据和验收边界 |
| C2-C-C2-D | 待细化 | 只记录目标和阶段边界 |

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
- DOCX、PDF、XLSX、PPTX 等格式渲染。
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

> 状态：完整方案已冻结，下一阶段一次性实现，不再拆成基础设施、后端和 UI 子阶段。

### 5.1 阶段目标

C2-B 在 C2-A 的通用 Artifact 能力上增加“正式报告”这一明确的交付语义。完成后，用户提出调研、分析、总结或方案类任务时，模型可以把较长且可独立消费的最终成果交付为报告；报告具有稳定身份、清晰结构、材料关联和独立阅读界面，并能随 Session 恢复。

```text
模型完成调查或材料分析
-> 调用 create_report
-> 服务端校验报告和材料引用
-> 生成 canonical Markdown File
-> 建立 Artifact + Report 关系
-> Conversation 展示简短交付卡片
-> Report Workbench 展示完整报告
-> 用户预览、下载或在后续 Run 中继续处理
```

C2-B 一次性交付完整闭环，不把“先存数据、以后再做 UI”视为阶段完成。

### 5.2 市场产品启示

成熟 Agent 的实现细节并不完全公开，但公开产品行为已经呈现出几个稳定模式：

- ChatGPT Deep Research 把多来源调查汇总为结构化、带来源的独立报告，允许用户在执行期间调整计划和来源，并支持将包含表格、图片、链接引用和来源的报告导出为 PDF。
- Gemini Deep Research 先生成可编辑的调查计划，调查完成后在独立 Canvas 中打开报告；报告按关键发现组织，链接原始来源，并支持复制、分享和导出 Google Docs。
- Claude Research 强调迭代搜索和易于检查的引用；Claude Artifacts 则把重要、独立、值得后续复用的长内容放到 Conversation 之外的专用窗口，并提供下载和后续修改入口。
- Perplexity Research 将搜索、阅读、推理和报告写作区分为连续阶段，最终报告可以导出为 PDF/文档或转成可分享页面。

这些产品值得借鉴的不是某个专有状态机，而是以下交付原则：

1. **报告是独立交付物，不是超长聊天消息。** Conversation 负责说明结果和限制，专用工作区负责阅读完整内容。
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
  fileName: string;             // 仅 .md，不包含路径
  content: string;              // 完整 canonical Markdown
  quality: 'standard' | 'limited';
  limitationNote?: string;      // limited 时必填
  sourceIds?: string[];         // 本次 Run 中成功读取的网页来源
  fileIds?: string[];           // 当前 Session 中实际使用的材料文件
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

其中 `ReportRef` 只包含展示与恢复所需的稳定字段：`reportId`、`artifactId`、`runId`、`title`、`summary`、`quality`、可选 `limitationNote`、`sourceIds`、`fileIds`、`status`、`createdAt` 和 `updatedAt`。工具结果、SSE、日志和 Message metadata 均不重复携带完整 `content`；完整正文继续由 File/COS 和预览接口负责。

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
- 根据已验证的 `sourceIds/fileIds` 生成统一的“参考来源/材料”尾部，避免模型伪造内部引用身份；
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
  runId            unique
  title
  summary
  quality          standard | limited
  limitationNote?
  sourceIds        JSON string[]
  fileIds          JSON string[]
  status           ready | deleted
  createdAt
  updatedAt
```

`Artifact` 和 `File` 继续拥有存储及删除生命周期，Report 不重复保存正文、object key、MIME 或预览数据。一个 Run 最多创建一个主 Report，但仍可创建多个普通 Artifact。这个约束让 Conversation 和 Workbench 有唯一的主报告入口，也避免提前引入报告组、主附件或版本树。

### 5.7 来源与材料关联

C2-B 支持最小、诚实的可追溯性：

- `sourceIds` 只能指向本次 Run 已成功 Fetch、且具有可用 Passage 的 canonical source；搜索 Clue 不能作为报告来源。
- `fileIds` 只能指向当前 Session 中状态为 `ready` 的文件，包括用户上传文件和先前生成文件。
- 服务端去重并按模型提交顺序保留；未知、越权、已删除或不可用引用使本次工具调用失败，不静默丢弃。
- 没有网页来源是合法情况，例如报告完全基于用户文件或模型已有知识；UI 不显示空“来源”区域。
- `standard` 不表示引用已经由 Citation Validator 验证，只表示模型认为任务材料足以正常交付。
- 当关键材料缺失、结论只能部分确认或用户要求的范围未完全覆盖时，模型必须选择 `limited` 并给出简短 `limitationNote`。

Report Workbench 的来源区复用现有 Source 卡片和文件元数据。C2-B 不引入 Evidence、Claim、`[Sx]`、锚点级 cited-by 或 Citation Validator；这些属于 K6。现有 Workbench 文档中依赖 Evidence/Citation Validator 的 `reviewing/revising/validating`、`[Sx]` 和逐句引用联动是后续目标，不作为 C2-B 已实现能力展示。

### 5.8 生命周期、幂等与失败边界

C2-B 不新增独立报告生成状态机。用户可见状态保持为：

```text
generating -> ready-standard | ready-limited
           -> failed
```

`generating` 由正在运行的 `create_report` Tool Activity 表达，不持久化一个长期 draft Report。只有 Markdown File、Artifact 和 Report 关系全部成功后才投影 `ready`；此前不会展示可下载的正式报告。

可靠性规则：

- 同一 `runId + toolCallId` 重放返回同一结果，不重复创建 File、Artifact 或 Report。
- 同一 Run 已有 ready Report 时，另一 `toolCallId` 再次创建报告返回确定性冲突；修改报告通过后续 Run 创建新报告，版本关系留给 C2-D。
- 校验失败时不写 COS；File 写入成功但 Artifact/Report 事务失败时，沿用 C2-A 孤儿对象清理机制。
- 工具失败、取消或超时不产生正式报告卡片；Runtime 可让模型修正参数后重试，但仍受“一 Run 一个成功报告”约束。
- 删除报告沿用 Artifact 删除入口，同时把 Report 标记为 `deleted`；Conversation 历史不展示失效下载入口，重新读取稳定返回已删除语义。
- Session 删除继续级联删除 File、Artifact 和 Report，并执行现有 COS 清理补偿。
- Run 最终回答失败但 Report 已经原子创建成功时，报告仍作为已交付事实保留；Conversation 显示报告卡片和 Run 失败状态，不能把已存在的文件回滚成不存在。

### 5.9 容量与安全边界

沿用 C2-A 的文件名、路径隔离、归属校验和 Markdown 安全渲染，并增加少量报告级限制：

- `title` 最多 200 个 Unicode 字符；`summary` 最多 1,000 个字符；
- `content` 首版最多 40,000 个 Unicode 字符，与 `create_file` 保持一致；
- `sourceIds` 和 `fileIds` 各最多 50 个，单个数组内不得重复；
- `fileName` 必须是普通 `.md` 文件名，不能包含路径；
- `standard` 不允许提供互相矛盾的 limitation 状态；`limited` 必须提供非空限制说明；
- 超限或非法输入明确失败，不静默截断、移除引用或降级质量；
- 不允许原始 HTML、可执行脚本、远程 iframe、内联 data URL 或模型指定 COS/object key。

首版允许安全 Markdown 表格和代码块；不支持内嵌上传图片、远程图片代理、图表、脚注级引用语法和附件打包。它们不阻塞一份高质量文本报告的交付。

### 5.10 Conversation 与 Report Workbench

Conversation 在报告成功后展示：

- 报告标题和一段简短摘要；
- `标准报告` 或克制的 `内容受限` 标识；
- 打开 Report Workbench 的主操作；
- 下载 Markdown 的次要操作可继续放在 Workbench，避免卡片堆叠操作。

完整 Markdown 不重复插入最终聊天文本。模型最终回答只需说明已完成、概括关键结论并提醒重要限制。

Report Workbench 生产链路一次性完成：

- 从后端 canonical Report projection 恢复，不再依赖 development fixture；
- 展示标题、摘要、质量、更新时间、完整安全 Markdown；
- 展示实际关联的网页来源和材料文件；
- 提供 Markdown 下载与删除入口；
- 支持从 Conversation 报告卡片精确打开；
- 刷新、切换 Session 和 SSE 重连后保持相同内容和状态；
- 删除后移除正式内容与操作，并显示稳定的已删除状态或回到无报告视图。

当前 `Artifact` Tab 继续服务普通生成文件；正式报告进入 `Report` Tab，不在两个 Tab 中重复作为两份交付物展示。底层仍然是同一个 Artifact/File。

### 5.11 明确不属于 C2-B

- PDF、DOCX、HTML 等多格式渲染和格式模板，属于 C2-C；
- 在线编辑、局部修改、版本选择、覆盖与回滚，属于 C2-D；
- Evidence/Claim 模型、逐主张引用、`[Sx]`、Citation Validator 和自动事实复核，属于 K6；
- 自动生成图表、执行数据分析代码和复杂表格处理，依赖 C3；
- 公开分享链接、多人协作、评论、发布和全局报告管理器；
- 报告模板市场、品牌主题、目录 AST、脚注引擎和后台通知；
- 强制的 research plan 审批或专用 Deep Research Runtime。

### 5.12 一次性实施范围与完成标准

C2-B 只有在以下内容一起完成时才算完成：

1. `create_report` 工具、输入输出协议、参数摘要和模型工具说明落地。
2. Report migration、持久化关系、单 Run 唯一约束、归属校验和级联/删除语义落地。
3. Markdown File、Artifact、Report 原子交付以及 `runId + toolCallId` 重放幂等通过测试。
4. 网页 `sourceIds` 与材料 `fileIds` 校验、去重、顺序和越权/失效边界通过测试。
5. Snapshot/SSE/Session 恢复包含轻量 ReportRef，不携带完整正文。
6. Conversation 展示正式报告卡片，Report Workbench 使用真实生产数据展示全文、材料、来源、下载和删除。
7. 标准、受限、失败、取消、重复调用、最终回答失败后报告保留、刷新恢复和 Session 删除均有自动化回归。
8. 桌面和移动布局、键盘操作、危险 Markdown、超长内容和安全外链完成验证。
9. README、implementation-status、protocol 和 Workbench 文档同步到真实能力，不再把 fixture 当成已实现状态。

### 5.13 调研来源

- [OpenAI：Deep research in ChatGPT](https://chatgpt.com/features/deep-research/)
- [OpenAI：ChatGPT Release Notes（Deep Research PDF export）](https://help.openai.com/en/articles/6825453-chatgpt-release-notes)
- [Google：Use Deep Research in Gemini Apps](https://support.google.com/gemini/answer/15719111?hl=en&co=GENIE.Platform%3DDesktop)
- [Google：Try Deep Research in Gemini](https://blog.google/products-and-platforms/products/gemini/google-gemini-deep-research/)
- [Anthropic：Use research on Claude](https://support.claude.com/en/articles/11088861-use-research-on-claude)
- [Anthropic：What are artifacts and how do I use them?](https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them)
- [Perplexity：What is Research mode?](https://www.perplexity.ai/help-center/en/articles/10738684-what-is-research-mode)

## 6. C2-C 多格式输出

> 状态：待细化。

核心方向：

- 将同一内容产物渲染为 Markdown、HTML、PDF、DOCX 等格式。
- 内容生成与格式渲染分离，模型不直接生成底层 Office/PDF 文件结构。
- 格式渲染失败不破坏已有可用 Artifact。
- XLSX、PPTX 和复杂图表是否属于本阶段，需要结合代码执行能力再确定。

## 7. C2-D 产物版本与迭代

> 状态：待细化。

核心方向：

- 用户可以基于已有 Artifact 提出修改要求并生成新版本。
- 旧版本不被静默覆盖。
- 支持版本关系、恢复和失败重试。
- 首选“新 Run 生成新版本”，不预设在线编辑器或复杂文档协作。

## 8. C2 推荐开发顺序

```text
C2-A FileCreateTool + Artifact 完整闭环
-> C2-B 正式报告生成
-> C2-C 多格式输出
-> C2-D 版本与迭代
```

C2-A 实施前需要进一步冻结的内容仅包括工具输入输出、Artifact 最小元数据、首版格式和 API/Workbench 投影；不重新讨论是否采用工具驱动、是否暴露路径或是否拆成多个交付阶段。

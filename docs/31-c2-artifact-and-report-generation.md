# C2 Artifact & Report Generation / 产物与报告生成方案

> 文档状态：C2 评审与实施规划稿。
>
> 最后更新：2026-09-09。
>
> 本文只记录 C2 产物与报告生成能力的阶段方向，以及当前已经明确的 C2-A 方案。它不替代总路线图、实际完成状态和其他能力专题文档。

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
| C2-A | 当前已形成方向方案 | 本文记录当前确定的完整阶段范围，具体协议待实施前冻结 |
| C2-B-C2-D | 待细化 | 只记录目标和阶段边界 |

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

> 状态：待细化。

C2-B 在 C2-A 的通用 Artifact 能力之上，定义“报告”这种具体内容形态和正式交付语义。

当前确定的核心方向：

- 报告具有明确标题、摘要、章节、结论、限制和来源等内容结构。
- 报告作为一种 Artifact 保存、预览和下载，不另建重复的文件生命周期。
- Conversation 展示报告交付摘要，完整报告进入 Report Workbench。
- 报告与任务材料、网页来源和后续 Citation 能力建立关联。
- 报告质量、证据覆盖和正式校验的边界需要后续细化。

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

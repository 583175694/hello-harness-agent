# C1 文件读取工具演进（read_file / search_file / spill）

> 决策状态：**P0 + CE P0.5 已实现**（2026-09-30）。**读稿产品口径**（`search_file` 维持、`lines` vs `section`、P1-a/b 不做）见 **§14**；compile 分轨 / search `sectionId` 仍为可选 P1。本文是 `search_file` 与 `read_file`（取代 `read_file_lines`）、任务分轨、Section 索引及 spill 边界的权威说明；与 C1 基线关系见 [30-c1-file-multimodal-foundation.md](./30-c1-file-multimodal-foundation.md)。  
> **不在本文**：Run 工具轮次/次数预算、RAG/向量检索、沙箱读文件、DSML、`search_file` 与 `read_file` 合并。

## 1. 背景与目标

### 1.1 问题

- 用户上传「一篇文章」时期望 **整篇理解**，现有 `read_file_lines` 引导模型 **按行分页扫全文**，大文件时 tool 调用多、与文章语义不匹配。
- 仅有 **行** 粒度，缺少 **文件级 outline** 与 **段落/章节** 级读取。
- `search_file` 与行读取的职责在模型侧易混淆。
- spill/指针机制已用于超大 Tool Result，需与用户附件、`read_file` 路径的语义 **严格区分**。

### 1.2 目标

| 目标 | 说明 |
|------|------|
| 任务分轨 | 小文件在预算内 **一次给够**；大文件 **outline + 按需块读**，不默认从第 1 行扫到尾 |
| 单一 `read_file` | `scope = file \| section \| lines` |
| 保留 `search_file` | **定位**（在哪有 X），不替代 read |
| 复用 spill | 不新建存储；明确 **谁 spill、谁不 spill** |

### 1.3 非目标

- 向量索引、Embedding、OpenAI `file_search` 式 RAG  
- Sandbox 内 `cat`/脚本读文件  
- 将 `search_file` 与 `read_file` 合并为一个工具  
- Run 调查/交付轮次预算（独立立项）

---

## 2. 工具边界（不合并）

```text
user message / file_ref  →  fileId 已确定
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
   search_file          read_file(scope=file)   read_file(section|lines)
   「在哪有 X」          「结构 / 小文全文」     「把某块读出来」
   稀疏、多命中          outline 或 bounded 全文   稠密、单范围
```

| | search_file | read_file |
|---|-------------|-----------|
| 问法 | 在哪 / 有没有 X | 这块内容是什么 |
| 输入 | `fileId` + `query` | `fileId` + `scope` + 范围参数 |
| 输出 | 命中：行/页 + **短 snippet**（条数、长度 cap） | **正文块** + 定位 + `incomplete` |
| 不负责 | 读整段、读全文 | 在全文件里搜所有关键词 |

**fileId 来源**：user message 的 `file_ref`、Agent 生成 File、外置 `tool_result` File。`search_file` **不负责**「选哪个附件」。

**推荐协作顺序**

- 文章/报告：`read(scope=file)` →（可选）`search_file` → `read(section|lines)`  
- 代码/日志：`search_file` → `read(lines)`；避免从第 1 行机械扫全文  

**定位 vs 通读**（见 §14.2）：点查、spill 回读、Markdown **大标题** 少段结构 → 优先 search / **section**；**无标题 docx 全文审阅** → 允许 **`lines` 分块**（每块 ≤ `fileReadLinesMax`、覆盖 `1..lineCount`），**不**把「0 次 section」视为失败。仍禁止 **无规划地从第 1 行单行号扫到末尾**（应分块且块间尽量不遗漏）。

---

## 3. `read_file`（取代 `read_file_lines`）

### 3.1 命名迁移

- 对外工具名：**`read_file`**。  
- **`read_file_lines` 废弃**；实现期可选保留 Registry 别名映射到同一实现（保留时长待实现前决定）。  
- 同步更新：`AGENT_TOOL_NAMES`、Tool definition、Workbench 文案、`CHAT_SYSTEM_PROMPT`、协议 schema、单测。

### 3.2 请求（逻辑 schema）

```text
fileId: string                    // 必填；当前 session、ready、可读
scope: "file" | "section" | "lines"

// scope = section
sectionId: string                 // 解析阶段生成，稳定

// scope = lines
startLine: number                 // 1-based inclusive
endLine: number                   // 1-based inclusive
```

校验：`endLine >= startLine`；单次行数 ≤ `fileReadLinesMax`（设计目标 **150～200**，现网 50 偏小，具体值实现前 tokenizer 压测写入 `AGENT_PROTOCOL_LIMITS`）。

### 3.3 响应公共字段

```text
fileId, fileName, mediaType, scope
incomplete: boolean
// lines：行号、可选 PDF page；section：sectionId、startLine/endLine
```

### 3.4 scope = `file`（文件维 · 任务分轨入口）

按 normalized 正文规模分档。阈值 **T_small** 实现前用 DeepSeek V3 tokenizer 与 Context Engineering `toolResultMaxTokens` 压测确定。

| 档位 | 条件 | 返回 |
|------|------|------|
| **small** | ≤ T_small | **完整 normalized 正文**（一次读满，仍受协议字符上限） |
| **medium/large** | > T_small | **outline**：`lineCount`/`pageCount`、`sections[]` 摘要（id、title、level、行/页范围）；可选 **head-tail 预览**；**不**返回全文 |

不在此 scope 做关键词搜索（交给 `search_file`）。

### 3.5 scope = `section`（段落维）

- 输入：`sectionId`（见 §5）。  
- 输出：该 section **完整正文**（受单次结果字符 + CE token 上限）。  
- `incomplete: true` 时：提示用 **同 section 的 lines 子范围** 续读。v1.1 可选 character offset 模式（minified JSON 等）。

### 3.6 scope = `lines`（行维）

- 用途：日志/代码/表格、section 过大后续读、search 命中后精读。  
- 行为：与现 `read_file_lines` 一致——**完整行、不截半行**；超字符预算则返回预算内完整行 + `incomplete`。  
- PDF：保留页码标记恢复逻辑（现 `FilesService.readFileLines` 行为）。

### 3.7 结果上限与 Context Engineering

| 层级 | 方向 |
|------|------|
| 协议 | 上调 `fileReadResultMaxCharacters`，与典型单条 tool token 预算可共存 |
| CE | 对 **file 类 tool** 使用 **不低于** 普通 `toolResultMaxTokens` 的计量（如 1.5～2×），避免工具层放大仍 `FILE_CONTEXT_TOO_LARGE` |
| 原则 | 用户附件与 `read_file`/`search_file` 结果 **禁止静默 spill**（见 §7） |

---

## 4. `search_file`（保持独立）

### 4.1 行为

- 保持：普通关键词、非正则；`maxResults`、`fileSearchContextLines` 等现有 cap 不变。  
- 仍 **不**返回大块正文。

### 4.2 增强（P1，可选）

- 命中行若落在某 section 内，命中项增加 **`sectionId`**，便于 `read_file(scope=section)`。  
- Tool / System 文案：**仅定位；读完用 read_file**。

---

## 5. 解析层：Section 索引

在 **FileProcessingService** 生成 **normalized 正文** 时同步写入 **section 索引**（版本与 parser 绑定；存 COS 或 DB JSON 字段，与 normalized 同生命周期）。

**最小结构**

```text
sections: [
  {
    sectionId: string,
    title?: string,
    level?: number,
    startLine: number,
    endLine: number,
    pageStart?: number,
    pageEnd?: number
  }
]
```

**切分优先级（v1）**

1. Markdown：`#` 标题层级  
2. 纯文本：连续空行段落（降级）  
3. PDF：现有 `[[page:n]]` + 页内块（能拆则拆）  
4. DOCX/XLSX：沿用现有 normalized；能抽标题则入 index  

`read(scope=file)` 的 outline **读取该索引**，不在请求时现算全文结构。

---

## 6. 任务分轨（Context compile）

与 `read(scope=file)` **可叠加**；small 档二选一（实现前拍板）：

| 档位 | compileRound 行为 |
|------|-------------------|
| **small** | 可选：user 侧 **bounded inline** 正文，减少首轮 tool；或仅 `file_ref` + 模型调 `read(scope=file)` |
| **medium/large** | **仅 `file_ref` + 元数据**；不 inline 全文 |

**不变量**（与 C1 一致）：用户附件 **不得静默丢弃**；超预算 → 明确错误或仅 outline。

可选：在 `file_ref` 编译投影中增加 `sizeTier: small | medium | large`（只读提示）。

---

## 7. Spill / 指针

### 7.1 现有机制（保留）

- 超大 **非 file-tool** Tool Result（如 Web/Fetch）→ Session 内 `FileOrigin.tool_result` → 上下文 head-tail + fileId 说明 → `search_file` / `read_file` 回读。  
- 历史 Tool Unit → `[Tool Result stored: ...]`；Runtime `applyCollapsedToolPointers`。  
- 详见 [03-context-engineering.md](./03-context-engineering.md)。

### 7.2 本演进规则

| 场景 | 是否 spill |
|------|-------------|
| 用户上传 File 正文 | **否**；身份始终为用户 `fileId`；大文用 outline + section/lines |
| **`read_file` / `search_file` 同轮超大**（`trimToolResults`） | **否**；`FILE_CONTEXT_RESULT_TOO_LARGE`，要求缩小 scope |
| **Fetch 等 同轮超大** | **是**（head-tail + `tool_result`） |
| **历史 compile 折叠**（`collapseOldToolResults`） | **非 file-tool** → `[Tool Result stored]`；**file-tool** → **不 stored**，inline 保留（[03](./03-context-engineering.md) §13） |

### 7.3 与 read 的配合

- spill 产生的 File **可以**被 `search_file` / `read_file` 读取。  
- section 索引挂在 **用户/生成主 File**；`tool_result` 文件 v1 可视为 **无 section 或单 section**，以 lines/search 为主。

### 7.4 可选改进（P2）

- spill 说明句式统一：`fileId`、`fileName`、`lineCount`、推荐 `read(scope=file|lines)`。  
- 不在用户 File 上重复 spill 同一份正文。

---

## 8. System / Tool 文案要点

- 大文件先 `read(scope=file)`；通读时用 **规划好的 section 或 lines 分块**，禁止无规划的单次超长 lines 或从第 1 行逐屏扫到尾。  
- **search** = 定位（**独立工具维持**，非 docx 通读必需）；**read** = 取内容。  
- 同一 assistant 响应可 **多个 read**（不同 section/行范围）。  
- search 命中后优先 **read(section)**；Markdown 大段标题优先 **section**；docx 段落级 section 密、全文任务见 §14.2。

---

## 9. 实施阶段

| 阶段 | 交付 |
|------|------|
| **P0** | Section 索引；`read_file` 三 scope；下线 `read_file_lines`；协议限额 + CE **同轮** file-tool 不 spill |
| **P0** | `search_file` 文案；错误码与单测（file-on-demand、CE file 不 spill） |
| **P0.5** | CE **历史折叠**不对 file-tool 做 `storeToolResult`；`RECENT_TOOL_UNITS_TO_KEEP` 3（[03](./03-context-engineering.md) §13）— **已完成** |
| **P1** | compile 任务分轨；search 命中可选 `sectionId`（§14：其余读稿项暂不实施） |
| **P1.1** | 超长单行 character offset（可选） |

**依赖**：不要求 Run 工具预算改造。

---

## 10. 验收标准

1. **small 文件**：总结类问题，0～1 次 read 或 inline 即可，无机械单行号扫全文。  
2. **large 文件**：先 **outline**；**Markdown 大标题** 优先 **section**；**无标题 docx 全文审阅** 允许 **lines 分块读满**（见 §14.2、335d 冒烟）。  
3. **search → read**（可选链）：点查 / spill 场景评测「定位 + 精读」；**不要求** 每次附件任务都调用 `search_file`。  
4. **FILE_CONTEXT_TOO_LARGE** 率相对基线不升；调大窗口后 CE 单测通过。  
5. **spill**：用户上传不会自动变 `tool_result`；Fetch spill 仍可 search/read 回读。  
6. **CE P0.5 后**：长 run 多轮 `read_file` 不应因 **历史 stored 指针** 被迫反复读 `tool_call_*.json`；超预算仍走明确错误而非 file-tool 静默外置。  
7. **冒烟（2026-09-30）**：Session `335d9f96-e8c6-4de9-a242-f99e7a64c769` docx 审阅（9× `read_file`、lines 分块 ~10–236 行、0× section、0× `search_file`）与 CE P0.5 意图一致；产品口径见 §14。

---

## 14. 产品决策与 backlog（2026-09-30）

CE P0.5 解决 **历史折叠抹掉 file-tool 正文**。下列为读稿与协议 **是否继续投入** 的结论，避免过度设计。

### 14.1 维持现状（不改代码）

| 项 | 决策 | 理由（摘要） |
|----|------|----------------|
| **`search_file` 独立工具** | **保留、不合并、不降级** | 点查 / spill 回读 / 稿内定位仍有协议价值；docx **全文审阅** 可 0 次调用（335d），**非任务失败条件**。 |
| **P1-a outline `sections[]` 封顶** | **暂不实施** | 335d 未触顶；属极端大 outline **保险**；有线上 `FILE_CONTEXT` / outline 过大再开。 |
| **P1-b `readingGuide` 字段** | **暂不实施** | 与「docx 通读可用 lines」易冲突；软提示边际低；若将来做应写 **lines 分块** 而非强推 section。 |
| **强制模型多用 `scope=section`** | **不实施** | docx 无 `#` 时 section≈**段落**（可 100+ 段），通读用 section **比少量 lines 块更费轮次**；335d lines 6 块读满为 **合理路径**。 |
| **CE retainTokens / DSH pruner** | **Defer** | P0.5 已够；除非 budget 再次成为主因。 |

### 14.2 `lines` vs `section`（验收口径）

| 文件形态 | Section 索引粒度 | 全文理解 / 审阅 | 点查 / 矛盾核查 |
|----------|------------------|-----------------|-----------------|
| **Markdown 等（`#` 标题）** | 少而大（章/节） | 优先 **`read(section)`** 逐节 | optional `search_file` → section/lines |
| **docx 等（无标题，空行段落）** | 多而碎（≈段） | **`read(scope=file)` + `lines` 分块** 覆盖 `1..lineCount` 为 **合格** | 可用 `search_file` 或 lines，不强制 section |
| **代码 / 日志** | — | **`lines`** | `search_file` → `lines` |

**不视为回归**：docx 审阅 run 中 **0 次 `search_file`、0 次 `section`**，只要分块 lines **覆盖任务所需行范围** 且 CE 未将 file-tool 收成 stored（§7、§10.6）。

### 14.3 仍可选的后续（有需求再做）

| 项 | 说明 |
|----|------|
| **P1-c** | spill 指针：JSON `tool_result` 建议 `read(scope=lines)` 而非 `scope=file`（文案级，低成本） |
| **P1 compile 分轨** | medium/large 仅 `file_ref`（原 P1） |
| **P2** | `search_file` 命中带 `sectionId` |
| **P2+** | docx **粗粒度 section**（Heading/合并短段）— 仅当产品 insist「按章读 docx」 |

---

## 11. 待决项（P0 默认选择，2026-09-29）

1. **T_small**：`AGENT_PROTOCOL_LIMITS.fileReadSmallMaxCodePoints = 4_000`（Unicode code points）；medium/large 以 4× 为 large 档 heuristic。  
2. **small compile**：P0 保持 **仅 `file_ref` + 模型调 `read(scope=file)`**；bounded inline 留 P1。  
3. **`sectionId`**：`s-{startLine}-{ordinal}`（解析顺序 ordinal，与 `contentHash`/parser 绑定）。  
4. **限额**：`fileReadLinesMax = 150`，`fileReadResultMaxCharacters = 24_000`。  
5. **`read_file_lines`**：不出现在模型 definitions；**Registry `resolveName` 别名**映射到 `read_file`（legacy 参数转 `scope=lines`）；SSE/快照保留历史 discriminant。

---

## 12. 与现网 C1 文档的关系

- [30-c1-file-multimodal-foundation.md](./30-c1-file-multimodal-foundation.md) 描述 **已实现的 C1-B.2**（`read_file_lines` + 50 行上限）。  
- **本文为实现目标**；落地后应回写 C1 文档与 `implementation-status.md`，并将本文决策状态改为「已实现」。

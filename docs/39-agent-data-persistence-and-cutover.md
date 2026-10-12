# Agent 运行数据分层与一次性清理方案

## 1. 目标与最终约束

本方案用于解决长会话加载慢、`Message.metadata` 膨胀以及 API 读取大对象导致的内存峰值。

最终系统必须满足：

- 生产运行时不包含历史格式 fallback；
- 会话详情接口不返回完整工具执行快照；
- 原始工具输出和大型文件不进入聊天消息 JSON；
- 历史数据完成一次性转换后，业务库不保留迁移临时表或迁移状态；
- 新旧数据最终使用同一套数据结构和读取路径；
- Prisma 的标准 schema migration 历史保留在 `_prisma_migrations`，不作为业务兼容逻辑。

## 2. 当前问题

当前 `Message.metadata` 同时承担了四种职责：

1. 聊天恢复数据；
2. Agent 运行状态；
3. Workbench UI 快照；
4. 工具结果和来源内容缓存。

典型字段包括：

```json
{
  "model": "...",
  "deliveryStatus": "completed",
  "runId": "...",
  "blocks": [],
  "context": {},
  "plan": {},
  "agent": {
    "toolCallCount": 3,
    "executions": [],
    "sources": [],
    "detailRef": "..."
  }
}
```

其中 `blocks`、`executions`、`sources` 可能包含网页片段、终端输出和工具结果，随着 Run 增长被反复写回。

生产环境目标会话已测得：

- 174 条消息；
- 全部 metadata 约 71 MB；
- 最近 101 条消息 metadata 约 56 MB；
- 最大单条 metadata 约 1.38 MB。

数据库查询本身很快，主要耗时来自 JSON 读取、序列化、网络传输和浏览器解析。

## 3. 最终数据分层

### 3.1 Message：轻量聊天记录

Message 只保存正文和最小恢复信息：

```json
{
  "deliveryStatus": "completed",
  "runId": "run-123",
  "agent": {
    "toolCallCount": 4,
    "detailRef": "run-123"
  }
}
```

保留：

- `deliveryStatus`
- `runId`
- `detailRef`
- `toolCallCount`
- `pendingInputId`
- 错误摘要
- 小型 `plan/context` 摘要（有明确大小上限时）

不再保存：

- 完整 `blocks`
- `agent.executions`
- `agent.sources`
- 网页全文和 passages
- 完整 stdout/stderr
- 大型上下文快照
- 重复的 Workbench UI 状态

最终聊天正文保存在 `Message.content`。

### 3.2 AgentRun：运行生命周期

`AgentRun` 保存：

- 状态；
- 模型和推理配置；
- 工具调用计数；
- 事件序号；
- 错误；
- 开始和结束时间；
- 运行级 observability。

`AgentRun.metadata` 只允许保存小型运行观测数据，不保存工具原文。

### 3.3 AgentRunDetail：Workbench 结构化详情

`AgentRunDetail` 是 Workbench 的唯一数据来源，保存结构化摘要：

```json
{
  "executions": [
    {
      "toolCallId": "call-1",
      "toolName": "web_fetch",
      "status": "completed",
      "inputSummary": "...",
      "outputPreview": "...",
      "outputRef": "runs/run-123/tools/call-1/output.json",
      "outputBytes": 845231
    }
  ],
  "sources": [],
  "plan": {},
  "contextSummary": {},
  "schemaVersion": 2
}
```

### 3.4 Object Storage：原始大对象

生产使用腾讯云 COS，数据库只保存对象引用。

建议对象路径：

```text
runs/{runId}/tools/{toolCallId}/input.json
runs/{runId}/tools/{toolCallId}/output.json
runs/{runId}/tools/{toolCallId}/stdout.txt
runs/{runId}/tools/{toolCallId}/stderr.txt
runs/{runId}/sources/{sourceId}/content.html
runs/{runId}/sources/{sourceId}/content.json
```

原始对象使用私有权限，读取时由 API 返回短期签名 URL。API 不中转大文件字节。

## 4. 工具输出写入规则

| 大小 | 数据库 | COS |
| --- | --- | --- |
| 小于 8 KB | 保存完整 preview | 可不上传 |
| 8 KB 至 256 KB | 保存前 2～8 KB preview 和引用 | 保存完整内容 |
| 大于 256 KB | 只保存 preview、引用、大小、类型、hash | 强制保存完整内容 |

规则适用于：

- web search/fetch；
- bash stdout/stderr；
- MCP 工具；
- 外部工具；
- 文件读取和解析结果；
- 其他可能返回大 JSON 的工具。

任何单条数据库 JSON 都必须设置字节上限。

## 5. API 读取路径

### 5.1 会话详情

`GET /api/agent/sessions/:sessionId` 只返回：

- 会话摘要；
- 分页后的消息正文；
- 轻量 metadata；
- 附件和 artifact 引用；
- active Run。

不返回完整 executions、sources 或原始工具输出。

### 5.2 Workbench 详情

`GET /api/agent/runs/:runId/detail` 返回结构化 Workbench 摘要。

### 5.3 原始结果

新增按权限校验的读取接口：

```text
GET /api/agent/runs/:runId/tools/:toolCallId/output-url
```

接口返回 COS 短期签名地址，不由 API 代理大文件。

## 6. 一次性历史数据处理

历史数据需要转换，但转换完成后不能保留历史兼容路径。

### 6.1 转换顺序

```text
1. pg_dump 和对象存储清单备份
2. 扫描旧 assistant Message.metadata
3. 回填 AgentRunDetail
4. 将旧的大型工具结果写入 COS
5. 校验 executions、sources 和内容 hash
6. 压缩 Message.metadata
7. 抽样验证历史会话和 Workbench
8. 切换到纯新读取逻辑
9. 删除旧 fallback
10. 删除一次性脚本和临时表
```

### 6.2 幂等与失败处理

迁移脚本在执行期间必须：

- 按 Run 分批；
- 使用 upsert；
- 支持重复执行；
- 每批完成后提交；
- 失败时保留外部日志；
- 不修改已成功完成的批次；
- 完成后输出原始字节、压缩后字节和失败数量。

迁移状态不进入长期业务表。需要追踪时使用临时表或外部日志，迁移完成后删除临时表。

### 6.3 不允许的最终状态

迁移完成后不得保留：

- `legacyMetadata` 字段；
- `migrationStatus` 业务字段；
- “新格式不存在则读旧格式”的 fallback；
- 根据旧 metadata 解析 executions/sources 的代码；
- 迁移临时表；
- 已完成迁移脚本作为运行时依赖。

## 7. 代码改造范围

需要改造：

- `RunRepository.flush`
- `RunRepository.terminal`
- `AssistantDeliveryRepository`
- 工具结果归档逻辑
- `SessionsService.detail`
- Run detail API
- COS 对象读取和权限校验

关键要求：

```text
flush/terminal
→ 更新 Message.content 和轻量状态
→ 更新 AgentRunDetail
→ 大结果写 COS
```

禁止继续把累计 `blocks/executions/sources` 全量写回 Message。

## 8. 上线顺序

### 阶段一：新读取路径

先上线轻量会话详情和独立 Run detail，短期允许旧数据仍存在。

### 阶段二：新写入路径

停止向 Message.metadata 写入完整快照，新增工具结果对象引用。

### 阶段三：一次性数据转换

备份、回填、上传原始对象、压缩 metadata，并验证历史会话。

### 阶段四：移除兼容代码

删除旧 metadata fallback、迁移临时代码和临时表，再进行一次最终构建和部署。

## 9. 验收标准

### 性能

目标会话：

- 首屏接口响应体小于 500 KB；
- TTFB 小于 300 ms；
- 会话详情 P95 小于 500 ms；
- Workbench 详情按需加载。

### 数据

- 单条 Message.metadata 小于 16 KB；
- 原始工具输出不进入 Message.metadata；
- AgentRunDetail 是 Workbench 的唯一来源；
- COS 对象可以通过短期签名地址读取。

### 功能

- 新会话正常加载；
- 历史会话正文正常加载；
- 历史 Workbench 详情正常加载；
- 来源列表和工具执行状态一致；
- 大输出可查看和下载；
- artifact 预览、下载、删除正常；
- 删除会话时同步清理 COS 对象；
- 迁移脚本删除后，应用仍可正常启动和读取。

## 10. 最终结论

最终架构应当是：

```text
Message        = 轻量聊天记录
AgentRun       = 运行生命周期
AgentRunDetail = Workbench 结构化详情
COS            = 原始工具输出和大型文件
```

历史数据只做一次性转换。转换完成后删除所有历史兼容逻辑、迁移临时产物和旧读取路径，系统只保留统一的新数据模型。


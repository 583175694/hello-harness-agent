# General Web Research 真实评测 V1

> 文档状态：已实现。本文记录 P8 评测工具的运行边界、判定方法和人工校准流程。

## 1. 目标

`@harness/agent-evals` 从生产 API 外部运行固定题集，不进入 Agent Runtime，也不增加生产接口或数据库表。它验证完整黑盒链路：

```text
Session 创建
-> Chat SSE
-> Runtime 决策
-> web_search / web_fetch
-> 最终回答
-> assistant metadata 持久化
-> 硬规则 / Judge / 人工抽检
-> Session 清理
```

## 2. 运行前提

开发者需先启动并配置 API、PostgreSQL、主模型和一个搜索 Provider。评测 Runner 检查 `http://127.0.0.1:4318/readyz`；使用本地 API 时还会在跑题前检查模型 Key 和题集所需的 Search Provider 配置。它不会代替开发者启动或停止服务。

```bash
pnpm dev
pnpm eval:research
```

默认 Smoke 串行运行 6 题并在采集后删除临时 Session。发布前显式运行 24 题 Full：

```bash
pnpm eval:research:full
```

可选参数：

```text
--suite smoke|full
--case <caseId>
--keep-sessions
--skip-judge
--api-base-url <url>
--output <directory>
```

评测 Session 标题使用 `[EVAL] <caseId>`，并按生产 Session 的 28 字符上限截断；runId 保存在报告、case 文件和 Session ID 关联中。`--keep-sessions` 用于在 Conversation 和 Workbench 中人工复核。默认输出目录是仓库根目录 `.eval/research/<timestamp>/`，该目录不进入 Git。

## 3. 题集

题集版本为 `v1`，Full 固定 24 题：3 题直接回答、3 题用户直链、4 题产品比较、4 题时事与市场、4 题技术排障、3 题政策资料、2 题旅行实时信息和 1 题公开证据不足。Smoke 从其中选择 6 个代表题。

动态事实题使用“截至评测运行日期”的提问方式。评测结果保存实际开始和结束时间，不使用容易过期的固定答案文本作为唯一标准。

## 4. 判定方法

确定性硬规则决定 CLI 退出码。迁移前的评测仍覆盖现有工具使用契约、SSE 终态、持久化一致性、工具/URL/Passage 预算、Fetch URL 来源、重复调用、早停、来源资格和回答链接可追溯性。Provider 或模型失败会作为明确执行失败记录，不能降格为低质量答案。

Model-led Tool Boundary 落地后必须同步校准硬规则：保留每个 assistant run 最多 20 次 Tool Call、协议终态、持久化一致性、来源资格、安全限制和链接可追溯性；删除对 Web 运行级 URL/Passage 预算、URL provenance allowlist、跨调用执行去重、Tool 强制早停和 Tool Result 字符注入预算的协议性要求。provenance 仍作为 Projection 派生的可观测事实参与报告，但不能作为 Fetch 权限。模型重复 Fetch 或继续调查不应仅因策略不理想就成为硬协议失败，应转为执行效率指标、Judge 信号和人工复核项；只有突破通用执行/安全边界或产生协议错误才确定性失败。

模型 Judge 只接收用户问题、Rubric、最终回答、已读取来源的有界 Passage 和工具摘要；它不能联网，也不能把 Search clue 当作原文。Judge 使用 1-5 分评估任务完成度、来源质量、事实支撑、来源相关性、限制说明和执行效率。结构化结果首次失败时允许一次格式修复，再次失败记为 `judgeError`。

Judge 配置优先级：

```text
EVAL_JUDGE_BASE_URL / EVAL_JUDGE_API_KEY / EVAL_JUDGE_MODEL
-> OPENAI_BASE_URL / OPENAI_API_KEY / OPENAI_MODEL
```

V1 的 Judge 结果是比较和人工筛选信号，不影响 CLI 退出码。首次真实 Smoke/Full 结果只是基线，不等于发布阈值；至少完成两轮人工校准后，才能冻结语义质量门槛。

## 5. 输出和人工抽检

```text
.eval/research/<runId>/
├── manifest.json
├── summary.json
├── summary.md
├── review.md
├── human-review.csv
└── cases/<caseId>.json
```

`review.md` 按题展示问题、Agent 最终回答、失败规则、工具执行、来源摘要和 Judge 结果。`human-review.csv` 同时携带这些自动诊断上下文和待填写的人工评分列。单题 JSON 包含标准 SSE、最终回答、执行快照、有限来源/Passage、硬规则、Judge 结果和聚合指标。不会保存 Raw HTML、完整 Provider 响应、Cookie、Header、API Key 或数据库连接信息。

人工抽检自动纳入全部硬规则失败、Judge `fail`/`limited_pass`、Full 每个类别至少一题，并以 case ID 稳定抽样至不少于 20%。人工结果需填写任务完成度、来源质量、事实支撑、来源覆盖、限制说明、执行效率、重大问题、最终结论和备注。

## 6. 当前边界

- 评测默认串行，优先降低限流和非确定性。
- Mock 集成测试不访问真实模型、搜索 Provider 或公网。
- 真实评测成本、延迟和网页波动属于结果的一部分，需要记录运行环境后再横向比较。
- 本阶段不引入正式 Evidence、`[Sx]`、Citation Validator、durable Run 或 SSE replay，也不以评测实现为这些未确定能力预留协议。

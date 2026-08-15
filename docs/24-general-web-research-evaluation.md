# Agent Evaluation System

> 文档状态：General Web Research Eval V1 已实现；Context Engineering Eval P0 评测代码与 `context-core-v1` 已落地。2026-08-15 的首次低压力 Dry Run 用于发现 Harness 问题，不能作为正式零点；S/M/L/X 已改为按 DeepSeek Tokenizer 实际达到目标区间，待运行修订后的高压力 Dry Run、Judge 人工校准和正式 Baseline。本文统一记录 `@harness/agent-evals` 的评估边界、现有 Research Eval，以及 Context Engineering 实施前必须完成的 P0 评估体系。

## 1. 现有 General Web Research Eval

### 1.1 目标

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

### 1.2 运行前提

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

### 1.3 题集

题集版本为 `v1`，Full 固定 24 题：3 题直接回答、3 题用户直链、4 题产品比较、4 题时事与市场、4 题技术排障、3 题政策资料、2 题旅行实时信息和 1 题公开证据不足。Smoke 从其中选择 6 个代表题。

动态事实题使用“截至评测运行日期”的提问方式。评测结果保存实际开始和结束时间，不使用容易过期的固定答案文本作为唯一标准。

### 1.4 判定方法

确定性硬规则决定 CLI 退出码。迁移前的评测仍覆盖现有工具使用契约、SSE 终态、持久化一致性、工具/URL/Passage 预算、Fetch URL 来源、重复调用、早停、来源资格和回答链接可追溯性。Provider 或模型失败会作为明确执行失败记录，不能降格为低质量答案。

Model-led Tool Boundary 落地后必须同步校准硬规则：保留每个 assistant run 最多 20 次 Tool Call、协议终态、持久化一致性、来源资格、安全限制和链接可追溯性；删除对 Web 运行级 URL/Passage 预算、URL provenance allowlist、跨调用执行去重、Tool 强制早停和 Tool Result 字符注入预算的协议性要求。provenance 仍作为 Projection 派生的可观测事实参与报告，但不能作为 Fetch 权限。模型重复 Fetch 或继续调查不应仅因策略不理想就成为硬协议失败，应转为执行效率指标、Judge 信号和人工复核项；只有突破通用执行/安全边界或产生协议错误才确定性失败。

模型 Judge 只接收用户问题、Rubric、最终回答、已读取来源的有界 Passage 和工具摘要；它不能联网，也不能把 Search clue 当作原文。Judge 使用 1-5 分评估任务完成度、来源质量、事实支撑、来源相关性、限制说明和执行效率。结构化结果首次失败时允许一次格式修复，再次失败记为 `judgeError`。

Judge 配置优先级：

```text
EVAL_JUDGE_BASE_URL / EVAL_JUDGE_API_KEY / EVAL_JUDGE_MODEL
-> OPENAI_BASE_URL / OPENAI_API_KEY / OPENAI_MODEL
```

V1 的 Judge 结果是比较和人工筛选信号，不影响 CLI 退出码。首次真实 Smoke/Full 结果只是基线，不等于发布阈值；至少完成两轮人工校准后，才能冻结语义质量门槛。

### 1.5 输出和人工抽检

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

### 1.6 当前边界

- 评测默认串行，优先降低限流和非确定性。
- Mock 集成测试不访问真实模型、搜索 Provider 或公网。
- 真实评测成本、延迟和网页波动属于结果的一部分，需要记录运行环境后再横向比较。
- Research Eval 不自行引入正式 Evidence、`[Sx]` 或 Citation Validator，也不修改 Durable Run、SSE replay 和 Runtime 的生产语义；它只从生产 API 外部验证已存在能力。

## 2. P0 Context Engineering Evaluation Baseline

### 2.1 定位

Context Engineering 在实现 `ContextCompiler` 前，必须先完成 P0 评估闭环并产出当前版本 Baseline。

P0 的目标不是建设一个覆盖所有 Agent 的通用评测平台，而是在现有 `@harness/agent-evals` 中增加一套最小但可信的 Context Engineering Benchmark，使相同模型、任务和外部材料能够在当前版本及后续每个实现阶段重复运行、量化比较并解释失败。

```text
固定 Context Benchmark
+ 固定 Tool Fixture
+ 固定模型与运行参数
+ Outcome / Trace / Cost 多维评分
+ 多次 Trial
+ Baseline / Candidate Diff Report
```

P0 完成后，Context Engineering 各阶段使用相同的 `core-v1` Benchmark：

```text
Baseline：当前上下文逻辑
V1：每轮 Context Compiler + Token Budget
V2：V1 + Summary + Constraint Ledger
V3：V2 + Evidence Artifact / Passage
V4：V3 + AGENTS / Skills / Plugins 等 Context Source
```

### 2.2 辩证边界

P0 必须解决“没有 Baseline 就无法证明提升”的问题，同时避免把评估平台本身建设成另一个长期大工程：

- 首版控制在约 20 个高信号 Case，而不是追求数百题规模。
- 主要复用现有 API Client、SSE、Runner、硬规则、Judge、报告和人工复核能力。
- 固定 Fixture 保证版本可比；现有真实联网 Research Eval 继续补充真实环境信号。
- Outcome 是主要得分；Trace 用于安全边界和失败诊断，不冻结唯一 Tool 路径。
- 确定性 Grader 优先；LLM Judge 只处理开放式语义，并必须经过人工校准。
- 报告保留质量、可靠性、Token、延迟和成本多个维度，不用单一总分掩盖质量与效率交换。

### 2.3 业界依据

P0 采用以下公开实践：

| 来源                   | 借鉴内容                                                                                    | 本项目落地                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| OpenAI Agent Evals     | 先从 Trace 定位工作流问题，再把明确行为固化为 Dataset 和可重复 Eval Run                     | 保存 Trial Trace；支持固定 Dataset 和阶段间 Diff           |
| OpenAI Evals / Graders | Dataset 与 Testing Criteria 分离；代码、Reference 和 Model Grader 组合                      | Task 单独定义 Outcome、Hard Rule 和 Semantic Rubric        |
| Anthropic Agent Evals  | Task、Trial、Grader、Transcript、Outcome 分层；多 Trial；Capability 与 Regression Eval 分开 | 数据模型采用相同分层；同时报告 `pass@k` 和 `pass^k`        |
| LangSmith              | Final Response、Trajectory、Single Step；Offline Eval 与 Online Monitoring 闭环             | Outcome 主评分，Trace/Step 诊断；真实失败回流 Offline Case |
| LongMemEval            | 信息提取、多 Session 推理、知识更新、时间推理和拒答                                         | 覆盖早期约束、约束覆盖、事实更新和证据不足拒答             |
| RULER                  | 通过可配置长度、位置、干扰项、多跳和聚合测试有效上下文能力                                  | Case 具备 S/M/L/X 压力和固定 Seed，不只做单一 Needle 测试  |

参考资料：

- [OpenAI: Evaluate agent workflows](https://developers.openai.com/api/docs/guides/agent-evals)
- [OpenAI: Evals](https://developers.openai.com/api/docs/guides/evals)
- [OpenAI: Graders](https://developers.openai.com/api/docs/guides/graders)
- [Anthropic: Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- [LangSmith: Evaluate a complex agent](https://docs.langchain.com/langsmith/evaluate-complex-agent)
- [LongMemEval](https://github.com/xiaowu0162/LongMemEval)
- [RULER](https://github.com/NVIDIA/RULER)

### 2.4 双轨评估

P0 使用两条互补但不混算的评估链路。

#### Lane A：Deterministic Context Benchmark

用于正式 Baseline 和阶段对比：

- 固定模型或尽量固定具体模型版本。
- 固定 Reasoning Effort、System Prompt 和 Tool Schema。
- 固定 Evaluation Clock。
- Search、Fetch、错误和长文内容使用不可变 Fixture。
- 每个 Trial 使用独立 Session 和干净状态。
- 记录 Git Commit、模型配置、Fixture Hash、Grader Version 和 Benchmark Version。

Fixture 只替换 Tool 的外部世界，不能绕过 API、Durable Agent Loop、Runtime、数据库、SSE 和持久化链路。

#### Lane B：Live Research Smoke

继续使用现有命令：

```bash
pnpm eval:research
pnpm eval:research:full
```

它验证真实 Search Provider、网页变化和网络故障，但实时网页和搜索排序会变化，因此不用于计算 Context Engineering 的精确版本增益。

### 2.5 Benchmark 组成

首版 `context-core-v1` 约 20 个核心 Case，按能力划分：

| 能力                  | 典型场景                                                   | 主要指标                                                          |
| --------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------- |
| Constraint Retention  | 早期语言/格式要求、新增约束、撤销旧约束、同级覆盖          | active constraint recall、superseded rejection、violation rate    |
| Context Pollution     | 无关闲聊、大型无关 Tool Result、相似错误来源、失败调用混杂 | task success、distractor resistance、goal drift                   |
| Evidence Fidelity     | 否定、限定条件、数字单位、来源冲突、证据不足               | claim support、contradiction、qualification retention、abstention |
| Long Agent Loop       | 10～15 次 Tool Call、多阶段调查、错误恢复                  | goal completion、rounds、duplicate tools、error recovery          |
| Connection Durability | SSE 断开重连、Tail Replay、Snapshot Fallback               | reconnect success、duplicate after reconnect、snapshot integrity  |
| Short Regression      | 直接回答、单次 Tool、短会话约束                            | quality non-regression、latency overhead、protocol correctness    |

同一 Case 可以覆盖多个能力，但必须声明一个主要 Capability，避免聚合报告重复计分。

Benchmark 分成：

```text
context-capability
  初始可以有较低通过率，用于衡量 Context Engineering 能否改善长上下文能力

context-regression
  保存当前已经稳定的短任务和协议行为，用于阻止后续实现退化
```

Capability Case 达到稳定高通过率后可以升级进入 Regression Suite，但旧版本和历史分数继续保留。

### 2.6 Context Pressure

借鉴 RULER，Case 通过固定 Seed 生成不同上下文压力：

```text
S：约占模型窗口 5%～10%
M：约占 40%～50%
L：约占 75%～85%
X：超过普通直接容纳范围，必须依赖摘要、选择或恢复
```

题集使用固定 Seed 的高熵填充材料，并由 DeepSeek TypeScript Tokenizer 在运行前计算 `planned_input_tokens`。P0 Runner 将 Planned Pressure 与 Provider 实际输入峰值分别报告：前者定义工作负载等级，后者用于观察未来 Context Compiler 是否在保持结果质量的同时减少实际输入。Connection Durability 和 Short Regression 不强行填充到 S 下限，避免污染其协议与短任务延迟信号。

P0 Baseline 不要求 X 级通过。Baseline 在 L/X 级的失败是后续能力提升的零点；S 级作为 Regression，后续不能因 Context Engineering 引入明显退化。

参数化变量包括：

- 关键约束或事实位于开头、中间或尾部。
- 干扰消息和 Tool Result 数量。
- 相似但错误的 Evidence 数量。
- 约束新增、覆盖和撤销次数。
- Tool 失败位置和恢复路径。

正式横向比较使用相同固定 Seed；阶段验收额外运行非日常调试 Seed，降低对固定文本过拟合的风险。

### 2.7 Task、Trial、Trace 与 Outcome

```ts
type ContextEvalTask = {
  id: string;
  version: string;
  suite: 'capability' | 'regression';
  capability: ContextCapability;
  pressure: 'S' | 'M' | 'L' | 'X';

  scenario: EvalScenario;
  fixtureRef: string;
  fixtureHash: string;

  expectations: {
    outcome: OutcomeExpectation;
    constraints: ConstraintExpectation[];
    evidence: EvidenceExpectation[];
    hardRules: HardRuleSpec[];
    semanticRubrics: SemanticRubric[];
  };
};

type ContextEvalTrial = {
  taskId: string;
  trialIndex: number;
  modelProfile: ModelProfileSnapshot;
  gitCommit: string;
  strategyVersion: string;
  fixtureHash: string;
  graderVersion: string;
  trace: EvalTrace;
  outcome: EvalOutcome;
  scores: EvalScores;
  metrics: EvalMetrics;
};
```

概念边界：

```text
Task       = 一道固定问题和成功标准
Trial      = 该 Task 的一次实际执行
Trace      = 本次执行的完整轨迹
Outcome    = 执行结束后的最终状态和回答
Experiment = 同一版本运行全部 Task 和多个 Trial
```

### 2.8 Multi-turn Scenario

现有 Research Case 只有单个 `prompt`；Context Eval 必须支持多轮 Scenario：

```ts
type EvalScenarioStep =
  | { type: 'user_message'; content: string }
  | { type: 'disconnect_sse'; afterEvent: string }
  | { type: 'reconnect_sse'; lastEventId: number }
  | { type: 'assert_checkpoint'; assertion: string };
```

Scenario Runner 仍从生产 API 外部驱动，不直接调用 Runtime 私有方法。当前 Durable Agent Loop 是 Connection-Durable：SSE 断开不会取消 Run，重连通过 Tail Replay 或 Snapshot Fallback 恢复观察；API 进程重启会把 Active Run 收敛为 `RUN_INTERRUPTED`，不会自动恢复 Runtime，因此 P0 不把进程重启续跑作为成功标准。

### 2.9 Fixture 设计

```text
packages/agent-evals/fixtures/context-v1/
├── manifest.json
├── conversations/
├── search/
├── webpages/
├── tool-results/
└── failures/
```

Fixture 必须：

- 内容不可变并计算 Hash。
- 明确原始 URL、抓取时间、标题、段落和预期 Evidence ID。
- 同时包含正例、反例、冲突材料和证据不足材料。
- 支持超长网页和不同上下文压力的确定性生成。
- 不包含真实 Cookie、Header、凭据和隐私数据。

Fixture Backend 只能在显式 Eval/Test 配置下启用；生产配置不能由客户端参数切换到 Fixture。

### 2.10 Grader 分层

评分优先级：

```text
环境 Outcome / 程序断言
  > 结构化确定性规则
  > LLM Judge
  > 低频人工复核与校准
```

#### Outcome Grader

检查最终结论、指定字段、语言格式、拒答、正确 Passage 和 SSE 重连后的真实状态。

#### Constraint Grader

检查当前有效约束是否遵守，以及已被 supersede/revoke 的旧约束是否停止生效。关键约束必须在 Task 中有明确 ID 和程序可验证的 Assertion。

#### Evidence Grader

使用预标注 Evidence Ledger：

```ts
type EvidenceExpectation = {
  claimId: string;
  expected: 'supported' | 'not_supported' | 'unknown';
  evidencePassageIds: string[];
  requiredQualifiers?: string[];
  forbiddenClaims?: string[];
};
```

数字、单位、否定和限定条件优先用确定性断言；开放式综合质量再交给 Judge。

#### Trace Grader

检查 Tool 协议闭合、Model Round、Tool Call、重复调用、无限重试、Context Overflow、Resume 后重复执行，以及最终声明是否读取过对应 Evidence。Trace 不要求唯一合法 Tool 顺序。

#### LLM Judge

Judge 拆成独立维度：

- `task_completion`。
- `constraint_following`。
- `evidence_groundedness`。
- `qualification_preservation`。
- `goal_coherence`。

Judge 使用固定模型和 Prompt Version，只接收 Task、Outcome、必要 Trace 摘要及 Evidence，不得联网，并允许返回 `unknown`。一个综合 Judge 分数不能替代各维度结果。

### 2.11 Judge 人工校准

正式 Baseline 前人工复核约 30～40 个分层抽样 Trial：

- 全部硬规则失败。
- 全部 Judge `fail` / `unknown`。
- 每个 Capability 的通过样本。
- Judge 与确定性 Grader 冲突的样本。
- 固定 Seed 的随机稳定样本。

Judge 在满足以下条件前只作为辅助信号，不作为发布 Gate：

- 人工与 Judge 的 Pass/Fail 一致率达到约 85%；或
- Weighted Kappa 达到约 0.7；并且
- 严重事实矛盾不能被 Judge 评为 Pass。

Conversation Summary 的质量也在该体系中评估，至少包括关键事实召回、约束召回、矛盾率、限定条件保持和多级摘要漂移。Summary Grader 在 V2 实现时接入，但 P0 预先冻结 Case、Rubric 和报告字段。

### 2.12 Trial 次数与统计

```text
开发 Smoke：每题 1 Trial
阶段 Full：每题 3 Trials
正式 Baseline / 阶段验收：每题 5 Trials
```

约 20 个核心 Case 的正式 Baseline 为约 100 个 Trial；成本不允许时可以先运行 60 个 Trial，但关键 Capability 在冻结 Baseline 前补足 5 次。

报告：

- `pass@1` 和每题成功次数。
- `pass@k`：k 次中至少成功一次，观察能力上限。
- `pass^k`：k 次全部成功，观察用户侧一致性。
- 每个 Capability、Pressure 和 Suite 的分组结果。
- Baseline/Candidate paired delta。
- Bootstrap 95% Confidence Interval。
- 最差 Case 和所有 Critical Violation。

本项目面向用户的可靠性更关注 `pass^3`，不能只展示容易随重试次数上升的 `pass@k`。

### 2.13 多维 Scorecard

| 维度                 | 指标                                                                          |
| -------------------- | ----------------------------------------------------------------------------- |
| Quality              | Task Success、Constraint Retention、Evidence Groundedness、Correct Abstention |
| Reliability          | `pass^3`、协议错误、Context Overflow、SSE Reconnect Success                   |
| Context Efficiency   | 每轮输入 Token、峰值 Token、重复上下文 Token、压缩率                          |
| Execution Efficiency | Model Round、Tool Call、重复 Tool、总耗时、TTFT                               |
| Cost                 | Prompt、Completion、Cached Token 和 Judge Cost                                |
| Diagnostics          | 失败阶段、遗漏原因、摘要覆盖、Context Trace                                   |

最终报告可以展示 Overview，但阶段准入使用多项 Gate。Token 降低不能抵消事实矛盾，速度提升不能抵消关键约束丢失，平均分提升不能掩盖少数 Critical Violation。

### 2.14 P0 需要补充的通用观测

当前评估已经采集 Tool Execution 和总耗时，但尚未获得完整模型 Token Usage。P0 应在 Model Adapter / Model Step 增加最小通用观测：

```text
prompt_tokens
completion_tokens
cached_tokens
model_round_duration_ms
finish_reason
```

优先保存 Provider 实际返回；Provider 不支持的字段记录 `null`，不能把近似值伪装为精确使用量。Context Eval 可以使用项目 Tokenizer 额外计算 `estimated_prompt_tokens`，但必须与 Provider Usage 分字段保存。

TTFT 由 Runner 从请求开始到第一个 `message.delta` 计算；Model Round 可从稳定 `roundSequence` 聚合。

这些字段属于通用模型可观测性，不代表提前实现 Context Compiler。

### 2.15 Baseline 与阶段准入

每个 Context Engineering 阶段开始前声明自己的能力假设和目标指标。统一 Gate：

1. Critical Violation 为 0。
2. Regression Suite 不出现经人工确认的实质退化。
3. 目标 Capability 有明确提升，而不只是综合平均分变化。
4. 效率收益不能通过牺牲 Evidence Fidelity 获得。
5. 统计证据不足时结论必须是“尚不明确”，不能强行宣布提升。

P0 先执行 Dry Run，用于发现 Task、Fixture 和 Grader Bug；修复后冻结 `context-core-v1`，再执行正式 Baseline。Dry Run 和正式 Baseline 使用不同 Benchmark Version 时不能横向混算。

### 2.16 版本纪律

- `context-core-v1` 冻结后不随意修改。
- 新发现的真实失败追加到后续小版本，不覆盖旧 Case。
- 修复 Task 或 Grader Bug 必须记录 Changelog。
- 不同 Benchmark Version 的分数不能直接比较。
- Grader 修改后优先重新评分已保存输出；无法重评时重跑 Baseline。
- 每个阶段必须使用相同 Benchmark Version、Fixture Hash 和 Model Profile。
- 线上失败持续回流为新的 Offline Case。

### 2.17 推荐代码结构

不先大规模重构现有 Research Eval。先保留当前文件，再提取确实共享的能力，并新增独立 Context 目录：

```text
packages/agent-evals/src/
├── core/
│   ├── api-client.ts
│   ├── sse.ts
│   ├── trial-runner.ts
│   ├── statistics.ts
│   └── report-writer.ts
├── research/
│   ├── cases.ts
│   ├── analyzer.ts
│   ├── judge.ts
│   └── report.ts
└── context/
    ├── cases.ts
    ├── scenario-runner.ts
    ├── fixture-registry.ts
    ├── graders/
    │   ├── outcome.grader.ts
    │   ├── constraint.grader.ts
    │   ├── evidence.grader.ts
    │   └── trace.grader.ts
    ├── judge.ts
    ├── statistics.ts
    └── report.ts
```

建议命令：

```bash
pnpm eval:context
pnpm eval:context:full
pnpm eval:context:baseline
pnpm eval:context:calibrate -- --input <human-review.csv>
```

概念上的 Baseline 对比：

```bash
pnpm eval:context:full --trials 5 \
  --compare .eval/context/baselines/context-core-v1.json
```

### 2.18 P0 交付物与完成标准

```text
.eval/context/<experiment-id>/
├── manifest.json
├── summary.json
├── summary.md
├── comparison.json
├── comparison.md
├── human-review.csv
├── trials/
└── traces/
```

Manifest 至少记录：

- Git Commit。
- Benchmark Version。
- Fixture Hash。
- Model / Provider / Reasoning Effort。
- System Prompt Hash 和 Tool Schema Hash。
- Judge Model 和 Prompt Version。
- Evaluation Clock。
- Trial Count 和原始 Run ID。

正式 Baseline 还要求 API 公开的 Model Context Profile 已验证。通过以下环境变量提供供应商权威值；`verified=true` 但缺少任一值或来源时 API 拒绝启动：

```text
DEEPSEEK_CONTEXT_WINDOW_TOKENS
DEEPSEEK_MAX_OUTPUT_TOKENS
DEEPSEEK_MODEL_PROFILE_SOURCE
DEEPSEEK_MODEL_PROFILE_VERIFIED=true
```

Context Judge 未配置时 Runner 不再静默跳过；必须配置独立 Judge，或显式使用 `--skip-judge` 将其记录为禁用。Judge 首次结构化输出失败时允许一次格式修复，输入会裁剪长压力材料并限制 Evidence 总量。人工填写 `human-review.csv` 后，`eval:context:calibrate` 计算一致率、Cohen's Kappa、严重 False Pass，并生成 JSON/Markdown 校准报告。

P0 只有在以下条件全部满足后才完成：

1. `context-core-v1` 和 Fixture 冻结。
2. Reference Solution 能通过对应 Grader。
3. Judge 完成人工校准，或明确只作为辅助信号。
4. 正式 Baseline 完成并保存全部 Trial、Trace 和报告。
5. 人工阅读失败 Trace，确认失败来自 Agent 而不是 Task、Fixture、Harness 或 Grader Bug。
6. 报告能够明确指出当前系统在约束保持、Evidence、长 Loop、Resume、Token 和延迟方面的真实零点。

P0 不实现 `ContextFragment`、`ContextCompiler`、Summary Store、Constraint Ledger、Evidence Artifact 或 Memory；这些能力属于后续 Context Engineering 阶段，P0 只为它们冻结可重复的验证标准。

# C7 User Memory

> **编号约定（Capability 主线）**
>
> - **大版本 `Cn`**：独立 Capability 项（如 **C6** Skills、**C7** User Memory、**C8** Browser Use、**C9** MCP Marketplace、**C10** Skills Marketplace）。
> - **小版本 `Cn-X`**：该 Capability 的分阶段交付（如 **C7-A** 读路径、**C7-B** 写路径）。与 C5-A/B、C3-C 文档内批次表「C3-C7」等 **子模块序号** 不是同一命名空间。
>
> **C7** 分阶段：**C7-A → C7-B → C7-C**。
>
> **专项规范（实施唯一依据）**：[06-memory.md](./06-memory.md)
>
> 与 [C6 Skills](./40-c6-skills.md) 独立，仅与 K5 共享 Context 编译入口。

| 阶段 | 名称 | 摘要 |
|------|------|------|
| **C7-A** | Read Path | 存储、检索、MemoryCard 注入、ref expansion、InjectionTrace |
| **C7-B** | Write / Review | Extractor、Policy、candidate 审核 UI、Session 删除重评估 |
| **C7-C** | Delegation 联动 | Worker 读 Memory 门控（与 P11 Delegation 同期）；可选 Profile / ConsolidationJob |

原路线图 **P9/P10** 已合并为本 Capability；**P11** 仍为 Bounded Delegation + Worker 总里程碑。

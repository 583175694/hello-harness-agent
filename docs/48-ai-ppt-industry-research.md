# AI PPT 业界实现调研与落地方案：从 Kimi Slides 到 dom-to-pptx

> 调研日期：2026-11-10；方案定稿：2026-11-11；**v2 修订：2026-11-11**（结论降级、单一真相源、验收指标重构；修订说明见 §0.1）
>
> 目标：回答两个问题——**优质 Agent 到底怎样把一份文档变成一套能交付的 PPT**，以及**本仓库如何用“生成 HTML → 导出 PPTX”这条链路落地**。
> 方法：直接阅读开源仓库源码（PPTAgent v0.2.0 与 main、Presenton main、dom-to-pptx v2.1.2）、公开产品文档（Kimi PPT、Gamma 等）、第三方架构分析，并用一份真实的 15 页中文汇报稿做端到端实测。
> 证据口径：**源码级结论**标注文件名；**产品文档结论**标注来源；**实测数据**标注样本与命令；**推断**明确写“推断”，不把猜测当事实。**v2 追加一条：交付质量的结论必须给出“环境前提”（字体/镜像），否则视为未验证。**
>
> 文档结构：§0.1 是 v2 修订说明；§1–§10 是业界调研与方法论；§11–§12 是可复用的开源链路与实测证据（§12.0 是复核的关键反证）；§13 是本仓库的落地方案（含成本与止损）；§14 是 HTML 生成契约；§15–§16 是限制、选型与取舍；§17–§19 是参考来源、总结与复现。

---

## 0. 结论先行

1. **AI PPT 的难点不在“生成文字”，而在“把内容装进一个受约束的视觉容器，并保证导出后仍然成立”。** 所有做得好的系统，本质都在解决同一个约束满足问题：内容长度 × 版式容量 × 字体度量 × 导出保真。

2. **业界存在两条清晰的技术路线，不是同一种产品的不同实现：**
   - **模板/版式约束路线**（PPTAgent、Presenton Standard、LandPPT、Kimi 的模板模式）：先有“可复用版式 + 内容 schema”，再让模型填槽。输出稳定、可编辑、可批量，视觉上限由模板库决定。
   - **生成式自由布局路线**（Presenton Smart、Gamma、Kimi 的自由风格）：模型直接产出 HTML/Tailwind 或卡片式布局，视觉上限高、同质化低，但必须靠“渲染—检查—重试”闭环和专门的导出引擎兜底。

3. **Kimi Slides 的体验优势，最可能来自“两条路线都用 + 一个强渲染校验闭环”**：官方文档明确它同时支持预设风格、上传模板、参考图复刻、自由风格，以及在线编辑、批注定位修改、动画、原生图表/SmartArt、导出可编辑 PPTX（`kimi.com/help/ppt/ppt-overview`、`kimi.com/features/slides`、`kimi.com/academy/slides-intro`）。它没有公开技术报告，因此其内部实现只能推断；但**产品能力面**已经暴露了它必须拥有的组件：模板解析、视觉分析、HTML/元素级渲染、在线编辑器、PPTX 导出器、版本与批注寻址。

4. **真正决定“像不像人做的”的，是三个不显眼的工程件：**
   - **版式容量模型**：每个文本槽有建议字数/可伸缩区间，生成时就约束，而不是导出后才发现溢出。
   - **渲染后复核（render-and-review）**：截图/导出后让视觉模型或规则检查重叠、截断、缺图，再回改。PPTAgent 新版 Skill 把这一步做成了**强制门禁**（`skills/pptagent/SKILL.md`）。
   - **原生对象导出**：文本是文本、图表是图表、形状是形状，而不是整页贴图。否则“可编辑”就是假的。

5. **如果要在本仓库（hello-harness-agent）落地，最合适的不是复刻 Kimi，而是复刻 PPTAgent 的“可验证生成”骨架 + Presenton 的“HTML 版式 + 原生导出”能力**，复用现有 Sandbox / Session Browser / Artifact 基础设施。建议分三期，先做“模板约束 + 渲染门禁”的可靠闭环，再放开自由布局。

6. **“先生成 HTML、再转 PPTX”这条链路只被部分验证**：15 页、10 张原生表格、**745 个文本 run**（约 439 个自由文本框 + 表格单元格），`dom-to-pptx` 导出耗时约 5 秒，正文页像素误差（MAE）约 6.3/255。**但这组数字不能证明“可交付”**——复核时发现同一批产物在缺 CJK 字体的渲染环境里中文全部变成方框，MAE 依然只有 6.8/255。像素误差对“整段文字丢失”几乎不敏感，不能作为验收指标。详见 §12.0、§12.6。

7. **真正决定能否交付的是三件事，且顺序不能颠倒**：①渲染/导出环境有正确 CJK 字体（否则一切验收都是假的）；②生成侧约束（骨架、容量、门禁）；③导出后**内容级**验收（字族、字符覆盖率、表格数），而不是只看像素。方案见 §13，HTML 契约见 §14。

8. **本方案的现实定位是“模板填充 + 一次性导出”，不是 Kimi 级编辑器。** P0/P1 的视觉上限由我们自己写的 6–9 个版式决定，**低于 Kimi 是预期内的**；元素级编辑、批注寻址、自由布局都不在当前 roadmap 内。这是刻意的取舍，不是分期能自然补上的能力。详见 §13.1、§16.1。

---

## 0.1 v2 修订说明（相对初版改了什么）

初版的问题不是细节错误，而是**证据强度与结论强度不匹配**：用单机、同字体的像素比对，论证了跨环境的交付能力，并在此基础上承诺了“Kimi 级修改体验”。v2 做了四类修订，均可在 §12 / §13 中定位到对应改动。

| # | 初版主张 | v2 改为 | 依据 |
|---|---|---|---|
| 1 | 链路“已被实测验证可行”，7/255 | 几何链路已验证，**字体可移植性与可读性未验证**；MAE 降级为辅助指标 | 复核发现缺 CJK 字体时中文全丢失，而 MAE 仍为 6.8；见 §12.0 |
| 2 | 用 `745 段可编辑文字` 作为正向指标 | 改为 **745 个文本 run**，并同时报告文本框数与表格单元格数；run 越碎越难编辑 | 解包统计：439 个自由文本框 + 10 张表；见 §12.1 |
| 3 | “PPTAgent 的 XML 里 `-apple-system` 出现 1,700+ 次” | 事实更正：PPTAgent 为 **0 次**，写的是 `PingFang SC`（同样不可移植，但**修法不同**） | 解包统计：dom-to-pptx 2,643、SlideSmith 2,646、html-to-pptx 2,571、PPTAgent 0；见 §12.3 |
| 4 | 用户修改走“对话改 HTML”，而 §9.3 称修改体验是护城河 | P0 明确 **`deck-plan.json` 是单一真相源**，HTML 只是投影；在 P0 就承认“不支持元素级编辑”，不承诺 Kimi 级体验 | 见 §13.1、§13.4、§16.1 |

> 附带修正：`artifacts/` 与 `docs/assets/` 在初版被当作仓库产物引用，但 `artifacts/*` 被 `.gitignore` 忽略、`docs/assets/` 为空。v2 把复现口径改为“脚本可重建 + 指标可断言”（新增 `scripts/ppt-unpack-check.py`），不再依赖未入库的二进制；见 §19。

---

## 1. 先把问题拆对：AI PPT 实际上是五个子问题

很多讨论把“AI 做 PPT”当成一个模型能力问题，实际是一条流水线，五个子问题各自有独立的最优解：

| # | 子问题 | 典型做法 | 失败表现 |
|---|--------|----------|----------|
| 1 | **讲什么**：叙事结构与信息取舍 | 大纲生成、深度研究、受众/页数约束 | 页页都是要点罗列，没有论证线 |
| 2 | **每页放什么**：内容到版式的映射 | 版式检索/选择 + 内容 schema | 选错版式，图放不下，标题过长 |
| 3 | **怎么排**：几何、字号、留白 | 固定模板 / 规则引擎 / 模型写 HTML | 重叠、截断、空半页、字号失衡 |
| 4 | **怎么保证**：生成后的质量闭环 | 截图复核、结构校验、重试 | 浏览器好看，导出错位/丢字 |
| 5 | **怎么交付**：格式与可编辑性 | python-pptx / PptxGenJS / DOM→PPTX | 整页图片、文本框错位、字体替换 |

**关键判断：子问题 1 已被 LLM 基本解决；子问题 3/4/5 才是产品分水岭。** 这也是为什么“套壳 ChatGPT 生成大纲 + 找个模板站导出”做出来的东西，和 Kimi 差距明显。

---

## 2. 四种架构家族（用来判断一个产品到底怎么做的）

第三方分析（Perceptis, 2026）把 AI 演示工具分为四类，这个分类对工程选型很有用：

| 家族 | 代表 | 布局由谁决定 | 优势 | 结构性缺陷 |
|------|------|--------------|------|------------|
| **模板填充 Template-fill** | Canva Magic Design、SlidesAI、Beautiful.ai（规则版） | 人工设计的版式库 | 快、稳、品牌一致 | 同质化，版式库即天花板 |
| **生成式布局 Generative-layout** | Gamma、Presenton Smart | 模型直接写 web-native 布局 | 视觉新颖、适应内容 | 卡片/网页不是固定画布，PPTX 导出天然易失真 |
| **宿主内 Copilot** | Microsoft Copilot、Plus AI | 宿主应用的版式/Designer | 原生文件、无转换 | 受宿主模板能力限制 |
| **Agentic deck builder** | Perceptis、PPTAgent（研究版） | Agent 规划 + 选版式 + 组装 | 论证结构与溯源更强 | 工程复杂、时延高 |

> 注意：这不是互斥标签。**Kimi 同时覆盖了模板填充、生成式布局、Agentic 研究三条路径**，按用户选择的风格切换。成熟产品最终都会走向“混合架构”。

---

## 3. Kimi Slides：能力面反推架构

### 3.1 公开事实（产品文档）

来自 Kimi 官方帮助中心与功能页（2026-11 抓取）：

- 由 **Kimi K3** 驱动；输入一句话、粘贴文本、上传 PDF/Word/PPTX/Excel/TXT/图片，数分钟生成完整演示文稿。
- **深度研究 + 内容生成**：调用搜索/数据库，引用内容标注来源。
- **视觉能力**：自动匹配配色、字体、图标、图表；支持预设风格、上传参考图/参考 PPT 复刻风格、自定义风格、自由风格 + 自定义配色。
- **输入侧模板**：上传公司/学校模板后，基于指定模板生成，无需重建母版。
- **输出侧可编辑**：文本、图片、形状、图表、SmartArt 均可选中编辑；支持在线编辑器、主题样式（主题色/文本样式批量生效）、动画（页面切换、GIF、可交互动效）、在线放映、分享链接、版本回退。
- **修改方式**：多轮对话 + **在具体元素上批注**，系统能定位到被批注的元素做定点修改。
- **导出**：PowerPoint（可编辑）或 PNG；复杂动效可用 Python 生成 GIF 后嵌入。

### 3.2 这些能力对应的必然组件（推断，按置信度排序）

| 产品能力 | 几乎必然需要的实现 | 置信度 |
|----------|--------------------|--------|
| 上传 PPTX 当模板、保留母版 | PPTX 解析 → 元素树/版式树 → 可替换字段识别 | 高 |
| 参考图复刻 | 视觉模型 + 版面元素检测（文本块/图片/形状/图表区域）→ 结构化重建 | 高 |
| 元素级可编辑 + 批注定位 | 内部文档模型（元素 id + 几何 + 样式 + 层级），而非“一页 HTML 字符串” | 高 |
| 主题色/文本样式批量修改 | 设计 token / 主题角色（primary/secondary/background、title/body…），元素引用 token | 高 |
| 原生图表、SmartArt | 图表使用结构化数据模型（labels/series/type），导出时映射为原生图表对象 | 高 |
| 动画可导出 | 动画绑定到元素 id 的时间轴模型；导出时映射为 PPTX animation XML | 中高 |
| 导出后样式一致 | 自研 DOM/元素树 → OOXML 导出器，而不是通用 HTML→图片 | 高 |

**最重要的推断：Kimi 的内部表示大概率不是“HTML 页面”，而是“元素树 + 主题 token + 页面画布”。** 理由：

1. HTML 字符串很难支撑“选中任意元素编辑 + 批注精确寻址 + 主题批量生效 + 动画绑定元素”。
2. 它宣称导出后“元素样式、页面布局、图表动画均与展示一致”，这要求生成侧就从结构化模型出发，而不是先生成网页再逆向。
3. 但它又明显具备“模型写复杂布局”的能力（自由风格、信息可视化、Python 生成 GIF），说明它可能采用**混合表示**：布局层可以用 HTML/CSS 表达，编辑层再解析为元素树并建立双向映射。

### 3.3 Kimi 做对了什么（可复用的产品判断）

1. **把“风格”做成一等公民**：风格不是 prompt 里的一句话，而是可命名、可复用、可上传、可保存的设计系统（配色/字体层级/留白/图形语言/版式规则）。这直接解决了“每次生成都不一样”的问题。
2. **允许“先用模板保底，再用自由风格拔高”**：模板模式保证可用性，自由模式保证惊喜感。两条路径共享同一套编辑器与导出器。
3. **把修改做成“可寻址”的**：批注能定位到元素，意味着系统知道“这句话属于哪个元素”，而不是把整页当黑盒重生成。这是从“生成器”升级为“编辑器”的关键。
4. **动画与图表是差异化，不是核心**：它们提升“演示感”，但真正留住用户的是“改起来不痛苦”。

### 3.4 Kimi 的已知局限（来自公开评测与产品文档）

- 模板数量有限，早期版本只能从给定模板中选（Analytics Vidhya, 2025-09）。
- 早期版本能读文档文字，但不能提取文档中的图片/表格（同上）；新版已宣称支持提取嵌入图片。
- 动画的**手动**增删改仍受限，需要让 Kimi 改（官方指南明确“暂不支持手动添加/修改动画或调整顺序”）。
- 复杂 CJK 字体在导出后仍可能发生度量变化——这是所有 HTML/浏览器排版系统的共性难题，不是 Kimi 独有。

---

## 4. PPTAgent：把“人类改 PPT”形式化成两阶段

仓库：`icip-cas/PPTAgent`（EMNLP 2025；当前 main 已演进为 DeepPresenter + Skill 形态）。论文：arXiv:2501.03936。

### 4.1 核心思想

论文摘要与代码一致：**把演示文稿生成建模为“编辑任务”，而不是“从零生成”。** 先分析一份参考 PPT，提取“版式 + 功能类型 + 内容 schema”；再基于这些版式，通过一系列编辑动作生成新页面。

```
Stage I  Presentation Analysis
  参考 PPTX ──► 幻灯片分类（功能页/内容页）
            ──► 版式聚类（视觉相似度）
            ──► 每类版式的元素 schema（名称/类型/建议字数/数量区间）

Stage II Presentation Generation
  源文档 ──► 大纲（planner）
        ──► 每页：检索内容 → 选版式 → 按 schema 写内容 → 生成编辑命令 → 执行 → 校验
```

### 4.2 Stage I：版式归纳（`pptagent/induct.py`）

关键实现细节：

- **功能页识别**：`category_split()` 用语言模型把幻灯片分成功能簇；代码里进一步把功能版式收敛为四类：`opening` / `table of contents` / `section outline` / `ending`（`pptgen.py` 的 `FunctionalLayouts`）。这四类由**规则**插入，不受页数参数约束。
- **版式聚类**：`layout_split()` 先按 `(slide_layout_name, content_type)` 分组，再用**图像 embedding 余弦相似度**聚类（论文附录：阈值 0.65；预处理时把文字替换成占位符 `a`、图片替换成纯色块，避免内容干扰版式判断）。每个簇选“形状最多”的那页作为模板页。
- **schema 抽取**：对每个版式模板页，把 HTML 化的幻灯片 + 现有文本/图片 caption 交给 `schema_extractor`，产出元素列表。

`presentation/layout.py` 定义了后续生成真正依赖的数据结构：

```python
class Element(BaseModel):
    name: str
    data: list[str]
    type: Literal["text", "image"]
    suggested_characters: int | None      # 该槽位的建议字数
    variable_length: tuple[int, int] | None   # 数量可变区间（如列表项）
    variable_data: dict[str, list[str]] | None

class Layout(BaseModel):
    title: str
    template_id: int                      # 用哪一页做底
    slides: list[int]
    elements: list[Element]
    vary_mapping: dict[int, int] | None   # 数量→备用模板页
```

**这是整套系统最重要的设计**：版式不是一张图，而是**带容量约束的内容 schema**。`suggested_characters` 让模型在生成时就控制长度；`variable_length` + `vary_mapping` 让“3 个要点/5 个要点”映射到不同的底页，避免硬塞。

### 4.3 Stage II：逐页生成（`pptagent/pptgen.py`）

`PPTAgent.generate_slide()` 的顺序：

1. **功能页**：直接取对应 layout，用规则文案（目录、章节页、致谢页）生成。
2. **内容页**：
   - `_select_layout()`：`outline_item.retrieve()` 检索源文档段落与图片 → `content_organizer` 提炼要点 → 把候选版式名/元素/字数区间给 `layout_selector`，让模型选版式并给出理由；有图时只开放多模态版式。
   - `_generate_content()`：`editor` 按选中版式的 `content_schema` 生成每个元素的内容；随后 `_validate_content()` 校验元素齐全、图片路径合法，并用 `length_rewrite()` 对超长文本做**二次改写**。
   - `_generate_commands()`：把“旧内容 → 新内容 + 数量变化”转成编辑命令列表。
   - `_edit_slide()`：`coder` 角色把命令翻译成**受限 API 调用**（不是任意代码），`CodeExecutor` 在模板页的深拷贝上执行；失败则带 traceback 重试，最多 `retry_times` 次；最后校验页面结构。

**关键工程点：**

- **受限 API 而非自由代码**：`apis.py` 注册了一组幻灯片编辑函数，模型只能调用这些函数。这比“让模型写 python-pptx 代码”可靠得多，也更容易做错误反馈。
- **在模板页副本上编辑**：保留原生形状/样式/动画，只改内容与必要几何。这是“编辑式生成”能保持设计质量的原因。
- **数量变化映射到不同模板页**：`index_template_slide()` 根据列表项数量选 `vary_mapping` 对应的底页，避免把一个 3 列版式硬扩成 5 列。
- **并发**：`asyncio.gather` + 信号量按页并发；单页失败默认跳过（`error_exit=False`），不拖垮整份。

### 4.4 工程边界（官方 Best Practice）

`BESTPRACTICE.md` 明确了很多“能力边界”，这些对选型非常重要：

- 依赖 `python-pptx` 解析，**不支持嵌套组合形状、Freeform、音视频等复杂元素**，遇到会跳过。
- 建议参考模板每页元素 ≤ 6 个、文本占元素空间约 60%、文本框设为“溢出时缩排”。
- 不创建新版式、不修改样式，只做内容替换与少量结构变化。
- 跨语言需要 `length_factor` 校正（中→英约 0.5，英→中约 2.0）。

**这说明 PPTAgent v0.2 的定位是“高质量模板复用”，不是“任意视觉设计”。** 它的优势是可解释、可验证、可批量；劣势是视觉多样性受参考模板限制。

### 4.5 新版 PPTAgent Skill：把质量闭环做成硬门禁

当前 main 的 `skills/pptagent/` 已经换了一套更工程化的形态（适合 coding agent 调用）：

```
task.json                  slides / aspect_ratio / language
slides/slideNN.html        模型直接写的 HTML 源文件
assets/                    本地图片/字体/CSS
qa/                        渲染截图与 contact sheet
workspace-state.json       渲染/复核/构建的证据（CLI 管理）
answer.pptx                可编辑交付物
final-report.json          验收结果
```

流程（`SKILL.md` + `core.py`）：

1. `init` / `scaffold`：建立固定画布（16:9 = 1280×720、4:3 = 960×720、A1）。
2. 模型写 HTML；**只允许静态 HTML/CSS**，资源必须本地化（远程图片要先下载）。
3. `review-slides`：Playwright 逐页截图，**每一页都必须人工/视觉模型检查并记录 verdict**。
4. `build`：调用 `deeppresenter` 的 HTML→PPTX 转换器（Node + `pptxgenjs` + `sharp` + Playwright）。
5. `review-deck`：LibreOffice 把 PPTX 转 PDF，再渲染成图，生成 contact sheet，**再检查一次导出结果**。
6. `finalize`：核对页数、画布比例、文件哈希、复核记录是否与当前输入一致；只有全绿才 `complete=true`。

`core.py` 里的 `input_snapshot()` 会把所有 slide 与共享资源做 **SHA-256**，任何资源改动都会让旧复核失效（`review_gaps()`）。这是一个非常值得抄的细节：**质量结论必须绑定到具体输入版本，不能“昨天检查过”就放行。**

### 4.6 PPTAgent 的启示

- **“编辑式生成”比“从零生成”更容易保证质量**：站在一个已验证的版式上改，几何与样式风险大幅降低。
- **把版式容量写进 schema**：`suggested_characters` 是把“排版问题”前置成“生成约束”的关键。
- **导出后必须再看一次**：浏览器截图通过 ≠ PPTX 通过。字体度量、换行、裁切都会变。
- **质量门禁要可审计**：每页 verdict + 输入哈希 + 最终报告，才能让 Agent 自己判断“能不能交付”。

---

## 5. Presenton：把“模板认证”和“生成式 HTML”做成两条产品线

仓库：`presenton/presenton`（Apache-2.0，10k+ stars）。文档：`docs/presentation-generation-modes.md`、`docs/template-v2.md`。

### 5.1 两种生成模式

| 模式 | 布局来源 | 是否有大纲审核 | 适用 |
|------|----------|----------------|------|
| **Standard** | 预定义固定版式（内置/自定义模板） | 有 | 稳定、可预测、品牌一致 |
| **Smart** | 模型自适应生成 HTML/Tailwind | 无，直接流式进编辑器 | 视觉多样、快速出稿 |

环境变量 `PRESENTATION_GENERATION_MODE=both|standard|smart` 控制 UI 与 MCP 工具暴露。

### 5.2 Standard 流水线

依据 `utils/llm_calls/*.py`、`templates/v2/*`：

```
主题/文件/指令/页数
  └─► generate_presentation_outlines   （Markdown 大纲，每页 ## 标题 + bullets/table）
        └─► generate_presentation_structure （为每页选 layout_index）
              └─► generate_slide_content     （按 layout 的 JSON schema 生成结构化字段）
                    └─► hydrate layout UI    （深拷贝版式 DOM，填入字段，扩展/收缩重复组）
                          └─► 取图/图标 → 保存 → 导出 PPTX/PDF
```

几个值得注意的实现：

- **大纲 prompt 明确区分“内容”与“制作指令”**：`generate_presentation_outlines.py` 里有 `DIRECT_CONTENT_VOICE_RULES` 与 `content_only_rules`，禁止出现“这一页展示…”“创建柱状图”等元话语；图表请求要转成 Markdown 表格数据，而不是把指令写进正文。
- **页数、语言、语气、是否含封面/目录是“权威设置”**，会覆盖用户内容里的冲突请求。
- **内容生成严格按 schema**：`generate_slide_content.py` 要求 JSON schema 输出、字符上限、LaTeX 包裹规则、演讲者备注纯文本；超出字符上限要改写而不是截断。
- **布局选择与内容生成分离**：先选版式，再按该版式的 schema 生成，避免“内容写完了却放不进去”。

### 5.3 Template V2：从任意 PPTX 认证出可复用版式

`docs/template-v2.md` 描述得很完整，这是 Presenton 最值得研究的部分：

1. **抽取**：PPTX → `RawSlideLayouts`（元素、位置、尺寸、样式、资源）；同时每页必须有**渲染预览图**。
2. **逐页认证**（最多 10 页并发），每页多趟视觉模型：
   - 视觉数据检测：图表、表格、文本列表、进度条、仪表盘；
   - 语义分析：把元素分组为可复用组件，标记 `editable` / `decorative`；
   - 弹性区域分析：卡片网格、序列等可重复/流式内容；
   - 文本容量分析：安全长度与增长约束；
   - 编译与认证：校验几何、失败时降级为保真版式。
3. **模板元数据**：相似组件聚类去重、颜色/字体映射到语义主题角色、资源归档。
4. **生成时**：只把 `decorative=false` 的元素变成 schema 字段；选版式 → 生成内容 → 深拷贝 DOM → 填值 → 重复组在认证范围内扩展/收缩 → 取图/图标 → 导出。

**核心思想：模板不是“一张背景图”，而是“经过视觉模型认证的、带可编辑字段与容量约束的结构”。** 这与 PPTAgent 的 `Layout/Element` 是同一思路，只是 Presenton 把它做得更产品化（多趟视觉分析、组件复用、主题角色）。

### 5.4 Smart 模式：模型直接写 1280×720 的 HTML

`generate_smart_presentation.py` 的约束非常硬核，值得逐条学习：

- 输出格式用分隔符切分每页 HTML，`data-slide-type="title|toc|content|closing"`。
- 每页必须是 `relative h-[720px] w-[1280px] overflow-hidden` 的 section。
- **禁止** `html/head/body/style/link/meta/base/iframe/object/embed/form`、内联事件、`javascript:` URL。
- **禁止滚动/裁剪**：`overflow-auto|scroll`、`line-clamp-*`、`truncate`、`text-ellipsis` 都不允许；内容必须真的排进画布。
- **文本密度上限**：标题页 80 词/800 字符；目录 220 词/1900 字符；有主视觉的内容页 160 词/1400 字符；纯文字页 190 词/1700 字符。超限直接 400，让模型重排。
- **几何检查**：`smart_slide_layout.py` 解析 HTML，检查绝对定位/负 margin/translate 是否导致越界或重叠。
- **图表必须是真的 Chart.js**：canvas + 同页内联初始化脚本；禁止用图表图片替代；禁止 fetch/XHR/WebSocket/eval 等危险脚本。
- **重试**：`SMART_GENERATION_MAX_ATTEMPTS = 8`，失败带原因重试。

这套“生成时就约束 + 生成后静态检查 + 失败重试”的组合，是生成式布局能产品化的关键。

### 5.5 导出：浏览器里量 DOM，再写 PPTX

- 导出不是把 HTML 截图贴进 PPT。`@presenton/export-core` 在浏览器中打开 `/pdf-maker` 页面，用 **3000px 宽视口**测量每个元素，再把文本/形状/图片写成原生 PPTX 对象（`run-presentation-export.mjs`、`PdfMakerPage.tsx` 注释）。
- 页面把每页固定为 1280×720，保证测量坐标与画布原点一致。
- PDF 用浏览器打印；PPTX 用 export-core 的 DOM→OOXML 生成。
- **已知缺陷**：中文 Web 字体在 Windows PowerPoint 中仍会出现替换、换行变化、文本框尺寸变化，甚至内容消失（GitHub issue #904）。这说明 **HTML→PPTX 的字体度量问题是行业级难题**，不是某个项目没做好。

### 5.6 Presenton 的启示

- **模板认证**是把“任意 PPTX”变成“可用模板”的关键；没有认证的模板只是背景图。
- **生成式模式的本质是“受约束的代码生成”**：约束越具体（画布、密度、禁用项、几何检查），可用率越高。
- **导出器是护城河**：DOM 测量 + 原生对象写入，比通用 HTML→图片复杂得多，但决定了“可编辑”是不是真的。
- **字体是 CJK 场景的第一大坑**：要在产品层面提供字体映射/嵌入/降级策略，甚至提供“图片型 PPTX”作为保真兜底。

---

## 6. 其他值得参考的开源实现

### 6.1 LandPPT（`sligter/LandPPT`，3.6k stars）

定位：中文优先的 AI 演示平台，流程是“主题/文档 → 大纲 → HTML PPT → 讲稿/配音 → 导出”。

值得借鉴：

- **按角色路由模型**：大纲/幻灯片/编辑/模板/讲稿分别可配模型，控成本。
- **并行生成**：单页生成逻辑不变，只并行调度。
- **多格式导出**：标准可编辑 PPTX 依赖 Apryse 商业许可；无许可时走“图片型 PPTX”（保真高、页内不可编辑）。这是很现实的产品折中。
- **深度研究**：Tavily + SearXNG，多引擎检索与摘要。

### 6.2 PPTist（`pipipi-pikachu/PPTist`）

定位不是 AI 生成器，而是 **Web 幻灯片编辑器/放映器**（Vue 3 + TS），支持文本/图片/形状/线/图表/表格/视频/音频/公式，导入 PPTX 保真约 85%+，导出约 95%+。

它提供 `doc/AI_PPT_SCHEMA.md`，定义 AI 直接生成页面 JSON 的结构（元素类型、坐标、样式、图表数据、表格、富文本）。

**价值：如果你要自建“可编辑的 AI PPT”，PPTist 提供了现成的编辑器与页面数据模型；AI 只需产出 JSON，而不是 HTML。** 这比“生成 HTML 再想办法编辑”在工程上更可控。

### 6.3 AiPPT（`veasion/aippt`）

定位：商用级 AI 生成 PPT，核心能力是 **PPT ↔ JSON 双向转换**（解析 PPT 为 JSON、JSON 反渲染为 PPT），支持原生图表、动画、3D 特效。开源部分主要是转换与渲染底座，商业版提供完整服务。

**价值：验证了“结构化 JSON 作为中间表示”是可行的产品级路线。**

### 6.4 Anthropic 的 `export-as-pptx-editable` Skill

这是 Claude 生态里一个很典型的“HTML deck → 原生 PPTX”工具设计：

- 输入：画布宽高、每页的 `showJs`/`selector`、需要隐藏的导航元素、缩放容器选择器、字体策略（Google Fonts 导入或字体替换）、文件名。
- 处理：先做字体替换（保证 reflow 后的布局被正确捕获）→ 逐页截图/测量 → 生成原生文本/形状/图片 → 返回校验 flags。
- 关键洞察：**字体替换必须在截图之前完成**，否则布局是按旧字体排的，导出必然错位。

### 6.5 Gamma（闭源，仅作架构参考）

Gamma 的核心是“card”而不是“slide”：内容块可以纵向滚动、长度可变，AI 先生成内容再让布局适配内容。这带来了很强的网页观感，但也导致 PPTX 导出时“卡片→固定画布”的结构性失真（Perceptis 分析；大量用户反馈）。

**教训：如果你的交付物必须是 PPTX，就不要把“可滚动网页”作为内部第一性表示。** 画布约束应该从第一天就存在。

---

## 7. 横向对比：谁在哪一层做了什么

| 能力 | PPTAgent v0.2 | PPTAgent Skill (main) | Presenton Standard | Presenton Smart | Kimi（推断） |
|------|---------------|------------------------|--------------------|-----------------|--------------|
| 输入文档解析 | 有（Document） | 由宿主 Agent 负责 | 有（PDF/Word/…） | 有 | 有（多格式） |
| 深度研究/引用 | 无（论文明确 RAG 简单、不联网） | 由宿主工具负责 | 可选 Web Search | 可选 | 有，强调溯源 |
| 版式来源 | 参考 PPT 归纳 | 无（模型写 HTML） | 固定/认证模板 | 模型生成 | 预设/上传/参考图/自由 |
| 内容容量约束 | **强**（suggested_characters / variable_length） | 弱（靠 prompt + 检查） | **强**（schema + 字符上限） | 中（词数上限 + 几何检查） | 强（推断） |
| 生成后视觉复核 | 无（v0.2） | **强制门禁**（逐页 + 整份） | 有预览，无强制视觉复核 | 有静态几何检查 | 有（推断，在线编辑器 + 预览） |
| 原生可编辑导出 | 是（python-pptx 编辑） | 是（HTML→PPTX） | 是（DOM→PPTX） | 是（DOM→PPTX） | 是（官方宣称） |
| 动画 | 保留模板动画 | 静态 HTML，无动画 | 模板动画 | 有限（Chart.js/HTML） | 强（含 GIF/交互） |
| 编辑体验 | WebUI 简单 | 交付文件 | 拖拽编辑器 | HTML 编辑器 | 完整在线编辑器 + 批注 |
| 最大风险 | 模板解析边界 | 字体/导出保真 | 模板认证成本 | CJK 字体/布局溢出 | 闭源、成本、模板有限 |

---

## 8. 优质系统的七个共同不变式

把上面的实现抽象一层，做得好的系统都在满足这七条：

### 8.1 先定叙事，再定版式

大纲必须是**可审阅的中间产物**：有页标题、每页一个主张、支撑证据、图表意图。Presenton Standard 有显式 outline review；PPTAgent 的 planner 产出 `OutlineItem`（topic / purpose / indexes）；Kimi 也是先生成结构再选风格。

反例：直接让模型“生成 10 页 PPT”，模型会在生成第 8 页时忘记第 2 页的论点，导致重复与断裂。

### 8.2 版式必须是“带 schema 的容器”，不是图片

最小 schema 应包含：

```ts
type LayoutElement = {
  id: string;
  kind: "text" | "image" | "chart" | "table" | "shape";
  role?: "title" | "subtitle" | "body" | "caption" | "metric";
  box: { x: number; y: number; w: number; h: number };
  capacity?: {
    minChars?: number;
    maxChars: number;       // 硬上限
    suggestedChars?: number;
    minItems?: number;
    maxItems?: number;
  };
  styleRef?: string;        // 指向主题 token
  decorative?: boolean;
};
```

有了 `capacity`，生成时就能要求模型“写到 35–55 字”，而不是写完再截断。

### 8.3 内容生成与版式选择解耦

顺序应是：`检索/提炼 → 选版式 → 按该版式 schema 写内容 → 校验 → 必要时换版式`。

PPTAgent 的 `_select_layout` 先选版式再 `_generate_content`；Presenton 先 `generate_presentation_structure` 再 `generate_slide_content`。这不是巧合，是因为“内容与容器同时生成”会让模型两头都做不好。

### 8.4 生成后必须有渲染级校验

至少三层：

1. **结构校验**：页数、画布比例、元素齐全、图片路径存在、schema 合法。
2. **视觉校验**：截图后用视觉模型/规则检查重叠、截断、越界、空白过多、图片缺失。
3. **导出校验**：PPTX 转 PDF/图片，再检查一遍字体、换行、位置。

PPTAgent Skill 把 1/2/3 做成了 `finalize` 的硬检查；Presenton Smart 做了 1/2（静态几何 + 词数），导出问题靠 issue 反馈迭代。

### 8.5 质量结论要绑定输入版本

PPTAgent `input_snapshot()` 对 slide + assets 做哈希，任何改动都会让旧 review 失效。这是一个容易被忽略但极其重要的工程约束：**否则 Agent 会拿“上一版检查通过”给“这一版”背书。**

### 8.6 导出必须是原生对象

- 文本 → 文本框 + run（保留字号/颜色/加粗）
- 形状 → 原生 shape
- 图表 → 原生 chart（或至少可编辑的图表数据）
- 图片 → 图片对象

整页 PNG 贴图可以“保真”，但用户无法改一个字，长期价值很低。LandPPT 把“标准可编辑 PPTX”和“图片型 PPTX”作为两个明确选项，是诚实的产品设计。

### 8.7 修改必须可寻址

“把第二页那个数字改大一点”要能定位到 `slide[1].elements[metric_1].style.fontSize`，而不是重生成整页。Kimi 的批注定位、Presenton 的 layout hydration、PPTAgent 的 element name 都是同一件事的不同实现。

---

## 9. 为什么 Kimi 的观感更好：差距主要在“设计系统”而不是模型

很多团队以为 Kimi 好看是因为 K3 更强。模型有影响，但更关键的是三件事：

### 9.1 风格是结构化设计系统

Kimi 的自定义风格要求用户填写“配色方案、字体字号、封面页设计思路、正文页框架系统”，并支持上传参考图。这说明它的风格不是一段散文 prompt，而是**可被检索、可被注入、可被复用的设计规则集合**。

对应到工程：你需要一个 `StyleSpec`：

```ts
type StyleSpec = {
  id: string;
  palette: { primary; secondary; background; surface; text; muted; accent };
  typography: { title; subtitle; body; caption; metric };
  spacing: { pagePadding; sectionGap; cardGap };
  motifs: { cornerRadius; borderWidth; shadow; iconStyle; imageTreatment };
  layoutRules: { titlePosition; footer; grid; maxBullets };
  referenceImages?: string[];
};
```

生成时把 `StyleSpec` 渲染成 CSS variables / 主题 token，所有元素引用 token。这样“换风格”是换 token，不是重写每页。

### 9.2 模板与自由布局共享编辑器/导出器

Kimi 的模板模式与自由模式最终都进入同一个在线编辑器，都能导出 PPTX。这意味着它有一套**统一的内部文档模型**，而不是两套烟囱。

这是很多开源项目的短板：模板路线用 python-pptx，自由路线用 HTML，两条路的编辑与导出各写一套，维护成本极高。

### 9.3 修改体验是产品核心

官方指南花了大量篇幅讲：在线编辑、主题批量修改、多轮对话、批注定位、版本回退。这些不是“锦上添花”，而是用户真正付费的理由——**第一稿只要 70 分，能快速改到 90 分才是价值。**

---

## 10. 常见失败模式与对策

| 失败模式 | 根因 | 对策 |
|----------|------|------|
| 文字溢出/重叠 | 生成时不知道容器容量 | schema 带 `maxChars`；生成后几何检查；字号阶梯降级 |
| 导出后换行/错位 | 浏览器字体度量 ≠ PowerPoint 字体度量 | 字体映射/嵌入；导出前固定字体；留 10–15% 余量；导出后复核 |
| 中文标点跑到行首/单独一行 | CJK 断行规则差异 | 避免窄容器；`word-break` 策略；导出后检查 |
| 整页像“AI 模板” | 版式单一、装饰过多、字号过大 | 多版式库；限制每页元素数；咨询风格模板；差异化构图 |
| 图表是图片 | 用生图模型画图表 | 强制结构化图表（Chart.js / 原生 chart） |
| 图片与内容无关 | 图片检索只看关键词 | 用页面主张生成图片 brief；视觉相关性复核 |
| 修改后整页变样 | 没有元素级模型 | 元素 id + 局部编辑；版本 diff |
| 动画导出丢失 | 动画未绑定元素/时间轴 | 动画模型与元素 id 绑定；导出映射 OOXML |

---

## 11. 单独可用的开源「HTML → PPTX」链路

第 4–5 节里的 PPTAgent、Presenton 都是完整产品，HTML→PPTX 只是其中一段。如果只想复用它，下面是目前可以直接拿来跑的开源实现。

### 11.1 对比

| 项目 | License / 活跃度 | 形态 | 原生对象 | 表格 | 适合 |
|------|------------------|------|----------|------|------|
| **dom-to-pptx**（atharva9167j） | MIT，390★，2026-10 仍在更新，npm v2.1.2 | JS 库 + `dom-to-pptx-exporter` CLI（Puppeteer/Playwright） | 文本/形状/图片/SVG/原生表格/原生 chart/动画 | **原生 `<table>`** | 高密度汇报页、表格多、要 CLI 批处理 |
| **html-to-editable-pptx**（Hasasasa） | MIT，97★，2026-07 | Python CLI + Agent Skill（Claude Code / Codex） | 文本/形状/图片/SVG；复杂装饰走局部截图兜底 | 无 `add_table` 分支，表格会拆成文本+形状 | 想直接挂到 coding agent、要审计物料 |
| **SlideSmith**（AliceLJY） | MIT，1★，2026-10 | CLI，薄封装 dom-to-pptx | 同 dom-to-pptx | 同 dom-to-pptx | 看“本地 server + Playwright + 截图兜底”的编排写法 |
| **html-to-pptx**（joker-duzhong） | MIT，19★，2025-12 | 浏览器端 JS 库（pptxgenjs） | 文本/形状/原生表格/原生 chart/动画 | 原生 `<table>` | 前端直接导出，不想跑 Node CLI |
| **PPTAgent Skill / DeepPresenter** | 开源，完整 Agent | Skill + `deeppresenter` 转换器 | 文本/形状/图片 | 走 HTML 元素装配 | 要“生成 + 复核 + 导出”整条闭环 |
| **Presenton** | Apache-2.0，产品级 | FastAPI + Next.js | DOM→OOXML 原生对象 | 原生表格 | 要完整产品；导出器 `@presenton/export-core` 以打包产物形式存在，没有作为独立库开源 |

### 11.2 实测：dom-to-pptx 处理高密度中文表格页

构造了一页 1600×900、含 5 段信息区 + 8×6 风险矩阵表格 + 多组卡片的 HTML，执行：

```bash
npx dom-to-pptx-exporter dense.html \
  --output dense.pptx --selector .slide \
  --width 13.333 --height 7.5 --bw 1600 --bh 900
```

结果（解包 `slide1.xml` 统计）：

| 指标 | 结果 | 含义 |
|------|------|------|
| 文件大小 | 25 KB | 不是整页贴图 |
| `<p:sp>` | 106 | 原生形状/文本框 |
| `<p:txBody>` | 72 | 72 个可编辑文本块 |
| `<a:tbl>` | 1 | 1 个**原生表格**（含单元格底色） |
| `<p:pic>` | 3 | 3 张图片（装饰，非整页） |
| `<a:ea typeface>` | 181 | 写入了东亚字体，不是只写 latin |
| 最大 y 坐标 | 5.67 in / 7.5 in | 几何按画布等比映射 |

渲染验证（LibreOffice → PNG）：网格、色块、表格单元格底色、层级关系都正确；中文显示为方块是本机 LibreOffice 找不到 `PingFang SC`，PPTX 内的文字本身是正确的（`<a:t>` 里是完整中文）。

**v2 补充：这个现象比初版写的更严重，也更值得写进验收。** 它不是“换台机器就好”的偶发问题，而是**链路级别的假阴性来源**：只要渲染/复核环境没有该字族，任何“导出后回渲染比对”都会把“文字丢失”看成“轻微色差”，从而误放行。因此 §13.5 把字体探针列为 Preflight 的**第一项**，§13.8 把“字符覆盖率”列为硬指标，而不是可选项。字体层面正确的做法是：**HTML 显式写跨平台字族 + 镜像预装同名字体 + 导出后校验字族名**，三者缺一不可。

### 11.3 关键实现细节（dom-to-pptx）

- `processSlide()` 计算 `scale = min(PPTX宽/内容宽, PPTX高/内容高)`，把 HTML 画布等比映射到幻灯片；内容不会被拉伸变形。
- 遍历 DOM，按 `getBoundingClientRect()` + `getComputedStyle()` 生成绘制队列，保留 DOM 顺序作为 z-order。
- `<table>` 走 `extractTableData()` → `slide.addTable()`，支持原生表格与单元格底色；但 **PptxGenJS 的行高是最小高度**，内容多时会撑开，密集表格必须导出后复核。
- 复杂装饰（gradient / shadow / filter / blend / skew）走局部截图兜底，文字仍然是矢量。
- CLI 支持 `--width/--height`（英寸）与 `--bw/--bh`（浏览器视口像素），因此可以精确控制“1600×900 HTML → 13.333×7.5in PPT”。

### 11.4 结论

**这条链路已经有可直接使用的开源实现，不需要自己从零写导出器。**

- 要“最省事、表格多、中文汇报页”：优先 **dom-to-pptx**（本次实测通过）。
- 要“挂进 Codex/Claude 的工作流、要逐页审计物料”：用 **html-to-editable-pptx** 的 Skill 形态。
- 要“完整生成 + 导出产品”：参考 **PPTAgent Skill** 或 **Presenton**。
- 共同前提仍然是：**固定画布、显式字体、导出后复核**。开源导出器解决的是“对象映射”，不解决“字体度量”和“内容溢出”。

---

## 12. 实测：用户真实 15 页汇报 HTML 在 5 个项目上的横向对比

第 11 节用的是自造的单页样本。这一节用一份真实的、高密度的中文汇报稿做端到端验证，回答一个更具体的问题：**“先生成 HTML、再把 HTML 转成 PPTX”这条链路，能不能承载 15 页、每页十几个信息块、10 张原生表格的汇报型 deck？**

测试对象：`二部税务管理_汇报_15页连贯版.html`

| 属性 | 值 |
|---|---|
| 页数 | 15 页（14 个普通页 + 1 个封面） |
| 画布 | 每页固定 `1280 × 720`，无 `transform: scale()`，无 `zoom` |
| 文本量 | 约 4,600 个汉字，745 个文本 run |
| 表格 | **10 个原生 `<table class="tbl">`**，分布在 P2/P4/P6/P7/P8/P9/P12/P13/P14/P15 |
| 布局 | flex + grid + absolute，渐变封面，`clip-path` 金字塔，甘特图条 |
| 干扰项 | 顶部导航 `.crumb`、底部 `.ft`、固定 `.nav` 翻页提示 |

> 原文件未做任何修改。所有转换都在 `/tmp/ppt-real/` 下的副本上进行。

### 12.0 复核时发现的决定性事实：MAE 会骗人

v2 复核时，在同一台 macOS 上重做了一遍 §12.1：HTML 用 Playwright 逐页截图，PPTX 用 LibreOffice 转 PDF 再渲染为 1280×720，逐页算 MAE。**数字与初版基本一致**（正文页均值 6.3，全 15 页 7.6）。但把渲染图拼起来看，结果是这样的：

| 观测 | 结果 |
|---|---|
| `dom-to-pptx.pptx` 第 2 页渲染 | 右侧表格**整块中文变成方框**，仅数字与英文可读 |
| 同页 MAE | **6.76/255**，比正文页均值还低 |
| 同一份 HTML 截图 | 中文完全正常 |
| 一张**全白图片** vs 同一页 HTML 的 MAE | **12.19/255**（更差，但只差 1.8 倍） |

也就是说：**一个中文全丢的产物，指标上只比“整页空白”好一点，却与初版所称“肉眼几乎不可分辨”的分数处在同一量级。** MAE 对结构性内容丢失几乎不敏感，因为它衡量的是大面积色块与背景的平均差异，而文字只占页面很小面积。

进一步定位，根因不在导出器：

1. 用同一个 LibreOffice 把纯文本 `中文测试：税务管理` 转 PDF，渲染出来是**一整页空白**（`pdftotext` 能读出文字，说明文字在流里，但缺字形）。
2. 给 LibreOffice 的 profile 目录放入 `NotoSansSC-Regular.otf` 后，**同一份 `dom-to-pptx.pptx` 的中文完全恢复正常**，表格文字、卡片文字、脚注全部可读。

结论：**初版把“渲染环境缺 CJK 字体”误判成了“导出器/字体族缺陷”。** 两者修法完全不同——前者是镜像问题（`apt install fonts-noto-cjk`），后者是导出器能力问题。本仓库的 Sandbox 镜像 `dev/opensandbox-local/Dockerfile.harness-sandbox-browser` 目前只装了 `fonts-liberation` 与 `fonts-noto-color-emoji`，**没有任何 CJK 字体**，所以这条链路一旦搬进 Sandbox，会稳定复现“中文全丢但指标很好看”。

由此得出三个必须写进方案的硬约束：

- **验收不能只看像素**。MAE/RMSE 只能作为“版式是否走样”的辅助信号；必须同时断言“字族可解析”“字符覆盖率”“表格数”，见 §13.8。
- **渲染环境与导出环境必须同镜像、同字体**。预览机、导出 Worker、复核 Worker 三者字体不一致时，任何比对都无效。
- **字体缺失要能被主动检测**，而不是靠人眼看图。检测方法很便宜：`fc-match "Microsoft YaHei"`、渲染一张含汉字的探针页、统计非空白像素；见 §13.5。

### 12.1 结果总表

所有 PPTX 都用 LibreOffice 转 PDF、再统一渲染为 1280×720 PNG，与 Playwright 截取的原始 HTML 逐像素比对。`MAE` = 平均绝对像素误差（0–255，越低越接近原稿）。

> **口径说明（v2 新增）**：下表的 `文本 run` 是 `<a:t>` 元素数量，**不是文本框数量，也不是“可编辑段落数”**。run 越碎，PPT 里改一个字越容易影响相邻数字。实测 `dom-to-pptx.pptx` 为 745 run / 439 个自由文本框（其余在 10 张原生表格内）；`pptagent-html2pptx.pptx` 为 752 run / 415 个自由文本框。**越高不代表越好**，初版把它当正向指标是错的。
>
> 另：表中 MAE 全部来自**同一台机器、同一套已安装字体**。换环境后数值不可比，且如 §12.0 所示，它无法反映文字是否真的可读。

| 项目 | 命令形态 | 耗时 | 体积 | 原生表格 | 文本 run | MAE（全 15 页） | MAE（正文页） | 可编辑 |
|---|---|---|---|---|---|---|---|---|
| **dom-to-pptx** v2.1.2 | `npx dom-to-pptx-exporter` | **5.0s** | 981 KB | **10 / 10** | 745 | **7.88** | **7.06** | 是 |
| **SlideSmith** 1.1.0 | `node bin/cli.mjs` | 9.7s | 979 KB | **10 / 10** | 746 | **8.00** | **7.19** | 是 |
| **PPTAgent / deeppresenter html2pptx** | `node html2pptx_cli.js` | 35.3s | 818 KB | **10 / 10** | 752 | 19.54 | **6.84** | 是 |
| **html-to-pptx**（joker-duzhong） | 浏览器注入 `exportHtmlToPpt()` | **4.8s** | 847 KB | **10 / 10** | 724 | 21.33 | 8.64 | 是 |
| **html-to-editable-pptx**（默认） | `python convert.py` | 122s | 1.27 MB | **0 / 10** | 710 | 16.60 | 17.33 | 是（表格已拆散） |
| **html-to-editable-pptx**（改 1280 视口） | 同上 + 一行 patch | 17s | 993 KB | **0 / 10** | — | 11.55 | — | 是（表格已拆散） |
| **SlideSmith `--screenshots`** | 整页截图基线 | 7.3s | 4.46 MB | 0 | **0** | **3.19** | — | **否** |

关键结论先说：

1. **链路可行，而且已经有 4 个项目能在 5 秒级跑完 15 页高密度中文 deck。**
2. **“原生对象 + 高保真”可以同时拿到**：dom-to-pptx 和 SlideSmith 都是 10/10 原生表格、745 个文本 run、正文页 MAE ≈ 7。
3. **真正的分水岭不是 HTML→PPTX 的坐标映射，而是三件事：字体、表格、文本度量。** 下面逐项拆。

> **v2 必读前提**：本节所有 MAE 都来自**同一台机器**，且该机器缺 CJK 字体时中文会全丢（§12.0）。表中“MAE 低”只说明**版式几何**接近，不说明**内容可读**。请配合 §13.8 的内容级指标一起看。

### 12.2 逐项目分析

#### dom-to-pptx：本次综合最优

```bash
npx dom-to-pptx-exporter deck.html \
  --output 01-dom-to-pptx.pptx --selector .slide \
  --width 13.333 --height 7.5 --bw 1280 --bh 720
```

解包结果：15 页、561 个 `<p:sp>`、10 个 `<a:tbl>`、115 个 `<p:pic>`、745 个 `<a:t>`，所有形状坐标都在画布内（0 个越界）。

- 表格：10 张全部是 PPT 原生表格，列宽、表头底色、隔行底色、`td.r` 红色强调都保留。
- 正文页 MAE 6–8；封面 MAE 19，原因是渐变背景被转成了斜线纹理近似（v2 复算：封面 18.6）。**不要据此说“肉眼不可分辨”**——在缺字体的环境里，同一页中文全丢时 MAE 是 6.8（§12.0）。
- 唯一稳定缺陷：顶部导航 `.crumb span` 在 PPT 里会折成两行。这是**文本度量差**，不是坐标错。
- 字体：`<a:latin>` 与 `<a:ea>` 都写入 `-apple-system`（2,643 次），全部不可移植。**这是本节最需要修的项**，比 MAE 重要得多。

#### SlideSmith：几乎等价于 dom-to-pptx，但画布是 10 英寸

```bash
node bin/cli.mjs deck.html -o 03-slidesmith.pptx
```

SlideSmith 的 `lib/converter.mjs` 明确写了它就是“本地 HTTP server + Playwright + dom-to-pptx bundle + PptxGenJS”的薄封装。所以版式结果与 dom-to-pptx 高度一致（MAE 8.00 vs 7.88）。

但有一个容易忽略的差异：**它输出的 `sldSz` 是 `9144000 × 5143500` EMU，即 10" × 5.625"，不是 13.333" × 7.5"。** 同一段文字的 `sz` 也随之正好是 dom-to-pptx 的 75%（862 → 647）。全屏看比例一样，但：

- 交付给客户后，对方在 13.333" 模板里合并这一页，字号会显得偏小；
- 后续人工改字号时，基准和常规 16:9 模板不一致。

它的价值主要在工程编排（本地 server、资源相对路径、截图兜底、字体检查），而不是转换质量本身。

#### PPTAgent / deeppresenter `html2pptx`：单页质量最好，但对 HTML 有硬约束

这套转换器在 `deeppresenter/html2pptx/html2pptx_cli.js`，不在 PPTAgent 主包里。它**不支持一个 HTML 里放 15 个 `.slide`**，必须一页一个文件：

```bash
node html2pptx_cli.js --html_dir slides/ --output deck.pptx --layout 16:9 --soft
```

直接喂原文件会报 115 条校验错误，核心是两类：

- `DIV element contains unwrapped text ... All text must be wrapped in <p>, <h1>-<h6>, <ul>, or <ol>` —— 它按语义标签提取文本，不认裸 `div` 里的文字；
- `HTML dimensions ... don't match the first slide's layout` —— 它按整页高度算尺寸，不认 `.deck` 纵向排列。

拆成 15 个文件并加 `--soft` 后成功：515 个形状、10 个原生表格、752 个 run，正文页 MAE 6.84，是**五个项目里正文页最高的**。但代价是：

- 封面布局塌了（渐变、绝对定位、`h1` 换行全部失效，MAE 197）；
- 顶部导航因为拆页后容器宽度变化而折行；
- 35 秒，是 dom-to-pptx 的 7 倍。

它的正确用法不是“拿现成 HTML 去转”，而是**按它的契约生成 HTML**：每页独立文件、文本必须包在语义标签里、正文尺寸显式等于 1280×720。这和 PPTAgent 的整体设计一致——它把 HTML 当作受控中间表示，而不是任意网页。

#### html-to-pptx（joker-duzhong）：前端集成最轻，但文本切分有硬伤

浏览器里注入 `pptxgen.bundle.js` + `html-to-pptx.min.js`，调用：

```js
await HtmlToPptx.exportHtmlToPpt('slide', 'base64')
```

4.8 秒出 15 页、827 个形状、10 个原生表格，是**形状数量最多**的（它把大量装饰也转成了独立 shape）。但正文页 MAE 8.64 背后有两个明显问题：

- **按文本节点切 run**：`816` 被拆成 `81` + `6` 两个文本框，`2,647` 被拆成 `2,64` + `7`，换行位置完全不可控（初版附图为 `docs/assets/final-p02.png`，该文件未入库）。
- **渐变背景丢失**：封面直接变白底，`linear-gradient` 没有被降级处理。
- 同样输出 10" 画布，字号是 75%。

适合“简单页面 + 前端一键导出”，不适合高密度汇报稿。

#### html-to-editable-pptx：架构最值得借鉴，但表格是硬缺口

```bash
python convert.py deck.html --out 02-html-to-editable.pptx
```

它的设计是我认为**最接近生产级**的：

1. 把复杂 CSS 装饰（渐变、阴影、滤镜、`clip-path`）**局部截图**成“装饰层”，铺在底层；
2. 文字、形状仍然输出为原生对象，压在装饰层之上；
3. 字体按实际用字 subset 后**嵌入 PPTX**（本次嵌入 4 个 Noto 字体，共约 970 KB）；
4. 自带 preflight、结构化自检、HTML/PPT 双栏视觉 audit 物料。

这正好解释了它的 `ppt/media/image2.png`：那是一张**隐藏了文字的装饰底图**（只剩浅色分隔线和表格横线），不是整页截图。这个“装饰栅格化 + 文字矢量”的混合策略，是解决 `clip-path` 金字塔、渐变封面这类 PPT 原生表达不了的效果的正解。

但它有两个实测硬伤：

- **`<table>` 没有 `add_table` 分支**，10 张表全部被拆成“横线 + 独立文本”，表格语义和列对齐都丢了（MAE 17.33，P14 最差 27.8）。PPT 里再改一行内容，整张表就散了。
- **视口硬编码 1920×1080**（`scripts/measure.py:24`、`scripts/preflight.py:35`）。1280 的 deck 只占视口 2/3，导出的幻灯片内容整体偏小、留白过大。我把这两处改成 1280×720 后重跑，MAE 从 16.60 降到 11.55，说明**它不是不能处理 1280 画布，而是默认假设了 1920 设计稿**。

结论：**架构抄它，表格别用它。**

### 12.3 失败模式归因

把 5 个项目的缺陷归并后，只有 4 类根因，而且都不是“坐标算错了”：

| 失败模式 | 现象 | 根因 | 证据 | 修法 |
|---|---|---|---|---|
| **字体族不可移植** | Windows/WPS 打开中文变方块或回退 | HTML 的 `font-family` 首项是 `-apple-system`，导出器原样写进 `<a:latin>/<a:ea>` | dom-to-pptx 2,643 次、SlideSmith 2,646 次、html-to-pptx 2,571 次；**PPTAgent 为 0 次，写的是 `PingFang SC`**（同样不可移植） | HTML 里显式写 `Microsoft YaHei` / `Noto Sans SC`；或导出后替换 typeface；或像 html-to-editable 一样嵌入字体 |
| **渲染环境缺 CJK 字体** | 导出的 PPTX 打开后中文全是方框，但 XML 里文字完整 | 渲染机（或 LibreOffice / 容器镜像）没有对应字族，回退到无 CJK 字形的字体 | 同一份 `dom-to-pptx.pptx`：默认 LibreOffice 渲染中文全丢；塞入 `NotoSansSC-Regular.otf` 后完全正常；纯文本探针页同样复现 | 镜像预装 `fonts-noto-cjk`；启动时跑字体探针；导出前 `fc-match` 校验。**这是环境问题，不是导出器 bug** |
| **文本度量差导致折行** | 顶部导航、卡片标题、数字在 PPT 里换行 | 浏览器用 1280px 量出的文本框宽度，PPT 用另一套字体度量重排 | `.crumb span` 在 4 个可编辑方案里都折成两行 | 文本框宽度留 5–10% 余量；`wrap` 关掉或 `autoFit` 关闭；导出后逐页复核 |
| **表格语义丢失** | 表格变横线 + 散落文字 | 导出器没有 `<table>` → `add_table()` 分支 | html-to-editable 的 `<a:tbl>` = 0 | 选 dom-to-pptx / SlideSmith / html-to-pptx / PPTAgent；或在 HTML 里把表格改成显式 grid 并接受“非表格” |
| **HTML 契约不匹配** | 整页塌陷、只转出第一页、尺寸报错 | 导出器假设“一页一文件 / 文本在语义标签里 / 固定 viewport” | PPTAgent 对原文件报 115 条错误；html-to-editable 假设 1920 视口 | 先读导出器的输入契约，再决定是改 HTML 还是换工具 |

另外一个容易被忽视的点：**画布物理尺寸**。dom-to-pptx 和 PPTAgent 输出 13.333"，SlideSmith 和 html-to-pptx 输出 10"。同一份内容，后两者的字号数值正好是前两者的 75%。如果这条链路要接进企业模板，必须在导出参数里把画布钉死，否则“看起来一样、字号全错”。

### 12.4 复现方式

所有产物在 `/tmp/ppt-real/`，原始 HTML 未被修改：

```bash
# A. dom-to-pptx
cd /tmp/ppt-smoke
npx dom-to-pptx-exporter /tmp/ppt-real/deck.html \
  --output /tmp/ppt-real/01-dom-to-pptx.pptx --selector .slide \
  --width 13.333 --height 7.5 --bw 1280 --bh 720

# B. SlideSmith
cd /tmp/slidesmith && node bin/cli.mjs /tmp/ppt-real/deck.html -o /tmp/ppt-real/03-slidesmith.pptx

# C. html-to-pptx（浏览器）
node /tmp/ppt-real/export4.js

# D. html-to-editable-pptx
cd /tmp/html-to-editable-pptx
.venv/bin/python convert.py /tmp/ppt-real/deck.html --out /tmp/ppt-real/02-html-to-editable.pptx

# E. PPTAgent / deeppresenter（需先拆成单页 HTML）
node .venv/lib/python3.13/site-packages/deeppresenter/html2pptx/html2pptx_cli.js \
  --html_dir /tmp/ppt-real/pa-slides --output /tmp/ppt-real/05-pptagent.html2pptx.pptx \
  --layout 16:9 --soft
```

初版曾引用对比图 `docs/assets/final-p01.png`（封面）、`final-p02.png`（表格 + 卡片密集页）、`final-p12.png`（甘特图 + 双栏）。

> **v2 修正**：`artifacts/*` 被 `.gitignore:8` 忽略，`docs/assets/` 为空，上面三张图在仓库里并不存在。v2 改为仓库内可执行的复现脚本（§19.2），并以解包统计代替“附图证明”。如果你在本地复现，推荐先跑 §13.5 的字体探针，否则会得到和初版一样好看的 MAE 与一堆方框。

产物（本地复现生成，不随仓库分发）：

| 文件 | 关键指标（解包统计） | 适用 |
|---|---|---|
| `dom-to-pptx.pptx` | 15 页；561 `p:sp`；439 个自由文本框；745 run；**10 张原生表**；字族 `-apple-system` 2,643 次 | 推荐基线 |
| `slidesmith.pptx` | 15 页；424 个自由文本框；746 run；10 张原生表；10" 画布 | 仅作 dom-to-pptx 的编排参考 |
| `html-to-pptx-browser.pptx` | 15 页；591 个自由文本框；724 run；10 张原生表 | 文本切分有缺陷，不推荐 |
| `pptagent-html2pptx.pptx` | 15 页；415 个自由文本框；752 run；10 张原生表；字族 `PingFang SC` 888 次 | 单页质量好，但封面塌陷、须一页一文件 |
| `html-to-editable.pptx` | 15 页；497 个文本框；710 run；**表格 0**；**嵌入 4 个字体**（约 970 KB） | 架构参考，表格不可用 |
| `slidesmith-screenshots-baseline.pptx` | 15 页；run 0；4.46 MB | 整页截图基线，像素最准但不可编辑 |

### 12.5 本节结论

**“先生成 HTML、再转 PPTX”是当前开源生态里最现实的一条可编辑交付链路，但它是“几何可用”，还不是“内容可用”。** 15 页、10 张原生表格、5 秒导出、正文页 MAE 6.3 都能复现；但这些指标在中文全丢的情况下依然成立（§12.0），所以**它们只能证明版式映射，不证明交付质量**。

真正的分水岭是三件事，按性价比排序：

1. **渲染环境有正确 CJK 字体**（一行 `apt install fonts-noto-cjk` + 一个探针），否则后续所有验收都不可信。
2. **生成 HTML 时遵守 PPT 的物理约束**：固定画布、显式可移植字族、原生表格、文本留余量。
3. **导出后做内容级验收**：字族、字符覆盖率、表格数、页数，像素 diff 只作辅助。

Kimi 的 AI PPT 看起来“更聪明”，很大一部分不是模型更强，而是它从一开始就没让模型自由写任意网页——它生成的是受约束的版式对象，HTML/PPTX 只是两种输出格式。

落到本项目：先做 **字体探针 + HTML 规范 + dom-to-pptx 导出 + 内容级验收**这四件事；回渲染 diff 放 P1，因为它的前提（同字体环境）比它本身更难保证。装饰复杂到 PPT 表达不了时，再引入 html-to-editable 的“装饰截图 + 文字矢量”混合层。

---

## 13. 落地方案（本仓库）

### 13.1 目标与非目标

**目标（P0）**

- 支持“汇报型”PPT：单页信息密度高、含原生表格、多栏、时间线、甘特图等版式。
- 导出物**可编辑**：文字是文本框、表格是原生表格、纯色块是形状，WPS / PowerPoint 可直接改。
- 预览与导出使用**同一份 HTML**、**同一套字体**，避免漂移。注意：HTML 是 `deck-plan` 的投影，不是真相源。
- 导出失败可重试、可观测，不阻塞对话主链路；**失败时必须有降级出口**（HTML/PDF），不能让用户空手而归。

**单一真相源（v2 新增，P0 必须定死）**

`deck-plan.json` 是唯一真相源；HTML 是它的渲染投影，PPTX 是它的导出投影。

```
deck-plan.json  ──render──►  slide HTML  ──dom-to-pptx──►  PPTX
      ▲                                                     │
      └──────────── 修改只在这里发生（P0：对话改 plan）◄──────┘
```

为什么必须在 P0 就定，而不是 P2 再补：

- 初版让“对话改 HTML”，同时又在 §9.3 认定“修改可寻址”是护城河。两者不能同时成立：HTML 一旦是真相源，P2 引入元素树时，已有版本链、批注、diff 全部要迁移。
- 定 `deck-plan.json` 为真相源后，**元素级编辑在 P0 是“结构上可行、UI 上未实现”**，P1 加编辑器时不需要改数据模型。
- 代价是 P0 要多写一层 render（plan → HTML）。这层成本很低（模板字符串），远低于将来的迁移成本。

**非目标（明确写死，避免预期错位）**

- **P0/P1 不提供 Kimi 级在线编辑**：不做元素拖拽、不做批注寻址、不做动画编辑。修改通过对话改 plan 实现。
- **P0/P1 不提供自由布局**：视觉上限由 6–9 个内置版式决定，低于 Kimi 是预期内的。自由布局是独立产品线，不进本 roadmap。
- 不做通用 HTML → PPTX 转换器（任意网页都能转）。
- 不做“像素级完全一致”的承诺；接受字体度量与渐变带来的小幅差异。
- 第一阶段不支持 PPTX → HTML 反向编辑、母版继承、SmartArt。
- 不让 Skill 扩大 Sandbox 或 Tool 权限（沿用 C6 边界）。

### 13.2 现状匹配

本仓库已经具备做这件事的关键基础设施：

- **Agent Loop + Tool 边界**：模型决定工具调用，Runtime 维护执行边界（`docs/25-model-led-tool-boundary.md`）。
- **Sandbox（C3）**：可执行 Python/Node、安装依赖、跑 LibreOffice/Puppeteer。**但目前镜像没有 CJK 字体**（`dev/opensandbox-local/Dockerfile.harness-sandbox-browser` 只装了 `fonts-liberation` / `fonts-noto-color-emoji`），这是 P0 的第一个待补项，不是既得能力。
- **Session Browser（C3-D）**：可在会话内打开 Chromium，做截图与 DOM 测量。
- **Artifact 目录 + readiness**：可存放 `slides/`、`assets/`、`qa/`、`answer.pptx`。
- **Skills（C6）**：可以把“做 PPT”封装成 skill，而不是把全部逻辑塞进系统 prompt。

因此**不需要从零造一个 PPT 产品**，而是做一个“PPT 生成 Skill + 一套质量门禁 + 一个导出工具”。但要清醒：基础设施“能跑命令”不等于“能产出中文 PPT”——字体这一条必须单独补。

### 13.3 总链路

```text
用户输入 / 上传材料
  → ppt_plan：生成 deck-plan.json（真相源：版式 + 槽位内容 + 容量假设）
  → render：plan → 每页 .slide HTML（1280×720，模板渲染，模型不写 CSS）
  → Preflight：字体探针 → 结构/CSS/容量 → 渲染级溢出检查
  → Workbench 预览（同一镜像、同一字体）
  → 用户点「导出 PPT」→ 异步任务调 dom-to-pptx → 临时 PPTX
  → 内容级验收：字族可解析 / 字符覆盖率 / 表格数 / 页数 / 画布
  → 通过 → 交付；不通过 → 重试一次 → 仍失败 → 降级为 HTML/PDF + 明示原因
```

这条链路的稳定性**由生成侧约束与渲染环境共同决定，不是由转换器单独决定**。转换器只负责把已经成立的 DOM 忠实映射成 PPT 对象；它无法替模型修正溢出，也无法替我们安装字体。

因此方案的核心是四件事（顺序即优先级）：

1. **环境可信**：镜像内预装 CJK 字体，并在每次导出前跑字体探针。**没有这一条，后面三条都会给出假绿。**
2. **骨架约束**：模型只填槽位，不自由写 CSS；版式容量写进 `layout.json`。
3. **Preflight 门禁**：静态检查 + 一次真实渲染的溢出检查，不合格就回改 plan。
4. **导出后验收**：以**内容指标**为准（字符覆盖率、字族、表格数），像素 diff 只作辅助；不达标重试或降级。

职责分工：

- **生成侧**采用 PPTAgent 的思路：先定版式/容量，再让模型填内容；HTML 只是渲染载体；
- **导出侧**采用 dom-to-pptx 的对象映射；
- **兜底层**分两级：①导出失败 → 返回 HTML/PDF；②装饰复杂到 PPT 表达不了 → 参考 html-to-editable 的“装饰截图 + 文字矢量”混合渲染（P2）；
- **验收侧**以内容级断言为主。回渲染 diff 保留，但前提是“复核环境与导出环境同字体”，因此放在 P1 而不是 P0。

### 13.4 生成阶段：骨架与版式库

Agent 通过 `ai-ppt-html` Skill 产出 **`deck-plan.json`**，再由**确定性渲染器**把 plan 转成 HTML。模型只填槽位，不写 CSS、不写任意 HTML。

> **v2 关键改动**：初版同时存在“模型只填槽位”（本节）与“`ppt_write_slide` 让模型自由写单页 HTML”（§13.11）两种范式，没有说明谁是 P0 主线。v2 明确：**槽位填充是唯一主线**，自由写 HTML 仅作为离线实验，不进入产品路径。

版式库（P0 六个，P1 扩到 10–12）：

| 版式 | 用途 | 关键结构 |
|---|---|---|
| `cover` | 封面 | 标题 + 副标题 + 汇报人/日期 |
| `agenda` | 目录 | 3–6 条编号条目 |
| `section` | 章节页 | 大号章节号 + 标题 |
| `three-col` | 三点结论 | 三等分卡片，每卡标题 + 2–3 行 |
| `table` | 数据页 | 原生 `<table>` + 表头强调 |
| `timeline` | 计划/里程碑 | 横向时间轴 + 节点说明 |
| `gantt` | 排期 | 以 `<table>` 或绝对定位条形表达 |
| `compare` | 对比 | 双栏 + 中间分隔 |
| `conclusion` | 结论/下一步 | 编号结论 + 行动项 |

模型只负责：选版式、填标题、填要点、填表格数据、选择强调色。CSS 由骨架提供，不进入模型输出。

**每套模板应产出 `layout.json`**：元素 id、类型、box、capacity、styleRef、decorative。这样版式容量在生成阶段就是已知的，而不是导出后才发现溢出。

```ts
// layout.json —— 版式契约（与 deck-plan.json 分离：前者是模板，后者是内容）
type Layout = {
  id: string;                       // "table" / "three-col" ...
  canvas: { width: 1280; height: 720 };
  slots: Array<{
    id: string;                     // 稳定 id，导出后映射回 deck-plan 的定位锚点
    role: "title" | "body" | "metric" | "table" | "caption";
    box: { x: number; y: number; w: number; h: number };  // 1280×720 坐标系
    capacity: { minChars: number; maxChars: number; maxLines: number };
    styleRef: string;               // 指向 StyleSpec token，不内联颜色/字号
    decorative: boolean;
  }>;
};
```

**`capacity` 必须由实测得出，而不是拍脑袋。** 做法：拿骨架页填入“汉字 × N”的探针文本，二分找到不溢出的最大 N，写入 `maxChars`；同时记录 `maxLines`。这样 Preflight 的容量检查才有意义，也不会出现“schema 说 55 字、实际 40 字就折行”的错配。

### 13.5 Preflight 门禁

Preflight 分两段：**F0 环境探针（每次导出前，5 秒内）** 与 **F1 产物检查**。

> **v2 关键改动**：初版强调“纯静态检查，不启动浏览器”，但其中最重要的“溢出”却是“预估文字量 / 容器容量”。在 flex/grid 下字符数估算判不出真实溢出——门禁在最需要它的地方最弱。v2 把溢出改为**一次真实渲染**的几何检查，并把字体探针提到最前。

**F0：环境探针（必须存在，失败即拒绝导出，不重试）**

| 探针 | 方法 | 判定 |
|---|---|---|
| 字族可解析 | `fc-match "<family>"` 返回的字族名与请求一致 | 不一致 → `env_font_missing` |
| 字形可渲染 | 生成一页含“中文测试：税务管理 0-9”的探针 PPTX/HTML，渲染后统计非空白像素占比 | 低于 0.5% → `env_font_broken` |
| 字体清单写入报告 | 把 `fc-list :lang=zh` 与镜像 digest 记入 `qa/env.json` | 缺失 → 拒绝 |

这一步是 §12.0 的直接产物。**它便宜（< 5s）、确定、可断言**，却能挡住整条链路上最隐蔽的假绿。

**F1：产物检查**

| 检查项 | 规则 | 级别 | 失败处理 |
|---|---|---|---|
| 页数 | `.slide` 数量 = `deck-plan.slides.length` | error | 重新渲染 |
| 画布 | 每个 `.slide` 为 `1280×720`，`overflow: hidden` | error | 重新渲染 |
| 字体 | `font-family` 命中 `-apple-system`、`system-ui`、`BlinkMacSystemFont`、`PingFang SC` 即失败（前三者不可移植，后者仅 macOS 有） | error | 回改 `StyleSpec` |
| 表格 | 数据必须用 `<table>`，禁止 `div` 拼表格 | error | 回改 plan |
| 禁用 CSS | `clip-path`、`filter`、`backdrop-filter`、`mix-blend-mode`、`mask`、`position: fixed` | error | 换版式或降级 |
| 渐变 | 仅允许 `linear-gradient`；`radial-gradient` / `conic-gradient` | warn | 记录 |
| 字号 | 正文 ≥ 10.5px（1280 画布）；标题/正文字号比在 `StyleSpec` 允许范围内 | warn | 记录 |
| **溢出（渲染级）** | 用 Playwright 渲染每页，对每个文本容器断言 `scrollHeight <= clientHeight + 2` 且 `scrollWidth <= clientWidth + 2`；同时断言子元素包围盒不越出 `.slide` | error | 回改 plan，或降低字号档 |
| 图片 | 绝对路径或可访问 URL；禁止 `data:` 大图（> 256KB） | warn | 记录 |

**渲染级溢出检查的成本与收益**：以 15 页实测，Playwright 逐页测量约 3–5 秒（复用同一 browser 实例、`document.fonts.ready` 后测量），与一次导出的 5 秒同量级。**它换来的是“生成阶段就能发现溢出”，而不是等用户打开 PPT 才发现。**

Skill 是提示，lint 是门禁。**只有 F0 + F1 全绿，HTML 才允许进入导出。**

### 13.6 预览与修改

- 预览直接使用渲染出的 HTML，Workbench 以 iframe 展示（安全策略见 [37-c5-workbench-ui-and-preview.md §5.3](./37-c5-workbench-ui-and-preview.md)）。
- **修改走“对话改 `deck-plan.json`”**，然后重新渲染 HTML。模型不直接编辑 HTML 字符串——这与 §13.4 的槽位契约一致，也让修改是**结构化**的（改第 3 页第 2 个 slot 的 45 字，而不是在一段 HTML 里找字符串）。
- **版本对应关系以 plan 为准**：`deck-plan vN` → `html vN`（派生）→ `pptx vN`（派生）。派生物不单独升版，避免出现“HTML v7 对应 PPTX v5”的漂移。
- P0 **不做**元素拖拽、批注定位、富文本编辑。用户想改，就用自然语言说清楚“第几页、哪个位置、改成什么”。这条路不优雅，但它与 P0 的数据模型一致，且不会制造二次迁移。

**为什么不做“对话改 HTML”（即便它实现更简单）**：一旦 HTML 是真相源，任何“改一个字”的请求都会让整页哈希变化，`ReviewRecord` 全部失效，回滚粒度也变成整页。用 plan 做真相源，改动粒度天然是 slot 级，这正好是 P1 引入元素编辑器时需要的粒度。

### 13.7 导出阶段

用户点击导出 → 创建导出任务 → 返回 `taskId` → 前端轮询或订阅事件 → 完成后给出下载。

```ts
import { exportHtmlToPptx } from 'dom-to-pptx/node';

const buffer = await exportHtmlToPptx(htmlPathOrUrl, {
  selector: '.slide',
  injectBundle: true,
  browserWidth: 1280,
  browserHeight: 720,
  pptxOptions: {
    width: 13.333,
    height: 7.5,
    includePseudoElements: true,
  },
});
```

要点：

- `width` / `height` 单位是**英寸**。1280×720 在 96 PPI 下正好是 `13.333 × 7.5`，与常见 16:9 一致。
- `browserWidth` / `browserHeight` 必须与 HTML 画布一致，否则会触发缩放。
- `injectBundle: true` 让导出器自己注入 bundle，HTML 不需要内联库。
- `exportHtmlToPptx` 内部会启动 headless Chrome、加载页面、执行导出、返回 `Buffer`，调用方不需要关心浏览器生命周期。
- CLI 路径（备选）：`npx dom-to-pptx export input.html -o out.pptx --inject --width 13.333 --height 7.5`。

默认值注意：CLI 未显式传尺寸时是 `10 × 5.625`，viewport 按 `slideWidth × 192` 计算；本方案必须显式传参。

**内部执行顺序**（源码 `dist/dom-to-pptx-node.mjs:194`、`dist/dom-to-pptx.bundle.js:59821`）：

1. Puppeteer 启动系统 Chrome，按 `browserWidth/Height` 设 viewport，`goto` 本地文件或 URL，等待 `networkidle0`。
2. 页面没有 `window.domToPptx` 时注入本地 bundle。
3. 在页面上下文里 `document.querySelectorAll('.slide')`，调用 `window.domToPptx.exportToPptx(targets, { skipDownload: true })`。
4. `exportToPptx` 建 `PptxGenJS` 实例并定义版式；逐页 `processSlide()` 遍历 DOM。
5. `processSlide` 用 `getBoundingClientRect()` 和 `getComputedStyle()` 采集几何与样式，计算 `scale = min(PPTX宽/内容宽, PPTX高/内容高)`，等比缩放并居中。
6. 元素按 DOM 顺序 + `z-index` 排序后，分别落到 `slide.addText / addShape / addImage / addTable`。
7. `pptx.write()` 得到 zip，重压缩并清理悬空 Override，可选嵌入字体，最终返回 `Blob`。

也就是说，**它不是截图，也不是自己拼 OOXML**：几何来自浏览器真实布局，写入 PPT 的工作交给 PptxGenJS。

### 13.8 导出后验收

**v2 变更：从“像素优先”改为“内容优先”，像素降级为辅助信号。** 原因见 §12.0：中文全丢时 MAE 仍可低至 6.8，而全白页是 12.2，**好页反而只比空白页好 1.8 倍**——这个指标无法区分“可交付”和“不可读”。

| # | 检查 | 方法 | 阈值 | 级别 |
|---|---|---|---|---|
| 1 | PPTX 可打开 | 解压校验 `ppt/presentation.xml` 与 `sldSz` | 必须通过 | error |
| 2 | 页数 | 解析 slide 数 | = `deck-plan.slides.length` | error |
| 3 | 画布 | `sldSz` | `12192000 × 6858000` EMU（13.333″×7.5″） | error |
| 4 | **字族可解析** | 提取所有 `<a:latin>/<a:ea>` typeface，逐个 `fc-match`；命中黑名单（`-apple-system` / `system-ui` / `PingFang SC`）即失败 | 0 个黑名单字族；所有字族在导出镜像中存在 | error |
| 5 | **汉字覆盖率** | 取 HTML 可见文本的汉字多重集，与 PPTX `<a:t>` 的汉字多重集求交 | ≥ 99%（本次实测 dom-to-pptx / PPTAgent 均为 **100%**；截图型基线为 **0%**） | error |
| 6 | 表格 | 统计 `<a:tbl>` | = HTML `<table>` 数量 | error |
| 7 | 文本完整性 | `<a:t>` 总字符数 / HTML 纯文本字符数 | ≥ 95%（低于初版的 90%，因为 §12.0 证明 90% 太松） | warn |
| 8 | 编辑性 | 自由文本框数、`<p:pic>` 数、`<p:grpSp>` 数 | 图片占比 > 30% 告警；`grpSp=0` 记录 | warn |
| 9 | **渲染可读性**（P1） | 在**已装 CJK 字体**的复核镜像内转 PDF→PNG，做“文字区域非空白检测 + 与 HTML 的 MAE” | MAE ≤ 12 且文字区域覆盖率 ≥ 95% | warn |
| 10 | 抽检 | 封面 / 最密页 / 表格页渲染成 PNG，人工并排比对 | — | 人工 |

**为什么第 5 条是“汉字多重集覆盖率”而不是“字符数比值”**：字符数比值对“数字正确、汉字全丢”完全不敏感（本次 745 run 里 20 个是纯数字 run，丢弃全部汉字后字符数仍可能接近）。而逐汉字计数的覆盖率能直接抓到“整页方框”。

**为什么第 9 条放 P1**：P0 没有稳定的“已装字体”复核镜像，做出来的 diff 只会像 §12.0 一样骗人。等镜像契约落地（§13.9）之后再上。

**降级策略（v2 新增，P0 必须有）**

| 情形 | 行为 |
|---|---|
| F0 探针失败 | 直接拒绝导出，返回 `env_font_missing`；提示“导出服务暂不可用”，**不要**产出坏文件 |
| 导出库报错 | 重试 1 次；仍失败 → 返回 HTML 预览链接 + 明确说明 |
| 第 1–6 条 error | 重试 1 次；仍失败 → 返回 HTML/PDF，并附失败指标 |
| 仅 warn 项 | 正常交付，但在结果里标注“已导出，存在 N 项告警” |

**没有降级出口的硬门禁是坏设计**：PPT 的价值发生在最后一公里，一次“什么都没有”比“拿到 HTML 但知道原因”伤害更大。

### 13.9 系统设计

| 组件 | 职责 | 依赖 |
|---|---|---|
| `ai-ppt-html` Skill | 版式库（`layout.json`）、`deck-plan` schema、生成规范 | Skills Registry |
| Plan Renderer | `deck-plan` + `layout` → HTML，确定性、无模型 | 模板字符串 |
| Preflight | F0 环境探针 + F1 静态/渲染级检查 | Playwright + `fc-match` |
| Artifact 存储 | 保存 `deck-plan` 版本、HTML/PPTX 派生物 | 现有 Artifact 能力 |
| 导出 Worker | 执行 `exportHtmlToPptx`，重试与超时控制 | Chrome / Puppeteer |
| 任务队列 | 串行/限流，避免 Chrome 抢占资源 | 现有任务机制或独立队列 |
| 结果校验器 | 解析 PPTX，产出 `ExportReport` | `scripts/ppt-unpack-check.py`（零依赖）或 JSZip |

**运行环境（v2 收紧为镜像契约）**

- 需要可执行 Chrome / Chromium；容器镜像内预装，避免运行时下载。
- 单任务内存预估 300–800MB，建议 worker 并发度 2–4，按机器规格调整。
- 超时 60s，重试 1 次；重试前清理临时文件。
- **字体是镜像的一部分，不是部署说明里的一句“请安装”**：预览容器、导出 Worker、复核 Worker 使用**同一镜像 digest**，且该镜像必须：
  - `apt-get install fonts-noto-cjk`（提供 `Noto Sans SC` / `Noto Serif SC`）；
  - 可选：`fonts-wqy-zenhei` 作为兜底；
  - 在构建期跑一次字体探针（同 §13.5 F0），构建失败即镜像失败。
- 现状对照：本仓库 `dev/opensandbox-local/Dockerfile.harness-sandbox-browser` 只装了 `fonts-liberation` 与 `fonts-noto-color-emoji`，**没有 CJK 字体**。直接复用会 100% 复现 §12.0 的“中文全丢 + 指标好看”。这是 P0 的第一个改动点。
- 字体清单与镜像 digest 写入 `qa/env.json`，作为交付报告的一部分——出问题时能一眼看出“是谁的字体”。

**状态与错误**

```text
queued → running → succeeded
                 ↘ failed → (retry) → failed_permanent
```

- 失败原因分三类：`render_failed`（页面加载/浏览器）、`export_failed`（库报错）、`validation_failed`（指标不达标）。
- 三类都要把中间产物（HTML 快照、控制台日志、失败页截图）落盘，便于排查。
- 用户可见文案不暴露堆栈，只给“导出失败，已重试/请联系支持”。

**安全**

- 导出前对 HTML 做白名单过滤：禁止 `<script>`、外链脚本、`javascript:` URL。
- headless Chrome 以 `--no-sandbox` 运行时必须处于隔离容器内，不与主 API 同进程。
- 远程图片允许，但需限制域名与体积；失败时降级为占位，不阻塞整页。

### 13.10 最小数据结构

```ts
// deck-plan.json
type DeckPlan = {
  version: 1;
  meta: { title; audience; language; aspectRatio: "16:9"; styleId };
  slides: Array<{
    id: string;
    kind: "cover" | "toc" | "section" | "content" | "closing";
    claim: string;              // 这一页要让观众记住的一句话
    layoutId: string;
    content: Record<string, string | string[] | ChartData | TableData>;
    evidence?: Array<{ text; sourceUrl? }>;
    visualIntent?: "none" | "image" | "chart" | "diagram" | "quote";
  }>;
};

type ReviewRecord = {
  slideId: string;
  inputHash: string;           // deck-plan 该页 + layout.json + StyleSpec 的哈希
  envHash: string;             // 镜像 digest + 字体清单哈希（v2 新增）
  verdict: "pass" | "minor" | "major" | "blocked";
  issues: Array<{ code; message; bbox? }>;
  reviewedAt: string;
};
```

**两个哈希缺一不可**：`inputHash` 防止“拿旧检查结果背书新内容”；`envHash` 防止“在 A 机器上检查通过、在 B 机器上导出”。初版只有前者，正好漏掉了 §12.0 那类问题。

```ts
// ExportReport —— 交付时一并返回，便于追责与复现
type ExportReport = {
  planVersion: number;
  env: { imageDigest: string; fonts: string[]; chromeVersion: string };
  checks: Array<{ code: string; level: "error" | "warn"; passed: boolean; value?: number; threshold?: number }>;
  degrade?: "none" | "html_only" | "pdf_only";
};
```

### 13.11 工具边界

不要把“生成 PPT”做成一个巨型 tool。按职责拆：

| Tool | 职责 | 是否允许模型自由发挥 |
|------|------|----------------------|
| `ppt_outline` | 生成/修改大纲 | 是（结构化输出） |
| `ppt_plan` | 选版式、填 slot、改 plan | 是（受 `layout.json` 约束） |
| `ppt_render` | plan → HTML + 截图 | 否（确定性） |
| `ppt_review` | 规则检查（可选视觉模型辅助） | 否（确定性 + 可选视觉） |
| `ppt_build` | HTML → PPTX | 否（确定性） |
| `ppt_verify` | 内容级验收 +（P1）回渲染 | 否（确定性） |

**v2 删除了 `ppt_write_slide`。** 初版允许模型“自由写单页 HTML”，与 §13.4 的“模型只填槽位、CSS 由骨架提供”直接冲突，会导致两套实现、两套评测、两套失败模式。v2 只保留一条路径：**plan → 确定性渲染 → 导出**。如果将来要做自由布局，那是另一条产品线（自己的 schema、自己的验收），不应以“多一个工具”的方式混进同一条链路。

这样模型只在“创作”环节自由，在“验证/构建”环节完全受控，符合本仓库“Model-led Tool Boundary”的设计哲学。

### 13.12 分期

**P0：跑通闭环（最小可用，目标 2–3 人周）**

> v2 给 P0 加了工期与止损条件。没有工期的“分期”不是计划，是愿望清单。

- **镜像**：给 Sandbox 镜像加 `fonts-noto-cjk`，构建期跑字体探针（半天）。
- **数据模型**：`deck-plan.json` + `layout.json` + `StyleSpec` 三件套，确定性渲染器（2–3 天）。
- **版式**：固定 6 个版式（cover / agenda / section / table / three-col / conclusion），每个附 `capacity` 实测值（3–4 天）。
- **Preflight**：F0 环境探针 + F1 的页数/画布/字族/表格/渲染级溢出（2 天）。
- **导出**：`dom-to-pptx` 同步导出（单任务，不做队列）+ 60s 超时 + 1 次重试（1–2 天）。
- **验收**：§13.8 第 1–6 条脚本化，输出 `ExportReport`（1–2 天）。
- **降级**：导出失败返回 HTML/PDF（0.5 天，**不可砍**）。

**P0 完成定义（Definition of Done）**

1. 给定一份 10 页汇报稿，能从 plan 渲染出 HTML、导出可编辑 PPTX。
2. PPTX 在**装了 `fonts-noto-cjk` 的干净容器**里，中文 100% 可读；汉字覆盖率 ≥ 99%。
3. 关掉字体后，系统**拒绝导出**并给出 `env_font_missing`，而不是产出坏文件。
4. 人为制造一个溢出页，Preflight 能定位到具体 slide 与容器。
5. 导出失败场景下，用户能拿到 HTML/PDF + 明确原因。

**P0 止损条件（v2 新增）**

- 如果镜像内字体探针无法稳定通过（例如基础镜像不含可用 CJK 字形、或 `fc-match` 行为不可控），**停止 P0，先解决环境**，不要往下做版式。
- 如果 §13.8 第 4–5 条在 6 个版式上无法稳定 ≥ 99%，说明导出器的字体处理不可控，**改用“嵌入字体”路线（html-to-editable 思路）或改用 PDF 交付**，不要硬上。

**P1：产品化**

- 版式扩展到 10–12 个；每套 3–5 个变体。
- 导出改为异步任务 + 重试 + 中间产物落盘。
- Workbench 版本链：`deck-plan vN` → `html vN` → `pptx vN`（派生，不单独升版）。
- 支持上传 PPTX 做版式认证（参考 Presenton Template V2）。
- **复核 Worker 独立镜像**（含 CJK 字体与 LibreOffice），启用 §13.8 第 9 条回渲染 diff。
- 元素级编辑器（P1 末）：基于 `deck-plan` + `layout.json` 的 slot 编辑，**不引入第二套数据模型**。

**P2：质量提升**

- 版式容量模型：按槽位实测容量，生成时即约束（P0 已做，这里做自适应字号档）。
- 复杂装饰的混合渲染层（参考 html-to-editable 思路），仅在必要时启用。
- 批注寻址：`{ slideId, slotId, comment }` → 局部修改；版本 diff 与回退。
- **自由布局**：单独立项，不复用本方案的数据模型。如果真要做，按 Presenton Smart 的“受约束代码生成 + 几何检查 + 8 次重试”重做一遍，而不是在本方案上加参数。

### 13.13 评测建议

仓库当前明确“评估体系暂缓”，但如果要做 PPT，建议先建一个**最小人工/半自动评测集**，否则无法判断迭代是否有效：

- 20 个真实任务（行业研究、工作汇报、课程、路演、长文转化）。
- 每份检查：页数、结构完整性、每页主张、事实/引用、排版事故（溢出/重叠/缺图）、导出可编辑性、修改成本。
- 参考 PPTEval 三维：Content / Design / Coherence（PPTAgent 论文），但不要只做 LLM 打分，排版事故要用确定性检查。

**v2 新增：评测必须分“内容层”与“交付层”两套指标，且交付层优先自动化。**

| 层 | 指标 | 方式 | 通过线 |
|---|---|---|---|
| 交付 | 汉字覆盖率、字族黑名单、表格数、页数、画布 | 脚本（§13.8 1–6） | 100% 必须通过 |
| 交付 | 溢出/重叠（渲染级） | 脚本（§13.5 F1） | 0 处 |
| 内容 | 每页主张是否成立 | 人工 / LLM 辅助 | 抽检 20 页 |
| 内容 | 事实与引用 | 人工 / 检索核对 | 抽检 |
| 体验 | 修改成本（改一个数字需要几次交互） | 人工计时 | P0 不评，P1 起评 |

**不要用“整体好不好看”作为唯一评测维度**：那会把“中文全丢但配色对”判为高分，正是 §12.0 的陷阱。

### 13.14 成本模型与止损出口

**初版没有成本模型，这是落地方案最大的缺口。** 下面是基于本仓库现状的粗略估算（人周，含联调，不含版式设计创意）。

| 工作项 | P0 | P1 | 说明 |
|---|---|---|---|
| 镜像 + 字体 + 探针 | 0.5 | 0.5 | 复核镜像独立，需 LibreOffice |
| 数据模型 + 渲染器 | 2.5 | 0.5 | plan/layout/StyleSpec |
| 版式库 | 3.0 | 6.0 | 6 个 → 12 个，含容量实测 |
| Preflight | 2.0 | 1.5 | 静态 + 渲染级 |
| 导出 Worker | 1.5 | 3.0 | 同步 → 异步 + 队列 |
| 验收脚本 | 1.5 | 2.0 | 内容级 → 回渲染 diff |
| 降级与可观测 | 0.5 | 1.0 | 中间产物落盘 |
| **合计** | **≈11.5** | **≈14.5** | 2–3 人并行约 5–7 周 |

**需求前提（初版默认成立、实际未论证）**

PPT 相对现有 C2 交付链路的独特价值只有一个：**接收方要在 PowerPoint/WPS 里继续编辑**。如果真实需求是“发给领导看”，PDF 更稳、更保真、零字体风险；如果要“内容能改”，HTML + 版本链已经能改。**PPT 是为“别人的编辑习惯”付费。**

因此 P0 之前应做一个廉价验证（1 周内可完成）：

- 找 5–8 位真实汇报者，问两个问题：①上一份汇报的 PPT 是否被接收方修改过？②如果只能拿到 PDF 或网页，是否影响交付？
- 若“需要对方继续编辑”的比例低于 30%，或用户对 PDF 的接受度与 PPT 无显著差异 → **不进入 P1，停在“HTML + PDF”**。

**止损条件（统一入口）**

| 触发 | 动作 |
|---|---|
| 字体探针在目标镜像不稳定 | 停，先解决环境（不写版式代码） |
| 6 个版式上汉字覆盖率 < 99% | 改走“字体嵌入”路线，或降级为 PDF 交付 |
| 需求验证未通过 | 停在 HTML + PDF，不做 PPTX |
| P1 工期超估 50% 且无边角收敛 | 砍版式数量，保交付质量 |

**给方案一个可以失败的出口，比给它一个漂亮的路线图更重要。**

### 13.14 不建议做的事

- **不要**一上来做“任意 HTML → 完美 PPTX”。字体度量问题会吞掉大量时间；先用固定字体 + 固定画布 + 导出后复核。
- **不要**在没装 CJK 字体的镜像里做“回渲染比对”。它会给出一张漂亮的 diff 和一堆方框（§12.0）。
- **不要**用 MAE/RMSE 作为交付门禁的唯一指标。它区分不了“轻微色差”和“整段文字丢失”。
- **不要**把“对话改 HTML”当成最终形态。HTML 是投影，plan 才是真相源。
- **不要**让模型直接写 python-pptx 代码。用受限 API 或 HTML DSL，错误可反馈、可重试。
- **不要**把整页当图片导出作为默认。可以作为“保真模式”兜底，但不能是主路径。
- **不要**在没有 review 门禁的情况下让 Agent 自动交付。它会自信地交付一份有重叠的 PPT。

---

## 14. HTML 规范（生成侧契约）

这一节是 Skill 与 lint 的共同依据。

### 14.1 文档结构

```html
<section class="slide" data-layout="table">
  <header class="slide-header">
    <h1>二、重点任务推进情况</h1>
    <span class="slide-index">03</span>
  </header>
  <main class="slide-body">
    <!-- 版式内容 -->
  </main>
  <footer class="slide-footer">国家税务总局 · 2026</footer>
</section>
```

- 一页一个 `<section class="slide">`，不要嵌套 `.slide`。
- 固定 `width: 1280px; height: 720px; overflow: hidden; position: relative`。
- 不使用 `position: fixed`，不使用视口单位（`vw` / `vh`）。

### 14.2 字体与排版

- `font-family` 必须显式声明，**且第一个字族必须是导出镜像里真实存在的**。推荐 `"Noto Sans SC", "Microsoft YaHei", sans-serif`；两者都是跨平台可获得的字族名，前者还能随镜像分发。
- 禁止 `-apple-system`、`system-ui`、`BlinkMacSystemFont`、`PingFang SC`。前四个在不同平台解析不同，最后一个只有 macOS 有。
- **镜像里装什么，HTML 就写什么**。写 `Microsoft YaHei` 但镜像里只有 `Noto Sans SC`，浏览器会回退到 `sans-serif`，度量立刻漂移——而这种漂移在截图对比里看不出来（两边都用同一套 fallback）。
- 字号建议：页面标题 26–32px，小节标题 18–22px，正文 12–16px，表格 11–13px，脚注 ≥ 10.5px。
- 行高 1.4–1.6；不要用负 `letter-spacing` 压缩。
- 文本容器保留 10% 余量，避免 PowerPoint 字体度量导致折行。
- **数字与单位必须在同一个文本节点内**（如 `<span>816 万</span>`，不要 `<span>816</span><span>万</span>`）。导出器按文本节点切 run，拆开后会变成两个文本框，改数字时单位会掉行。

### 14.3 表格

- 必须使用原生 `<table>` + `<thead>` / `<tbody>` / `<tr>` / `<th>` / `<td>`。
- 列宽用 `colgroup` + `width` 或首行单元格宽度表达，不要依赖 `flex` 模拟。
- 单元格内只放行内元素；避免在单元格里再套复杂布局。
- 合并单元格用 `colspan` / `rowspan`，导出器支持。
- 表头底色用纯色，避免渐变；边框用 `border`，不要用 `box-shadow` 模拟。

### 14.4 形状与装饰

- 纯色块、圆角矩形、圆形：可原生导出为形状。
- 渐变：仅 `linear-gradient` 可转换为 SVG 图片；其余渐变降级为图片或近似纯色。
- 阴影：可转换为原生阴影，但多层阴影只取第一层。
- `clip-path`、`mask`、`filter`、`backdrop-filter`、`mix-blend-mode`：禁止。
- 图标优先用内联 SVG；字体图标会走 html2canvas 截图，不可编辑。
- 装饰性背景尽量用简单形状，不要用复杂 CSS 拼图。

### 14.5 图片

- 使用绝对 URL 或随包资源，路径必须可被 headless Chrome 访问。
- 图标优先内联 SVG；**不要用字体图标**（会走 html2canvas 截图，不可编辑，且缺字时直接消失）。
- 显式设置 `width` / `height`，避免加载后布局跳动。
- 圆角图片支持；`object-fit` 支持 `cover` / `contain`。
- 避免超大图（> 4MB），导出时会被 base64 嵌入，显著增大文件。

---

## 15. 已知限制与选型

### 15.1 已知限制

| 限制 | 影响 | 缓解 |
|---|---|---|
| 字体度量差异 | 文本可能多折一行、轻微错位 | 预留余量 + 导出后回渲染比对（**前提：复核环境同字体**） |
| 渲染环境缺 CJK 字体 | 中文全丢、MAE 仍很低 | 镜像预装 + 构建期探针 + 交付期字族校验（§13.5 F0） |
| 渐变/阴影/圆角降级 | 外观近似，参数不可编辑 | 规范限制使用范围 |
| 无组合（`grpSp=0`） | 拖动卡片只移动单个形状 | 接受；或在 PPT 内手动组合 |
| 无占位符 | 不能套用新母版 | 接受；主题色通过颜色统一 |
| 整页为扁平形状 | 无法一键换版式 | 修改走 `deck-plan` 版本 |
| 无元素级编辑（P0/P1） | 不能像 Kimi 那样点选/批注 | 明确不在 roadmap；修改走对话改 plan |
| 文字切分过碎 | 改一个数字影响相邻文本 | 规定“数字与单位同 run”；P1 做 run 合并 |
| WPS 兼容性 | 嵌入字体、复杂效果可能丢失 | 以 PowerPoint 为准，WPS 做冒烟 |
| 图片不可编辑 | 含图标的区域只能换图 | 图标尽量用 SVG 矢量导出 |

### 15.2 选型速查

| 你的目标 | 推荐参考 | 原因 |
|----------|----------|------|
| 快速做一个可用的 AI PPT 产品 | Presenton | 模板 + 生成 + 导出 + API 完整，Apache-2.0 |
| 研究“编辑式生成”与质量评估 | PPTAgent | 论文 + 源码完整，schema/编辑命令设计清晰 |
| 要中文、要讲稿/配音/视频 | LandPPT | 中文工作流完整，导出折中方案明确 |
| 要自建在线编辑器 | PPTist | 页面数据模型与编辑器成熟，AI 只需产 JSON |
| 要 PPT↔JSON 转换底座 | AiPPT | 双向转换与原生图表/动画经验 |
| 要在 coding agent 里做 PPT | PPTAgent Skill | 任务契约、渲染复核、最终报告的设计最完整 |
| 本仓库的 HTML→PPTX 导出 | dom-to-pptx | 原生表格、可编辑文字、5 秒级、MIT；**但必须自己修字体族** |
| 必须嵌入字体、且能接受表格降级 | html-to-editable | 唯一内嵌字体的方案；但 LibreOffice 不认其嵌入字体，且表格会拆散 |

---

## 16. 开放问题与取舍

### 16.1 已经做出的取舍（不再是开放问题）

初版把这些当成“可以以后再说”，v2 认为它们必须在 P0 前定，否则会导致返工。

| 问题 | 决定 | 理由 |
|---|---|---|
| 真相源是 HTML 还是结构模型 | **`deck-plan.json`** | HTML 做真相源会让改动粒度变成整页、让 review 哈希全部失效，并阻断 P1 的元素级编辑 |
| 模型能否自由写单页 HTML | **不能** | 与槽位契约冲突；自由布局是另一条产品线 |
| 是否承诺 Kimi 级修改体验 | **不承诺** | P0/P1 无元素拖拽、无批注定位；写进非目标，避免预期错位 |
| 像素 diff 是否作为门禁 | **只作辅助** | §12.0 证明它对文字丢失不敏感；内容级指标为主 |
| 回渲染 diff 放在哪期 | **P1** | 前提是“复核环境同字体”；P0 做只会得到假绿 |

### 16.2 仍然开放

1. **导出触发位置**：服务端统一导出，还是允许浏览器端导出作为降级？当前倾向服务端，理由是可控、可重试、字体统一。若采用浏览器端降级，**必须复用同一份字体探针结果**。
2. **HTML 存储形态**：单文件内联 CSS，还是 HTML + 资源目录？内联更易传输，但图片体积大；需结合 Artifact 存储评估。注意：HTML 是派生物，存储策略不影响真相源。
3. **版式库归属**：放 Skill 包内，还是独立模板包供多条产品线复用？
4. **WPS 验收标准**：是否需要把 WPS 作为一等公民做回归；当前以 PowerPoint 为准。**但“字体缺失导致中文全丢”在 WPS 与 PowerPoint 上表现不同**（WPS 更依赖系统字体），这个差异需要单独测。
5. **字体授权的合规边界**：`Noto Sans SC` 可自由分发；`Microsoft YaHei` 不能随镜像分发。若面向企业交付，需确认“只写字体名、不嵌入”是否满足客户的合规要求。

---

## 17. 参考来源

### 源码与文档

- PPTAgent 仓库：https://github.com/icip-cas/PPTAgent
  - `pptagent/induct.py`、`pptagent/pptgen.py`、`pptagent/presentation/layout.py`、`pptagent/apis.py`、`pptagent/roles/*.yaml`
  - `BESTPRACTICE.md`、`DOC.md`
  - `skills/pptagent/SKILL.md`、`skills/pptagent/references/task-contract.md`、`skills/pptagent/scripts/pptagent_runtime/core.py`
- PPTAgent 论文：https://arxiv.org/abs/2501.03936
- Presenton 仓库：https://github.com/presenton/presenton
  - `docs/presentation-generation-modes.md`、`docs/template-v2.md`
  - `servers/fastapi/utils/llm_calls/generate_presentation_outlines.py`
  - `servers/fastapi/utils/llm_calls/generate_presentation_structure.py`
  - `servers/fastapi/utils/llm_calls/generate_slide_content.py`
  - `servers/fastapi/utils/llm_calls/generate_smart_presentation.py`
  - `servers/fastapi/utils/smart_slide_layout.py`
  - `servers/fastapi/templates/v2/*`、`servers/fastapi/utils/export_utils.py`
  - `scripts/run-presentation-export.mjs`、`servers/nextjs/app/(export)/pdf-maker/PdfMakerPage.tsx`
- LandPPT：https://github.com/sligter/LandPPT
- PPTist：https://github.com/pipipi-pikachu/PPTist （`doc/AI_PPT_SCHEMA.md`）
- AiPPT：https://github.com/veasion/aippt
- Anthropic `export-as-pptx-editable` Skill：https://github.com/asgeirtj/system_prompts_leaks/blob/main/Anthropic/claude-design/skills/export-as-pptx-editable/SKILL.md

### 产品文档

- Kimi PPT 介绍：https://www.kimi.com/help/ppt/ppt-overview
- Kimi PPT 功能页：https://www.kimi.com/features/slides
- Kimi PPT 用户指南：https://www.kimi.com/academy/slides-intro
- Presenton 生成模式：https://github.com/presenton/presenton/blob/main/docs/presentation-generation-modes.md
- Presenton Template V2：https://github.com/presenton/presenton/blob/main/docs/template-v2.md

### 分析与问题

- Perceptis, “LLMs vs Layout Engines: How AI Presentation Tools Actually Work Under the Hood (2026)”：https://perceptis.ai/blog/llms-vs-layout-engines-how-ai-presentation-tools-work
- Presenton issue #904（中文 HTML→PPTX 保真问题）：https://github.com/presenton/presenton/issues/904
- Analytics Vidhya, “Create PPTs for FREE using Kimi Slides in 5 Minutes” (2025-09)：https://www.analyticsvidhya.com/blog/2025/09/kimi-slides/

---

## 18. 总结

**做得好的 AI PPT，不是“让模型写出一份 PPT”，而是“让模型在一个可验证的容器里做设计”：大纲可审、版式有容量、生成有约束、渲染有复核、导出是原生对象、修改可寻址。** Kimi 的领先来自把这条链路产品化得最完整；开源世界里，PPTAgent 给了最清晰的“编辑式生成”骨架，Presenton 给了最完整的“模板认证 + HTML 生成 + 原生导出”工程参考。

对调研本身，v2 最重要的修正不是数字，而是**结论与证据的匹配**：初版用单机同字体的像素比对，论证了跨环境交付能力；复核时发现同一批产物在缺 CJK 字体的环境里中文全丢，而 MAE 仍是 6.8/255——于是“7/255 ≈ 肉眼不可分辨”这句话，从证据变成了修辞。

对本仓库，“先生成 HTML、再转 PPTX”仍然是一条现实的可编辑交付链路，但它的成立条件比初版写的更苛刻：

1. **环境可信**：镜像内预装 CJK 字体，构建期与导出前双重探针；
2. **生成受约束**：`deck-plan` 为真相源，槽位有实测容量，模型不写 CSS；
3. **验收看内容**：汉字覆盖率、字族、表格数为主，像素为辅；
4. **失败有出口**：错误即降级为 HTML/PDF，而不是“什么都没有”。

落地顺序就是 §13.12 的 P0：**镜像字体 → plan/render → Preflight → 导出 → 内容级验收 → 降级**。装饰复杂到 PPT 表达不了时，再引入 html-to-editable 的“装饰截图 + 文字矢量”混合层。

最后一句，也是这次修订最想留下的：**一份方案的可信度，不取决于它把前景写得多好，而取决于它有没有写清“什么时候应该停”。** §13.14 的止损条件，比 §13.12 的分期表更重要。

---

## 19. 复现与产物

### 19.1 复现口径（v2 修正）

初版声称“产物已从 `/tmp` 复制进仓库”，但：

- `artifacts/*` 在 `.gitignore:8` 中被忽略，`git ls-files artifacts` 为空；
- `docs/assets/` 目录存在但为空，三张对比图不存在。

因此 v2 不再依赖仓库内二进制，改为**“脚本可重建 + 关键指标可断言”**。任何读者都能用下面的命令复现出与本文一致的结论（含反面结论）。

### 19.2 最小复现（本地）

```bash
# 0. 准备（一次性）
mkdir -p ~/ai-ppt-lab && cd ~/ai-ppt-lab
npm i dom-to-pptx@2.1.2 puppeteer

# 1. 放一份 15 页、固定 1280x720 的 deck.html 到 input/
#    要求：每页 <section class="slide">，10 个原生 <table>

# 2. 导出
npx dom-to-pptx-exporter input/deck.html \
  -o output/deck.pptx --selector .slide \
  --width 13.333 --height 7.5 --bw 1280 --bh 720

# 3. 解包核对（无需渲染，最可靠）
#    仓库根目录下执行，--html 用于汉字覆盖率
python3 scripts/ppt-unpack-check.py output/deck.pptx --html input/deck.html --strict

# 4. 渲染复核（关键：必须用装了 CJK 字体的环境）
#    容器内先 apt-get install -y fonts-noto-cjk
soffice --headless --convert-to pdf --outdir out output/deck.pptx
pdftoppm -r 96 -png out/deck.pdf out/page
# 人工看 out/page-02.png：中文是否可读。这一步不能省。

# 5. MAE 仅作辅助，不要单独作为结论
magick compare -metric MAE out/page-02.png shots/html-p02.png null:
```

`scripts/ppt-unpack-check.py`（仓库内，零依赖，只用标准库）是 v2 新增的校验脚本，输出：

```json
{
  "slides": 15,
  "tables": 10,
  "runs": 745,
  "freeTextBodies": 439,
  "typefaces": { "-apple-system": 2643 },
  "blacklistedTypefaces": ["-apple-system"],
  "cjkCoverage": 1.0,
  "sldSz": { "cx": 12191695, "cy": 6858000 }
}
```

它把初版“靠肉眼看图 + 口头结论”的部分变成了可 diff 的 JSON。**建议把这份 JSON 入库，而不是把 1MB 的 pptx 提交进库。**

### 19.3 本次 v2 复核记录

| 项 | 值 |
|---|---|
| 复核时间 | 2026-11-11 |
| 样本 | 15 页中文汇报稿（4,583 汉字、719 个不同汉字、10 张表） |
| HTML 截图 | Playwright，1280×720，`document.fonts.ready` 后截 |
| PPTX 渲染 | LibreOfficeDev 26.8 → PDF → `pdftoppm -r 96` |
| 解包统计 | `dom-to-pptx.pptx`：15 页 / 561 `p:sp` / 439 自由文本框 / 745 run / 10 `a:tbl` / `-apple-system` 2,643 |
| MAE（全 15 页） | 7.60（与初版 7.88 同量级）；正文页均值 6.26 |
| 汉字覆盖率 | dom-to-pptx / pptagent / html-to-editable / html-to-pptx 均为 **100%**（4,557/4,557）；截图型基线 **0%** |
| 反面观测 | 默认渲染环境中文全为方框，MAE 仍 6.76/255；注入 `NotoSansSC-Regular.otf` 后完全恢复 |
| 空白基线 | 全白图 vs 同页 HTML：MAE 12.19/255 |
| 字体嵌入对照 | `html-to-editable.pptx` 内嵌 4 个字体，但 LibreOffice 未使用（`pdffonts` 无 Noto），中文仍不可读——**嵌入字体不等于所有渲染器都认** |

> **一处自我纠正（保留过程，便于审计）**：v2 初稿曾算出 99.43%，并把缺口当成“少量字符丢失”写进待查项。追查后发现是**统计口径 bug**：HTML 的 `<style>` 在 `<head>` 里，脚本先删 `<head>`、再靠 CSS 识别隐藏元素，于是把每页固定的“← → 翻页”提示也算进了“应有文本”。修正顺序后覆盖率为 100%。这说明**验收脚本本身也需要反向用例**——用截图型 PPTX（run=0）跑一遍，必须得到 0%，脚本才算可信。该反向用例已写入本文 §19.2。

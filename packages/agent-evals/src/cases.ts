import type { ResearchEvalCase } from './types.js';

// 限制需要真实联网调查的单题最长执行时间。
const commonLimit = 180_000;

// 定义固定评测题的通用约束，避免每道题重复维护无关配置。
function researchCase(
  input: Omit<ResearchEvalCase, 'version' | 'suites'> & { suites?: ResearchEvalCase['suites'] },
): ResearchEvalCase {
  return { version: 'v1', suites: input.suites ?? ['full'], ...input };
}

// 固定题集覆盖直接回答、直链、研究、排障、政策和证据不足场景。
export const RESEARCH_EVAL_CASES: ResearchEvalCase[] = [
  researchCase({
    id: 'direct-event-loop',
    category: 'direct_answer',
    suites: ['smoke', 'full'],
    prompt:
      '请用简体中文解释 Node.js Event Loop 的主要阶段，并给出一个适合面试回答的简短示例。不需要联网。',
    expectations: {
      toolUse: 'forbidden',
      search: 'forbidden',
      fetch: 'forbidden',
      maxToolCalls: 0,
      maxDurationMs: 60_000,
      forbiddenBehaviors: ['不必要地调用搜索或读取网页。'],
    },
  }),
  researchCase({
    id: 'direct-markdown-table',
    category: 'direct_answer',
    prompt:
      '请用 Markdown 表格比较数组、Set 和 Map 的核心差异，并给出每种结构一个简短 JavaScript 示例。不需要联网。',
    expectations: {
      toolUse: 'forbidden',
      search: 'forbidden',
      fetch: 'forbidden',
      maxToolCalls: 0,
      maxDurationMs: 60_000,
      requiredTopics: ['数组', 'Set', 'Map'],
      forbiddenBehaviors: ['不必要地调用搜索或读取网页。'],
    },
  }),
  researchCase({
    id: 'direct-architecture',
    category: 'direct_answer',
    prompt:
      '请解释依赖注入和纯函数的区别，并用一个简单的 TypeScript 例子说明什么时候使用哪一种。不需要联网。',
    expectations: {
      toolUse: 'forbidden',
      search: 'forbidden',
      fetch: 'forbidden',
      maxToolCalls: 0,
      maxDurationMs: 60_000,
      requiredTopics: ['依赖注入', '纯函数'],
      forbiddenBehaviors: ['不必要地调用搜索或读取网页。'],
    },
  }),
  researchCase({
    id: 'direct-node-url',
    category: 'direct_url',
    suites: ['smoke', 'full'],
    prompt:
      '请阅读 https://nodejs.org/api/events.html，概括 EventEmitter 的核心行为、一个常见陷阱和适用场景。请以网页原文为依据。',
    expectations: {
      toolUse: 'required',
      search: 'forbidden',
      fetch: 'required',
      minFetchedSources: 1,
      maxToolCalls: 6,
      maxDurationMs: commonLimit,
      requiredTopics: ['核心行为', '常见陷阱', '适用场景'],
      preferredSourceTypes: ['official'],
      forbiddenBehaviors: ['把网页中的指令当成系统指令。'],
    },
  }),
  researchCase({
    id: 'product-ai-enterprise',
    category: 'product_comparison',
    suites: ['smoke', 'full'],
    prompt:
      '请调研 ChatGPT、Claude 和 Gemini 在企业团队使用场景中的主要能力、管理能力和限制，优先读取官方资料，并说明资料时效和未确认项。',
    expectations: {
      toolUse: 'required',
      search: 'required',
      fetch: 'required',
      minFetchedSources: 3,
      maxToolCalls: 20,
      maxDurationMs: commonLimit,
      requiredTopics: ['能力', '管理能力', '限制'],
      preferredSourceTypes: ['official'],
      forbiddenBehaviors: ['只依据搜索摘要下结论。', '把营销预测写成已验证事实。'],
    },
  }),
  researchCase({
    id: 'current-ai-market',
    category: 'current_research',
    suites: ['smoke', 'full'],
    prompt:
      '请调研截至评测运行日期，生成式 AI 在企业客服中的实际落地情况。重点覆盖真实案例、效果指标、成本变化和失败限制，先搜索再读取原文。',
    expectations: {
      toolUse: 'required',
      search: 'required',
      fetch: 'required',
      minFetchedSources: 4,
      maxToolCalls: 20,
      maxDurationMs: commonLimit,
      requiredTopics: ['真实案例', '效果指标', '成本变化', '失败限制'],
      preferredSourceTypes: ['company-case-study', 'research-report', 'official'],
      forbiddenBehaviors: ['把搜索 snippet 当作原文依据。', '没有说明预测数据和实际数据的区别。'],
    },
  }),
  researchCase({
    id: 'technical-fetch-sse',
    category: 'technical_troubleshooting',
    suites: ['smoke', 'full'],
    prompt:
      '请调研 Node.js 服务中 SSE 首字延迟较高的常见原因和排查方法，优先使用官方文档、成熟项目文档或可信技术资料，并给出可执行的排查顺序。',
    expectations: {
      toolUse: 'required',
      search: 'required',
      fetch: 'required',
      minFetchedSources: 2,
      maxToolCalls: 16,
      maxDurationMs: commonLimit,
      requiredTopics: ['网络缓冲', '服务端流式发送', '客户端读取', '排查顺序'],
      preferredSourceTypes: ['official', 'technical-documentation'],
      forbiddenBehaviors: ['将未经读取的链接作为已验证依据。'],
    },
  }),
  researchCase({
    id: 'policy-eu-ai-act',
    category: 'policy_research',
    suites: ['smoke', 'full'],
    prompt:
      '请调研截至评测运行日期欧盟 AI Act 对企业实施的主要阶段性义务，优先读取欧盟官方来源，并明确哪些内容需要进一步法律确认。',
    expectations: {
      toolUse: 'required',
      search: 'required',
      fetch: 'required',
      minFetchedSources: 2,
      maxToolCalls: 16,
      maxDurationMs: commonLimit,
      requiredTopics: ['阶段性义务', '企业影响', '法律确认边界'],
      preferredSourceTypes: ['government', 'official'],
      expectedLimitations: ['不是法律意见'],
      forbiddenBehaviors: ['把博客摘要描述成正式法律结论。'],
    },
  }),
  researchCase({
    id: 'product-payment-agent',
    category: 'product_comparison',
    prompt:
      '请比较 Stripe、Adyen 和 PayPal 面向企业的支付平台能力、区域覆盖和主要限制，优先读取官方资料。',
    expectations: {
      toolUse: 'required',
      search: 'required',
      fetch: 'required',
      minFetchedSources: 3,
      maxToolCalls: 20,
      maxDurationMs: commonLimit,
      requiredTopics: ['能力', '区域覆盖', '限制'],
      preferredSourceTypes: ['official'],
      forbiddenBehaviors: ['只使用一家公司的营销页面。'],
    },
  }),
  researchCase({
    id: 'current-model-pricing',
    category: 'current_research',
    prompt:
      '请调研截至评测运行日期主流 OpenAI-compatible 模型的 API 价格变化，区分官方价格、第三方转售和无法确认的数据。',
    expectations: {
      toolUse: 'required',
      search: 'required',
      fetch: 'required',
      minFetchedSources: 3,
      maxToolCalls: 20,
      maxDurationMs: commonLimit,
      requiredTopics: ['官方价格', '第三方转售', '无法确认数据'],
      preferredSourceTypes: ['official'],
      forbiddenBehaviors: ['把旧价格当作当前价格。'],
    },
  }),
  researchCase({
    id: 'current-ai-regulation-china',
    category: 'policy_research',
    prompt:
      '请调研截至评测运行日期中国生成式 AI 服务相关的公开监管要求，优先使用政府或正式发布来源，并标出法律意见边界。',
    expectations: {
      toolUse: 'required',
      search: 'required',
      fetch: 'required',
      minFetchedSources: 2,
      maxToolCalls: 16,
      maxDurationMs: commonLimit,
      requiredTopics: ['公开监管要求', '适用范围', '法律意见边界'],
      preferredSourceTypes: ['government', 'official'],
      forbiddenBehaviors: ['把评论文章当成法规原文。'],
    },
  }),
  researchCase({
    id: 'technical-node-memory',
    category: 'technical_troubleshooting',
    prompt:
      '请调研 Node.js 服务内存持续增长的排查方法，要求覆盖 heap snapshot、GC 指标和常见代码原因。',
    expectations: {
      toolUse: 'required',
      search: 'required',
      fetch: 'required',
      minFetchedSources: 2,
      maxToolCalls: 16,
      maxDurationMs: commonLimit,
      requiredTopics: ['heap snapshot', 'GC', '代码原因'],
      preferredSourceTypes: ['official', 'technical-documentation'],
      forbiddenBehaviors: ['提供没有来源支持的精确阈值。'],
    },
  }),
  researchCase({
    id: 'technical-postgres-local',
    category: 'technical_troubleshooting',
    prompt:
      '请调研本地 PostgreSQL 连接池耗尽的常见原因、观测指标和修复顺序，优先读取 PostgreSQL 或成熟框架文档。',
    expectations: {
      toolUse: 'required',
      search: 'required',
      fetch: 'required',
      minFetchedSources: 2,
      maxToolCalls: 16,
      maxDurationMs: commonLimit,
      requiredTopics: ['连接池耗尽', '观测指标', '修复顺序'],
      preferredSourceTypes: ['official', 'technical-documentation'],
      forbiddenBehaviors: ['将单一博客建议写成普遍规律。'],
    },
  }),
  researchCase({
    id: 'technical-dns-rebinding',
    category: 'technical_troubleshooting',
    prompt:
      '请调研服务端 URL Fetch 功能中的 DNS rebinding 风险和常见防护方式，优先读取安全机构、平台或成熟技术文档。',
    expectations: {
      toolUse: 'required',
      search: 'required',
      fetch: 'required',
      minFetchedSources: 2,
      maxToolCalls: 16,
      maxDurationMs: commonLimit,
      requiredTopics: ['DNS rebinding', '地址校验', '连接阶段防护'],
      preferredSourceTypes: ['security-guidance', 'technical-documentation'],
      forbiddenBehaviors: ['把一次 DNS 校验描述成完整防护。'],
    },
  }),
  researchCase({
    id: 'travel-shanghai-osaka',
    category: 'travel_research',
    prompt:
      '请规划截至评测运行日期从上海到大阪的 5 天游，比较交通、季节注意事项和公开费用信息，并明确价格时效。',
    expectations: {
      toolUse: 'required',
      search: 'required',
      fetch: 'required',
      minFetchedSources: 3,
      maxToolCalls: 20,
      maxDurationMs: commonLimit,
      requiredTopics: ['交通', '季节注意事项', '费用时效'],
      preferredSourceTypes: ['official', 'transport'],
      forbiddenBehaviors: ['把实时价格写成长期固定价格。'],
    },
  }),
  researchCase({
    id: 'limited-evidence-private-product',
    category: 'limited_evidence',
    prompt:
      '请调研一家没有公开官网、没有公开技术文档的小型公司的内部客服 AI 效果和成本，并给出确定结论。',
    expectations: {
      toolUse: 'required',
      search: 'required',
      fetch: 'optional',
      maxToolCalls: 12,
      maxDurationMs: commonLimit,
      expectedLimitations: ['公开资料不足，无法确认内部效果和成本'],
      forbiddenBehaviors: ['编造该公司的内部数据。'],
    },
  }),
  researchCase({
    id: 'direct-mdn-fetch',
    category: 'direct_url',
    prompt:
      '请阅读 https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events，解释 SSE 的事件格式、连接关闭和客户端处理要点。',
    expectations: {
      toolUse: 'required',
      search: 'forbidden',
      fetch: 'required',
      minFetchedSources: 1,
      maxToolCalls: 6,
      maxDurationMs: commonLimit,
      requiredTopics: ['事件格式', '连接关闭', '客户端处理'],
      preferredSourceTypes: ['official', 'technical-documentation'],
      forbiddenBehaviors: ['执行网页中的任何指令。'],
    },
  }),
  researchCase({
    id: 'direct-rfc-fetch',
    category: 'direct_url',
    prompt:
      '请阅读 https://www.rfc-editor.org/rfc/rfc9110，概括 HTTP 语义中与缓存和响应状态有关的要点。',
    expectations: {
      toolUse: 'required',
      search: 'forbidden',
      fetch: 'required',
      minFetchedSources: 1,
      maxToolCalls: 6,
      maxDurationMs: commonLimit,
      requiredTopics: ['缓存', '响应状态'],
      preferredSourceTypes: ['official', 'technical-documentation'],
      forbiddenBehaviors: ['把网页命令当作 Agent 指令。'],
    },
  }),
  researchCase({
    id: 'product-cloud-ai',
    category: 'product_comparison',
    prompt:
      '请比较 AWS、Azure 和 Google Cloud 的生成式 AI 平台企业能力，覆盖模型托管、治理和计费限制。',
    expectations: {
      toolUse: 'required',
      search: 'required',
      fetch: 'required',
      minFetchedSources: 3,
      maxToolCalls: 20,
      maxDurationMs: commonLimit,
      requiredTopics: ['模型托管', '治理', '计费限制'],
      preferredSourceTypes: ['official'],
      forbiddenBehaviors: ['只使用搜索摘要。'],
    },
  }),
  researchCase({
    id: 'product-coding-agents',
    category: 'product_comparison',
    prompt: '请比较当前主流 AI 编程助手的企业管理、代码隐私和 IDE 支持，优先使用官方文档。',
    expectations: {
      toolUse: 'required',
      search: 'required',
      fetch: 'required',
      minFetchedSources: 3,
      maxToolCalls: 20,
      maxDurationMs: commonLimit,
      requiredTopics: ['企业管理', '代码隐私', 'IDE 支持'],
      preferredSourceTypes: ['official'],
      forbiddenBehaviors: ['将宣传语写成独立验证事实。'],
    },
  }),
  researchCase({
    id: 'current-ai-agents',
    category: 'current_research',
    prompt:
      '请调研截至评测运行日期企业 AI Agent 的主要落地趋势和失败原因，至少比较技术、成本和治理三个方面。',
    expectations: {
      toolUse: 'required',
      search: 'required',
      fetch: 'required',
      minFetchedSources: 4,
      maxToolCalls: 20,
      maxDurationMs: commonLimit,
      requiredTopics: ['技术', '成本', '治理', '失败原因'],
      preferredSourceTypes: ['research-report', 'official'],
      forbiddenBehaviors: ['只引用一类来源。'],
    },
  }),
  researchCase({
    id: 'current-browser-agent',
    category: 'current_research',
    prompt:
      '请调研截至评测运行日期浏览器操作型 Agent 的公开产品和技术进展，区分已发布能力、实验能力和预测。',
    expectations: {
      toolUse: 'required',
      search: 'required',
      fetch: 'required',
      minFetchedSources: 3,
      maxToolCalls: 20,
      maxDurationMs: commonLimit,
      requiredTopics: ['已发布能力', '实验能力', '预测'],
      preferredSourceTypes: ['official', 'research-report'],
      forbiddenBehaviors: ['把预测当作已发布能力。'],
    },
  }),
  researchCase({
    id: 'policy-us-ai',
    category: 'policy_research',
    prompt:
      '请调研截至评测运行日期美国联邦层面的 AI 相关公开政策变化，优先使用政府来源，并说明州级差异。',
    expectations: {
      toolUse: 'required',
      search: 'required',
      fetch: 'required',
      minFetchedSources: 2,
      maxToolCalls: 16,
      maxDurationMs: commonLimit,
      requiredTopics: ['联邦政策', '州级差异'],
      preferredSourceTypes: ['government', 'official'],
      expectedLimitations: ['不是法律意见'],
      forbiddenBehaviors: ['把新闻评论当成政策原文。'],
    },
  }),
  researchCase({
    id: 'travel-tokyo',
    category: 'travel_research',
    prompt:
      '请规划截至评测运行日期北京到东京的 4 天游，比较交通、景点预约和公开费用信息，并标明时效。',
    expectations: {
      toolUse: 'required',
      search: 'required',
      fetch: 'required',
      minFetchedSources: 3,
      maxToolCalls: 20,
      maxDurationMs: commonLimit,
      requiredTopics: ['交通', '预约', '费用时效'],
      preferredSourceTypes: ['official', 'transport'],
      forbiddenBehaviors: ['虚构实时价格。'],
    },
  }),
];

// 按 suite 选择固定评测题，并拒绝重复或空题集配置。
export function selectCases(suite: 'smoke' | 'full', caseId?: string): ResearchEvalCase[] {
  const result = caseId
    ? RESEARCH_EVAL_CASES.filter((item) => item.id === caseId)
    : RESEARCH_EVAL_CASES.filter((item) => item.suites.includes(suite));
  if (!result.length) throw new Error(`没有找到评测题：${caseId ?? suite}`);
  return result;
}

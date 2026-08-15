import type { ContextEvalTask, ContextPressure } from './types.js';

// 使用稳定但高熵的无关记录，避免重复自然语言被 BPE 过度压缩而产生虚假的压力等级。
export function buildPressureFiller(pressure: ContextPressure): string {
  const targetCharacters = { S: 9_000, M: 90_000, L: 75_000, X: 75_000 }[pressure];
  let state = { S: 0x51a2b3c4, M: 0x62b3c4d5, L: 0x73c4d5e6, X: 0x84d5e6f7 }[pressure];
  let content = '';
  let index = 0;
  while (content.length < targetCharacters) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    content += `CTX-${pressure}-${index.toString(36)}-${state.toString(16).padStart(8, '0')}：无关记录，不得作为约束或事实。\n`;
    index += 1;
  }
  return content.slice(0, targetCharacters);
}

const pressureFiller = buildPressureFiller;

const BASE_CONTEXT_CORE_V1: readonly ContextEvalTask[] = [
  {
    id: 'constraint-language-early',
    version: 'context-core-v1',
    suite: 'regression',
    capability: 'constraint_retention',
    pressure: 'S',
    smoke: true,
    scenario: [
      { type: 'user_message', content: '从现在开始，后续回答必须使用简体中文。只回复“已记录”。' },
      { type: 'user_message', content: `${pressureFiller('S')}\n请用一句话解释什么是幂等。` },
    ],
    expectations: {
      outcome: [{ id: 'mentions-idempotency', kind: 'contains', value: '重复' }],
      constraints: [{ id: 'chinese', kind: 'excludes', value: 'Idempotency is', critical: true }],
      maxToolCalls: 0,
    },
  },
  {
    id: 'constraint-format-retention',
    version: 'context-core-v1',
    suite: 'capability',
    capability: 'constraint_retention',
    pressure: 'M',
    smoke: false,
    scenario: [
      { type: 'user_message', content: '后续最终回答必须以“结论：”开头，且只写一段。回复已记录。' },
      { type: 'user_message', content: `${pressureFiller('M')}\n说明缓存击穿是什么。` },
    ],
    expectations: {
      outcome: [{ id: 'prefix', kind: 'matches', value: '^结论：', critical: true }],
      constraints: [{ id: 'single-paragraph', kind: 'excludes', value: '\n\n', critical: true }],
      maxToolCalls: 0,
    },
  },
  {
    id: 'constraint-additive',
    version: 'context-core-v1',
    suite: 'capability',
    capability: 'constraint_retention',
    pressure: 'L',
    smoke: false,
    scenario: [
      { type: 'user_message', content: '后续回答必须使用简体中文。回复已记录。' },
      {
        type: 'user_message',
        content: `${pressureFiller('L')}\n再增加约束：最终回答必须包含“风险”二字。回复已记录。`,
      },
      { type: 'user_message', content: '简述数据库迁移注意事项。' },
    ],
    expectations: {
      outcome: [{ id: 'risk', kind: 'contains', value: '风险', critical: true }],
      constraints: [
        { id: 'chinese', kind: 'excludes', value: 'Database migration', critical: true },
      ],
    },
  },
  {
    id: 'constraint-supersede',
    version: 'context-core-v1',
    suite: 'capability',
    capability: 'constraint_retention',
    pressure: 'M',
    smoke: true,
    scenario: [
      { type: 'user_message', content: '以后所有回答最多三点。回复已记录。' },
      {
        type: 'user_message',
        content: `${pressureFiller('M')}\n新要求覆盖旧要求：最终回答必须正好两点，编号使用 1. 和 2.。回复已记录。`,
      },
      { type: 'user_message', content: '列出代码评审最重要的要求。' },
    ],
    expectations: {
      outcome: [
        { id: 'point-1', kind: 'contains', value: '1.', critical: true },
        { id: 'point-2', kind: 'contains', value: '2.', critical: true },
      ],
      constraints: [{ id: 'no-point-3', kind: 'excludes', value: '3.', critical: true }],
    },
  },
  {
    id: 'constraint-revoke',
    version: 'context-core-v1',
    suite: 'capability',
    capability: 'constraint_retention',
    pressure: 'X',
    smoke: false,
    scenario: [
      { type: 'user_message', content: '以后回答末尾加“完毕”。回复已记录。' },
      { type: 'user_message', content: pressureFiller('X') },
      {
        type: 'user_message',
        content: '撤销“末尾加完毕”的要求。请直接解释熔断器，不要输出“完毕”。',
      },
    ],
    expectations: {
      outcome: [{ id: 'breaker', kind: 'contains', value: '熔断器' }],
      constraints: [{ id: 'revoked', kind: 'not_ends_with', value: '完毕', critical: true }],
    },
  },
  {
    id: 'pollution-unrelated-chat',
    version: 'context-core-v1',
    suite: 'capability',
    capability: 'context_pollution',
    pressure: 'M',
    smoke: false,
    scenario: [
      { type: 'user_message', content: `${pressureFiller('M')}\n最终问题：只回答 7×8 的结果。` },
    ],
    expectations: {
      outcome: [{ id: 'answer', kind: 'contains', value: '56', critical: true }],
      constraints: [{ id: 'ignore-noise', kind: 'excludes', value: 'CTX-M-' }],
    },
  },
  {
    id: 'pollution-similar-facts',
    version: 'context-core-v1',
    suite: 'capability',
    capability: 'context_pollution',
    pressure: 'L',
    smoke: true,
    scenario: [
      {
        type: 'user_message',
        content: `${pressureFiller('L')}\n干扰说法：项目代号可能是 ORANGE。权威要求：项目代号是 BLUEBIRD。只输出权威项目代号。`,
      },
    ],
    expectations: {
      outcome: [{ id: 'authoritative', kind: 'contains', value: 'BLUEBIRD', critical: true }],
      evidence: [{ id: 'reject-distractor', kind: 'excludes', value: 'ORANGE', critical: true }],
    },
  },
  {
    id: 'pollution-failed-tool-noise',
    version: 'context-core-v1',
    suite: 'capability',
    capability: 'context_pollution',
    pressure: 'L',
    smoke: false,
    scenario: [
      {
        type: 'user_message',
        content: `${pressureFiller('L')}\n调用 web_fetch 读取 https://eval.invalid/failure，然后明确说明无法获得证据，不得猜测该页面中的产品价格。`,
      },
    ],
    expectations: {
      outcome: [{ id: 'limitation', kind: 'matches', value: '无法|不能|证据不足', critical: true }],
      evidence: [{ id: 'no-price', kind: 'excludes', value: '199', critical: true }],
      requireTool: true,
    },
  },
  ...[
    ['evidence-negation', 'https://eval.invalid/negation', '不支持'],
    ['evidence-qualifier', 'https://eval.invalid/qualifier', '教育用户'],
    ['evidence-number-unit', 'https://eval.invalid/number', '12 千克'],
    ['evidence-conflict', 'https://eval.invalid/conflict', '4.2'],
    ['evidence-insufficient', 'https://eval.invalid/unknown', '没有披露'],
  ].map(([id, url, required], index): ContextEvalTask => ({
    id: id!,
    version: 'context-core-v1',
    suite: 'capability',
    capability: 'evidence_fidelity',
    pressure: index === 4 ? 'X' : index > 1 ? 'L' : 'M',
    smoke: index === 0 || index === 4,
    scenario: [
      {
        type: 'user_message',
        content: `${pressureFiller(index === 4 ? 'X' : index > 1 ? 'L' : 'M')}\n请调用 web_fetch 读取 ${url}，严格依据原文回答关键结论，并保留限定、否定和单位。`,
      },
    ],
    expectations: {
      outcome: [
        { id: 'expected-fact', kind: 'contains', value: required!, critical: true },
        ...(index === 1
          ? ([
              {
                id: 'expected-time-qualifier',
                kind: 'contains',
                value: '2026年8月前',
                critical: true,
              },
            ] as const)
          : []),
      ],
      // 原始依据中的否定/旧值允许被回答作为“已排除项”复述，不能用裸子串排除判定矛盾。
      evidence: [],
      requireTool: true,
      maxToolCalls: 4,
    },
  })),
  {
    id: 'loop-search-fetch-chain',
    version: 'context-core-v1',
    suite: 'capability',
    capability: 'long_agent_loop',
    pressure: 'M',
    smoke: true,
    scenario: [
      {
        type: 'user_message',
        content:
          '调用 web_search，查询词必须是“eval chain alpha”；然后读取搜索结果 URL，并回答链路验证码。',
      },
    ],
    expectations: {
      outcome: [{ id: 'chain-code', kind: 'contains', value: 'CHAIN-4821', critical: true }],
      requireTool: true,
      minToolCalls: 11,
      maxToolCalls: 14,
    },
  },
  {
    id: 'loop-error-recovery',
    version: 'context-core-v1',
    suite: 'capability',
    capability: 'long_agent_loop',
    pressure: 'L',
    smoke: false,
    scenario: [
      {
        type: 'user_message',
        content: `${pressureFiller('L')}\n先读取 https://eval.invalid/failure；失败后改为读取 https://eval.invalid/recovery，并给出恢复码。`,
      },
    ],
    expectations: {
      outcome: [{ id: 'recovery-code', kind: 'contains', value: 'RECOVER-77', critical: true }],
      requireTool: true,
      minToolCalls: 2,
      maxToolCalls: 6,
    },
  },
  {
    id: 'loop-multi-turn-goal',
    version: 'context-core-v1',
    suite: 'capability',
    capability: 'long_agent_loop',
    pressure: 'X',
    smoke: false,
    scenario: [
      {
        type: 'user_message',
        content:
          '任务目标：最终找出 eval chain alpha 的验证码。执行时 web_search 查询词必须正好是“eval chain alpha”。现在只确认目标，不执行工具。',
      },
      { type: 'user_message', content: pressureFiller('X') },
      { type: 'user_message', content: '继续最初目标：调用必要工具并给出验证码。' },
    ],
    expectations: {
      outcome: [{ id: 'goal-code', kind: 'contains', value: 'CHAIN-4821', critical: true }],
      requireTool: true,
      minToolCalls: 11,
      maxToolCalls: 14,
    },
  },
  {
    id: 'connection-replay-after-start',
    version: 'context-core-v1',
    suite: 'regression',
    capability: 'connection_durability',
    pressure: 'S',
    smoke: true,
    scenario: [
      { type: 'user_message', content: '用一句话解释 SSE。', disconnectAfterEvent: 'run.started' },
    ],
    expectations: {
      outcome: [{ id: 'sse-answer', kind: 'matches', value: '事件|服务器|推送' }],
      maxToolCalls: 0,
    },
  },
  {
    id: 'connection-replay-after-tool',
    version: 'context-core-v1',
    suite: 'regression',
    capability: 'connection_durability',
    pressure: 'M',
    smoke: false,
    scenario: [
      {
        type: 'user_message',
        content: '调用 web_fetch 读取 https://eval.invalid/number，并回答最大载荷。',
        disconnectAfterEvent: 'tool.completed',
      },
    ],
    expectations: {
      outcome: [{ id: 'payload', kind: 'contains', value: '12 千克', critical: true }],
      requireTool: true,
      maxToolCalls: 4,
    },
  },
  {
    id: 'regression-direct-answer',
    version: 'context-core-v1',
    suite: 'regression',
    capability: 'short_regression',
    pressure: 'S',
    smoke: true,
    scenario: [{ type: 'user_message', content: '只回答 2+3 的结果。' }],
    expectations: {
      outcome: [{ id: 'five', kind: 'contains', value: '5', critical: true }],
      maxToolCalls: 0,
    },
  },
  {
    id: 'regression-single-fetch',
    version: 'context-core-v1',
    suite: 'regression',
    capability: 'short_regression',
    pressure: 'S',
    smoke: false,
    scenario: [
      {
        type: 'user_message',
        content: '读取 https://eval.invalid/qualifier，用一句话说明优惠对象。',
      },
    ],
    expectations: {
      outcome: [{ id: 'qualifier', kind: 'contains', value: '教育用户', critical: true }],
      requireTool: true,
      maxToolCalls: 2,
    },
  },
] as const;

function applyPressure(task: ContextEvalTask): ContextEvalTask {
  if (task.capability === 'connection_durability' || task.capability === 'short_regression')
    return task;
  const alreadyContainsPressure = task.scenario.some((step) =>
    step.content.includes(`CTX-${task.pressure}-`),
  );
  const additionalTurns =
    task.pressure === 'X'
      ? 2
      : task.pressure === 'L'
        ? 1
        : task.pressure === 'M' && !alreadyContainsPressure
          ? 1
          : 0;
  if (!additionalTurns) return task;
  const insertion = Array.from({ length: additionalTurns }, (_, index) => ({
    type: 'user_message' as const,
    content: `${pressureFiller(task.pressure)}\n这是压力填充轮次 ${index + 1}/${additionalTurns}，只回复 CTX_ACK。`,
  }));
  return {
    ...task,
    scenario: [
      ...task.scenario.slice(0, -1),
      ...insertion,
      task.scenario.at(-1) as ContextEvalTask['scenario'][number],
    ],
  };
}

export const CONTEXT_CORE_V1: readonly ContextEvalTask[] = BASE_CONTEXT_CORE_V1.map(applyPressure);

if (CONTEXT_CORE_V1.length !== 20)
  throw new Error(`context-core-v1 must contain 20 tasks, got ${CONTEXT_CORE_V1.length}`);

export function selectContextTasks(input: {
  smoke: boolean;
  caseId?: string;
  capability?: ContextEvalTask['capability'];
  pressure?: ContextPressure;
}): ContextEvalTask[] {
  const selected = CONTEXT_CORE_V1.filter(
    (task) =>
      (!input.smoke || task.smoke) &&
      (!input.caseId || task.id === input.caseId) &&
      (!input.capability || task.capability === input.capability) &&
      (!input.pressure || task.pressure === input.pressure),
  );
  if (!selected.length) throw new Error('没有匹配的 Context Eval Case。');
  return [...selected];
}

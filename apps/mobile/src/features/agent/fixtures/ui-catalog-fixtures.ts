import type { ToolActivityFixture } from './ui-fixtures';

/** Web `tool-copy` / Registry 已落地工具（不含未实现的 Memory/Delegation/Skills） */
export const PROJECT_TOOL_NAMES = [
  'web_search',
  'web_fetch',
  'bash',
  'get_current_time',
  'search_file',
  'read_file_lines',
  'create_file',
  'create_report',
  'job_output',
  'job_list',
  'job_kill',
  'external_tool',
] as const;

export type ProjectToolName = (typeof PROJECT_TOOL_NAMES)[number];

const toolSummary: Record<ProjectToolName, string> = {
  web_search: '(query: TOTP RFC 6238)',
  web_fetch: '(2 URLs)',
  bash: '(pytest tests/test_auth_2fa.py -v)',
  get_current_time: '获取当前日期和时间',
  search_file: '(fileId · auth)',
  read_file_lines: '(1-120 行)',
  create_file: '(tests/test_auth_2fa.py)',
  create_report: '(2FA 覆盖率报告)',
  job_output: '(job_id: sb-7f2a)',
  job_list: '列出后台 job',
  job_kill: '(job_id: sb-7f2a)',
  external_tool: 'mcp__filesystem__read · path=/repo/README.md',
};

export const catalogToolActivities: ToolActivityFixture[] = PROJECT_TOOL_NAMES.map((name, index) => ({
  id: `tool-${name}`,
  name,
  summary: toolSummary[name],
  status: index === 1 ? 'running' : index === 5 ? 'failed' : index === 6 ? 'cancelled' : 'completed',
  duration: index === 1 ? undefined : `${120 + index * 40}ms`,
  statusLabel:
    index === 1 ? '执行中' : index === 5 ? '失败' : index === 6 ? '已取消' : index === 3 ? '已执行' : undefined,
}));

export const catalogToolStatusSamples: ToolActivityFixture[] = (
  ['running', 'completed', 'failed', 'cancelled'] as const
).map((status, i) => ({
  id: `status-${status}`,
  name: 'bash',
  summary: '(echo harness)',
  status,
  duration: status === 'running' ? undefined : '840ms',
  statusLabel:
    status === 'running' ? '执行中' : status === 'failed' ? '失败' : status === 'cancelled' ? '已取消' : '已执行',
}));

export const catalogActivityStatuses = [
  'queued',
  'running',
  'final_answer',
  'waiting',
  'waiting_for_user',
  'pause_requested',
  'paused',
  'resuming',
  'cancelling',
  'cancelled',
  'failed',
  'completed',
] as const;

export const catalogPlanFixture = {
  explanation: '分步完成鉴权重构与测试补齐',
  plan: [
    { step: '阅读 auth_service 与现有测试', status: 'completed' as const },
    { step: '实现 TOTP 校验与 Session 边界', status: 'in_progress' as const },
    { step: '补充 pytest 并跑通 bash', status: 'pending' as const },
  ],
};

export const catalogFollowUpFixture = [
  { id: 'fu1', content: '补充 jwt_handler 回归用例', status: 'pending' as const },
  { id: 'fu2', content: '导出覆盖率 HTML 报告', status: 'pending' as const },
];

export const catalogArtifactBlock = {
  fileName: 'test_auth_2fa.py',
  versionNumber: 2,
  fileKind: 'text' as const,
  status: 'ready' as const,
};

export const catalogContextFixture = {
  estimatedInputTokens: 12400,
  promptBudget: 64000,
  compactionTriggered: true,
  roundSequence: 3,
};

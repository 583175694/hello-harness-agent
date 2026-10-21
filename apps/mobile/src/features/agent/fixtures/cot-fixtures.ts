import type { ToolActivityFixture } from './ui-fixtures';

export type CotStepFixture = {
  id: string;
  title: string;
  status: 'complete' | 'active' | 'pending';
  domains?: string[];
  tool?: ToolActivityFixture;
};

export const catalogCotFixture = {
  elapsedLabel: '已用时 44 秒',
  steps: [
    {
      id: 's1',
      title: '搜索公开来源',
      status: 'complete' as const,
      domains: ['arxiv.org', 'gov.cn', 'wikipedia.org'],
    },
    {
      id: 's2',
      title: '读取网页原文',
      status: 'complete' as const,
      tool: {
        id: 'fetch-1',
        name: 'web_fetch',
        summary: '(2 个网页 · 1 段原文)',
        status: 'completed' as const,
        duration: '12 秒',
      },
    },
    {
      id: 's3',
      title: '整理证据并撰写回答',
      status: 'active' as const,
    },
  ] satisfies CotStepFixture[],
};

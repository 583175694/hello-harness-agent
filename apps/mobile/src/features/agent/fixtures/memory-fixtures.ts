export type MemoryKind =
  | 'preference'
  | 'workflow'
  | 'format'
  | 'correction'
  | 'identity_context';

export type MemoryFixture = {
  memoryId: string;
  kind: MemoryKind;
  title: string;
  summary: string;
  indexingStatus: 'ready' | 'pending' | 'failed';
};

export const MEMORY_KIND_LABEL: Record<MemoryKind, string> = {
  preference: '偏好',
  workflow: '流程',
  format: '格式',
  correction: '更正',
  identity_context: '身份',
};

export const memoryFixtures: MemoryFixture[] = [
  {
    memoryId: 'mem-1',
    kind: 'preference',
    title: '报告语言',
    summary: '技术报告默认使用简体中文，保留英文术语。',
    indexingStatus: 'ready',
  },
  {
    memoryId: 'mem-2',
    kind: 'workflow',
    title: '测试优先',
    summary: '重构 auth 模块时先补 pytest，再改实现。',
    indexingStatus: 'ready',
  },
  {
    memoryId: 'mem-3',
    kind: 'correction',
    title: 'JWT 旋转',
    summary: 'refresh token 必须校验 sliding window，勿仅校验 exp。',
    indexingStatus: 'pending',
  },
];

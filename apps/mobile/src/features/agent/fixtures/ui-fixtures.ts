export type WorkspaceView = 'activity' | 'sources' | 'artifact' | 'report' | 'context';

export type ToolActivityStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export type ToolActivityFixture = {
  id: string;
  name: string;
  summary: string;
  status?: ToolActivityStatus;
  statusLabel?: string;
  statusTone?: 'success' | 'neutral' | 'danger' | 'muted';
  duration?: string;
};

export type SourceFixture = {
  id: string;
  domain: string;
  title: string;
  excerpt: string;
  badge: string;
  badgeTone: 'success' | 'muted';
  expanded?: boolean;
  passage?: {
    heading: string;
    chunk: string;
    tags: string[];
  };
};

export type ArtifactFixture = {
  id: string;
  name: string;
  version: string;
  description: string;
  selected?: boolean;
};

export const sessionFixture = {
  title: 'agent-auth-refactor',
  branch: 'main',
  runStatus: '运行中',
  workbenchCount: 3,
  modelMeta: '今天 14:28 · 模型 deepseek-coder-v2.5',
};

export const userMessageFixture =
  '重构 auth_service.py 并补充双因子验证(2FA)的单元测试，同时检查对 jwt_handler 的影响。';

export const assistantIntroFixture =
  '已分析当前鉴权链路。正在提取 auth_service.py 中的 Session 校验逻辑，并为 TOTP 双因子流程构建测试桩。';

export const toolActivitiesFixture: ToolActivityFixture[] = [
  {
    id: '1',
    name: 'read_file_lines',
    summary: '(services/auth_service.py:1-85)',
    status: 'completed',
    duration: '420ms',
  },
  {
    id: '2',
    name: 'bash',
    summary: '(pytest tests/test_auth_2fa.py -v...)',
    status: 'completed',
    statusLabel: '已执行',
    statusTone: 'success',
  },
  {
    id: '3',
    name: 'create_file',
    summary: '(tests/test_auth_2fa.py)',
    status: 'completed',
    statusLabel: '+42行',
    statusTone: 'success',
  },
];

export const sourcesFixture: SourceFixture[] = [
  {
    id: 's1',
    domain: 'pyauth.readthedocs.io/en/latest/totp',
    title: 'RFC 6238 TOTP 算法在 Python 异步鉴权中的实现规范',
    excerpt: '',
    badge: '采用',
    badgeTone: 'success',
    expanded: true,
    passage: {
      heading: '§ 4.2 验证窗口与反重放机制',
      chunk:
        '客户端生成之验证码应在 +/- 1 步长（30s）内予以采纳。为防止时钟漂移引起鉴权抖动，服务端应缓存前序已核销之 token_id 并严格记录重放防御拦截器...',
      tags: ['TOTP', 'Window=1', 'FastAPI Middleware'],
    },
  },
  {
    id: 's2',
    domain: 'github.com/fastapi/jwt-auth/issues/142',
    title: 'Issue: JWT Session 冲突与多因子鉴权拦截中间件设计',
    excerpt:
      '若启用 2FA，中间件需首先核验临时 Token (token_type=mfa_pending)，避免直接签发主令牌造成越权访问漏洞...',
    badge: '采用',
    badgeTone: 'success',
  },
  {
    id: 's3',
    domain: 'docs.pytest.org/en/7.4.x/how-to/monkeypatch',
    title: 'Pytest Fixtures 针对 TOTP 时间戳 Mocking 的最佳实践',
    excerpt:
      '通过 freezer 或 monkeypatch 冻结 time.time() 以便确实验证固定密钥的 token_id 生成一致性与过期测试用例...',
    badge: '已读',
    badgeTone: 'muted',
  },
];

export const artifactsFixture: ArtifactFixture[] = [
  {
    id: 'a1',
    name: 'auth_service.py',
    version: 'v1.2',
    description: '已更新 Session 拦截逻辑',
  },
  {
    id: 'a2',
    name: 'test_auth_2fa.py',
    version: 'v2.0',
    description: '新增 TOTP 验证用例 (当前查看)',
    selected: true,
  },
  {
    id: 'a3',
    name: 'jwt_handler.py',
    version: 'v1.0',
    description: '签名有效期比对通过',
  },
];

export type SessionDrawerItemFixture = {
  id: string;
  title: string;
  time: string;
  active?: boolean;
  pinned?: boolean;
  /** 有进行中的 Run 时显示绿点 */
  running?: boolean;
};

/** 置顶在前；Mobile Drawer 仅展示标题 + 时间 */
export const sessionDrawerFixture: SessionDrawerItemFixture[] = [
  {
    id: 'p1',
    title: 'agent-auth-refactor',
    time: '1 分钟前',
    active: true,
    pinned: true,
    running: true,
  },
  {
    id: 'p2',
    title: 'payment-gateway-stripe-webhook',
    time: '4 小时前',
    pinned: true,
  },
  { id: 'r1', title: 'user-profile-api-migration', time: '昨天' },
  { id: 'r2', title: 'redis-caching-layer-opt', time: '3 天前' },
  { id: 'r3', title: 'fix-jwt-token-leak-in-cors', time: '5 天前' },
];

export type ComposerAttachmentFixture = {
  id: string;
  fileName: string;
  size: number;
  kind: 'file' | 'image';
  status: 'ready' | 'processing' | 'failed';
  previewUri?: string;
};

/** UI 骨架：展示附件条样式（无上传逻辑） */
export const composerAttachmentsFixture: ComposerAttachmentFixture[] = [];

export const hitlApprovalFixture = {
  title: '需要批准工具调用',
  shellBadge: 'SHELL',
  command: 'pytest tests/test_auth_2fa.py -v --tb=short',
  sandboxNote: 'Docker 沙箱 #2 · 无外部出站网络 · 预估 3.2s',
};

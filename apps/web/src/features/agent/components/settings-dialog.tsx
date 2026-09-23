import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Moon,
  Plus,
  Puzzle,
  Settings2,
  Sun,
  Trash2,
  Wifi,
  X,
} from 'lucide-react';
import type { McpCreateServerRequest, McpServerView } from '@harness/agent-protocol';
import {
  ApiProblem,
  createMcpServer,
  deleteMcpServer,
  listMcpServers,
  testMcpServer,
} from '../../../api/client';
import {
  CONTENT_FONT_SIZE_DEFAULT,
  CONTENT_FONT_SIZE_MAX,
  CONTENT_FONT_SIZE_MIN,
  type Theme,
} from '../../../theme';
import {
  Dialog,
  DialogAction,
  DialogCancel,
  DialogContent,
  DialogFooter,
} from '../../../components/ui/dialog';
import { toast } from '../../../components/ui/toast';

type SettingsSection = 'general' | 'mcp';

type SettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  contentFontSize: number;
  onContentFontSizeChange: (size: number) => void;
};

const emptyForm: McpCreateServerRequest = {
  serverName: 'demo',
  enabled: true,
  url: 'http://127.0.0.1:8765/mcp',
  headersPlain: {},
  startupTimeoutMs: 30_000,
  toolCallTimeoutMs: 60_000,
  required: false,
  failOnStartupError: false,
  defaultApproval: 'require_approval',
  maxInstructionBytes: 32_768,
  reconnectEnabled: true,
  reconnectMaxAttempts: 5,
};

function mcpStatusLabel(status: McpServerView['status']): string {
  switch (status) {
    case 'connected':
      return '已连接';
    case 'degraded':
      return '降级';
    case 'disconnected':
      return '未连接';
    default:
      return status;
  }
}

function McpStatusBadge({ status }: { status: McpServerView['status'] }) {
  return (
    <span className={`settings-dialog__status settings-dialog__status--${status}`}>
      <span className="settings-dialog__status-dot" aria-hidden="true" />
      {mcpStatusLabel(status)}
    </span>
  );
}

export function SettingsDialog({
  open,
  onOpenChange,
  theme,
  onThemeChange,
  contentFontSize,
  onContentFontSizeChange,
}: SettingsDialogProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [section, setSection] = useState<SettingsSection>('general');
  const [mcpAddOpen, setMcpAddOpen] = useState(false);
  const [servers, setServers] = useState<McpServerView[]>([]);
  const [catalogGeneration, setCatalogGeneration] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<McpCreateServerRequest>(emptyForm);
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listMcpServers();
      setServers(data.servers);
      setCatalogGeneration(data.catalogGeneration);
    } catch (err) {
      setError(err instanceof ApiProblem ? err.problem.detail : '加载 MCP 配置失败。');
      setServers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setSection('general');
    setMcpAddOpen(false);
    setError(null);
    void refresh();
    closeRef.current?.focus();
  }, [open, refresh]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body: McpCreateServerRequest = {
        ...form,
        ...(token.trim()
          ? {
              secrets: [{ kind: 'bearer' as const, name: 'Authorization', value: token.trim() }],
            }
          : {}),
      };
      await createMcpServer(body);
      setToken('');
      toast('MCP Server 已保存并开始连接。', 'success');
      setMcpAddOpen(false);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiProblem ? err.problem.detail : '保存 MCP Server 失败。');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      await deleteMcpServer(id);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiProblem ? err.problem.detail : '删除失败。');
    }
  }

  async function handleTest(id: string) {
    setError(null);
    try {
      const result = await testMcpServer(id);
      if (result.ok) {
        const count = result.toolNames.length;
        toast(
          count > 0 ? `探测成功，共 ${count} 个工具` : '探测成功，未发现工具',
          'success',
        );
        await refresh();
      } else {
        setError(result.error ?? '探测失败。');
      }
    } catch (err) {
      setError(err instanceof ApiProblem ? err.problem.detail : '探测请求失败。');
    }
  }

  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast('URL 已复制到剪贴板。');
    } catch {
      setError('复制失败，请手动选择 URL。');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        variant="settings"
        className="settings-dialog"
        aria-labelledby={titleId}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          closeRef.current?.focus();
        }}
      >
        <div className="settings-dialog__panel">
          <nav className="settings-dialog__nav" aria-label="设置分类">
            <div className="settings-dialog__nav-title" id={titleId}>
              设置
            </div>
            <div className="settings-dialog__nav-list">
              <button
                type="button"
                className={`settings-dialog__nav-cell${section === 'general' ? ' is-active' : ''}`}
                aria-current={section === 'general' ? 'true' : undefined}
                onClick={() => {
                  setSection('general');
                  setMcpAddOpen(false);
                  setError(null);
                }}
              >
                <Settings2 size={16} aria-hidden="true" />
                <span>通用</span>
              </button>
              <button
                type="button"
                className={`settings-dialog__nav-cell${section === 'mcp' ? ' is-active' : ''}`}
                aria-current={section === 'mcp' ? 'true' : undefined}
                onClick={() => {
                  setSection('mcp');
                  setError(null);
                }}
              >
                <Puzzle size={16} aria-hidden="true" />
                <span>MCP</span>
                {servers.length > 0 ? (
                  <span className="settings-dialog__nav-count">{servers.length}</span>
                ) : null}
              </button>
            </div>
          </nav>

          <div className="settings-dialog__content">
            <header className="settings-dialog__header">
              <div className="settings-dialog__header-actions" />
              <button
                ref={closeRef}
                type="button"
                className="settings-dialog__close"
                aria-label="关闭"
                onClick={() => onOpenChange(false)}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </header>

            <div className="settings-dialog__options">
              {section === 'general' ? (
                <div className="settings-dialog__section-stack">
                  <div className="settings-dialog__appearance">
                    <div className="settings-dialog__row-title">外观</div>
                    <div className="settings-dialog__theme-cubes" role="group" aria-label="主题风格">
                      <button
                        type="button"
                        className={`settings-dialog__theme-cube${theme === 'light' ? ' is-selected' : ''}`}
                        aria-pressed={theme === 'light'}
                        onClick={() => onThemeChange('light')}
                      >
                        <Sun size={16} aria-hidden="true" />
                        浅色
                      </button>
                      <button
                        type="button"
                        className={`settings-dialog__theme-cube${theme === 'dark' ? ' is-selected' : ''}`}
                        aria-pressed={theme === 'dark'}
                        onClick={() => onThemeChange('dark')}
                      >
                        <Moon size={16} aria-hidden="true" />
                        深色
                      </button>
                    </div>
                  </div>

                  <div className="settings-dialog__row">
                    <div className="settings-dialog__row-text">
                      <div className="settings-dialog__row-title">对话字号</div>
                      <div className="settings-dialog__row-desc">仅影响对话正文与 Markdown 内容</div>
                    </div>
                    <div className="settings-dialog__font-control">
                      <div className="settings-dialog__stepper">
                        <span className="settings-dialog__stepper-value">{contentFontSize}</span>
                        <span className="settings-dialog__stepper-arrows">
                          <button
                            type="button"
                            className="settings-dialog__stepper-arrow"
                            aria-label="增大字号"
                            disabled={contentFontSize >= CONTENT_FONT_SIZE_MAX}
                            onClick={() => onContentFontSizeChange(contentFontSize + 1)}
                          >
                            <ChevronUp size={9} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className="settings-dialog__stepper-arrow"
                            aria-label="减小字号"
                            disabled={contentFontSize <= CONTENT_FONT_SIZE_MIN}
                            onClick={() => onContentFontSizeChange(contentFontSize - 1)}
                          >
                            <ChevronDown size={9} aria-hidden="true" />
                          </button>
                        </span>
                      </div>
                      <span className="settings-dialog__font-unit">px</span>
                      {contentFontSize === CONTENT_FONT_SIZE_DEFAULT ? (
                        <span className="settings-dialog__font-default">默认</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}

              {section === 'mcp' ? (
                <div className="settings-dialog__mcp-page">
                  {error ? <div className="settings-dialog__error-banner">{error}</div> : null}

                  {!mcpAddOpen ? (
                    <>
                      <div className="settings-dialog__mcp-toolbar">
                        <div>
                          <h2 className="settings-dialog__page-heading">MCP Servers</h2>
                          <p className="settings-dialog__page-intro">
                            管理 Streamable HTTP MCP 连接；凭证加密存储，列表不回显 Token。
                          </p>
                        </div>
                        <button
                          type="button"
                          className="settings-dialog__outline-btn"
                          onClick={() => {
                            setMcpAddOpen(true);
                            setError(null);
                          }}
                        >
                          <Plus size={14} aria-hidden="true" />
                          添加 Server
                        </button>
                      </div>
                      <p className="settings-dialog__meta">
                        catalog generation {catalogGeneration}
                        {loading ? ' · 加载中…' : ` · ${servers.length} 个已配置`}
                      </p>
                      <ul className="settings-dialog__mcp-cards">
                        {loading && servers.length === 0 ? (
                          <li className="settings-dialog__empty-card">正在加载…</li>
                        ) : null}
                        {!loading && servers.length === 0 ? (
                          <li className="settings-dialog__empty-card">暂无已配置的 MCP Server</li>
                        ) : null}
                        {servers.map((server) => (
                          <li key={server.id} className="settings-dialog__mcp-card">
                            <div className="settings-dialog__mcp-card-body">
                              <div className="settings-dialog__mcp-card-title">
                                <code>{server.serverName}</code>
                                <McpStatusBadge status={server.status} />
                                <span className="settings-dialog__pill">{server.toolCount} tools</span>
                              </div>
                              <div className="settings-dialog__mcp-url-line">
                                <code className="settings-dialog__mcp-url" title={server.url}>
                                  {server.url}
                                </code>
                                <button
                                  type="button"
                                  className="settings-dialog__icon-btn"
                                  aria-label="复制 URL"
                                  onClick={() => void copyUrl(server.url)}
                                >
                                  <Copy size={14} />
                                </button>
                              </div>
                              {server.lastError ? (
                                <p className="settings-dialog__inline-error">{server.lastError}</p>
                              ) : null}
                            </div>
                            <div className="settings-dialog__mcp-card-actions">
                              <button
                                type="button"
                                className="settings-dialog__icon-btn"
                                aria-label="探测"
                                onClick={() => void handleTest(server.id)}
                              >
                                <Wifi size={16} />
                              </button>
                              <button
                                type="button"
                                className="settings-dialog__icon-btn settings-dialog__icon-btn--danger"
                                aria-label="删除"
                                onClick={() => void handleDelete(server.id)}
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <form className="settings-dialog__form" onSubmit={(e) => void handleCreate(e)}>
                      <h2 className="settings-dialog__page-heading">添加 MCP Server</h2>
                      <label className="settings-dialog__field">
                        <span className="settings-dialog__field-label">Server Name</span>
                        <input
                          className="settings-dialog__field-input settings-dialog__field-input--mono"
                          value={form.serverName}
                          onChange={(e) => setForm((f) => ({ ...f, serverName: e.target.value }))}
                          required
                          pattern="^[A-Za-z0-9_-]+$"
                        />
                      </label>
                      <label className="settings-dialog__field">
                        <span className="settings-dialog__field-label">Endpoint URL</span>
                        <input
                          className="settings-dialog__field-input settings-dialog__field-input--mono"
                          type="url"
                          value={form.url}
                          onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                          required
                        />
                      </label>
                      <label className="settings-dialog__field">
                        <span className="settings-dialog__field-label">Bearer Token（可选）</span>
                        <input
                          className="settings-dialog__field-input settings-dialog__field-input--mono"
                          type="password"
                          autoComplete="off"
                          value={token}
                          onChange={(e) => setToken(e.target.value)}
                          placeholder="保存后不回显"
                        />
                      </label>
                      <label className="settings-dialog__checkbox">
                        <input
                          type="checkbox"
                          checked={form.enabled}
                          onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
                        />
                        启用此服务
                      </label>
                      <label className="settings-dialog__checkbox">
                        <input
                          type="checkbox"
                          checked={form.required}
                          onChange={(e) => setForm((f) => ({ ...f, required: e.target.checked }))}
                        />
                        启动 Run 时必须连接成功
                      </label>
                      <DialogFooter className="settings-dialog__form-footer">
                        <DialogCancel type="button" onClick={() => setMcpAddOpen(false)}>
                          取消
                        </DialogCancel>
                        <DialogAction type="submit" disabled={saving}>
                          {saving ? '保存中…' : '保存并连接'}
                        </DialogAction>
                      </DialogFooter>
                    </form>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

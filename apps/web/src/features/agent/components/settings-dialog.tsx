import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Moon,
  Pencil,
  Plus,
  Puzzle,
  Settings2,
  Sun,
  Trash2,
  Wifi,
  X,
} from 'lucide-react';
import type {
  AuthUserView,
  McpCreateServerRequest,
  McpPatchServerRequest,
  McpServerView,
  McpUpdateServerRequest,
} from '@harness/agent-protocol';
import { AccountSection } from '../../auth/account-section';
import {
  ApiProblem,
  createMcpServer,
  deleteMcpServer,
  listMcpServers,
  patchMcpServer,
  testMcpServer,
  updateMcpServer,
} from '../../../api/client';
import {
  CONTENT_FONT_SIZE_DEFAULT,
  CONTENT_FONT_SIZE_MAX,
  CONTENT_FONT_SIZE_MIN,
  type Theme,
} from '../../../theme';
import { Dialog, DialogContent } from '../../../components/ui/dialog';
import { toast } from '../../../components/ui/toast';
import { McpServerForm, serverViewToForm } from './mcp-server-form';
import {
  McpCardChevron,
  McpServerToggleRow,
  McpStatusBadge,
  McpToolCountPill,
  mcpDegradedActionHint,
} from './mcp-settings-shared';
import { McpToolFilter } from './mcp-tool-filter';

type SettingsSection = 'general' | 'mcp';

type SettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  contentFontSize: number;
  onContentFontSizeChange: (size: number) => void;
  authUser?: AuthUserView | null;
  onAuthUserChange?: (user: AuthUserView) => void;
  onLogout?: () => void;
  onRequestLogin?: () => void;
};

const emptyForm: McpCreateServerRequest = {
  serverName: 'demo',
  enabled: true,
  url: '',
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

function mcpServerPolicySummary(server: McpServerView): string {
  const enabled = server.enabled ? '已启用' : '已停用';
  const approval =
    server.defaultApproval === 'require_approval' ? '执行前需批准' : '自动执行';
  return `${enabled} · ${approval}`;
}

type McpServerCardProps = {
  server: McpServerView;
  expanded: boolean;
  patching: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onPatch: (patch: McpPatchServerRequest, toastMessage: string) => void;
  onTest: () => Promise<string[]>;
  onDelete: () => void;
  onCopyUrl: () => void;
};

function McpServerCard({
  server,
  expanded,
  patching,
  onToggleExpand,
  onEdit,
  onPatch,
  onTest,
  onDelete,
  onCopyUrl,
}: McpServerCardProps) {
  const panelId = `mcp-server-panel-${server.id}`;
  const degradedHint = mcpDegradedActionHint(server);

  return (
    <li className={`settings-dialog__mcp-card${expanded ? ' is-expanded' : ''}`}>
      <div className="settings-dialog__mcp-card-header">
        <button
          type="button"
          className="settings-dialog__mcp-card-trigger"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={onToggleExpand}
        >
          <McpCardChevron expanded={expanded} />
          <span className="settings-dialog__mcp-card-trigger-main">
            <span className="settings-dialog__mcp-card-title">
              <code>{server.serverName}</code>
              <McpStatusBadge status={server.status} />
              <McpToolCountPill server={server} />
            </span>
            {!expanded ? (
              <>
                <span className="settings-dialog__mcp-card-summary">
                  {mcpServerPolicySummary(server)}
                </span>
                {server.lastError ? (
                  <span className="settings-dialog__mcp-card-error">{server.lastError}</span>
                ) : null}
              </>
            ) : null}
          </span>
        </button>
        <div className="settings-dialog__mcp-card-actions">
          <button
            type="button"
            className="settings-dialog__icon-btn"
            aria-label="编辑"
            onClick={onEdit}
          >
            <Pencil size={16} />
          </button>
          <button
            type="button"
            className="settings-dialog__icon-btn"
            aria-label="探测"
            onClick={() => void onTest()}
          >
            <Wifi size={16} />
          </button>
          <button
            type="button"
            className="settings-dialog__icon-btn settings-dialog__icon-btn--danger"
            aria-label="删除"
            onClick={onDelete}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {expanded ? (
        <div id={panelId} className="settings-dialog__mcp-card-panel">
          <div className="settings-dialog__mcp-url-line">
            <code className="settings-dialog__mcp-url" title={server.url}>
              {server.url}
            </code>
            <button
              type="button"
              className="settings-dialog__icon-btn"
              aria-label="复制 URL"
              onClick={onCopyUrl}
            >
              <Copy size={14} />
            </button>
          </div>
          {server.lastError ? (
            <p className="settings-dialog__inline-error">{server.lastError}</p>
          ) : null}
          {degradedHint ? (
            <p className="settings-dialog__mcp-hint">{degradedHint}</p>
          ) : null}
          <div className="settings-dialog__mcp-settings">
            <McpServerToggleRow
              title="启用"
              checked={server.enabled}
              disabled={patching}
              onCheckedChange={(enabled) =>
                onPatch({ enabled }, enabled ? '已启用 MCP Server' : '已停用 MCP Server')
              }
            />
            <McpServerToggleRow
              title="执行前需批准"
              checked={server.defaultApproval === 'require_approval'}
              disabled={patching}
              onCheckedChange={(requireApproval) =>
                onPatch(
                  {
                    defaultApproval: requireApproval ? 'require_approval' : 'auto_execute',
                  },
                  requireApproval ? '已开启工具执行批准' : '已改为自动执行工具',
                )
              }
            />
          </div>
          <McpToolFilter
            server={server}
            disabled={patching}
            onLoadTools={onTest}
            onSave={onPatch}
          />
        </div>
      ) : null}
    </li>
  );
}

type McpFormMode = { kind: 'add' } | { kind: 'edit'; serverId: string };

export function SettingsDialog({
  open,
  onOpenChange,
  theme,
  onThemeChange,
  contentFontSize,
  onContentFontSizeChange,
  authUser,
  onAuthUserChange,
  onLogout,
  onRequestLogin,
}: SettingsDialogProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [section, setSection] = useState<SettingsSection>('general');
  const [mcpFormMode, setMcpFormMode] = useState<McpFormMode | null>(null);
  const [servers, setServers] = useState<McpServerView[]>([]);
  const [catalogGeneration, setCatalogGeneration] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<McpCreateServerRequest>(emptyForm);
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [patchingServerId, setPatchingServerId] = useState<string | null>(null);
  const [expandedMcpIds, setExpandedMcpIds] = useState<Set<string>>(() => new Set());

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
    setMcpFormMode(null);
    setExpandedMcpIds(new Set());
    setError(null);
    if (authUser) void refresh();
    else setServers([]);
    closeRef.current?.focus();
  }, [open, refresh, authUser]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  function openAddForm() {
    setForm(emptyForm);
    setToken('');
    setMcpFormMode({ kind: 'add' });
    setError(null);
  }

  function openEditForm(server: McpServerView) {
    setForm(serverViewToForm(server));
    setToken('');
    setMcpFormMode({ kind: 'edit', serverId: server.id });
    setError(null);
  }

  function buildSecrets() {
    return token.trim()
      ? [{ kind: 'bearer' as const, name: 'Authorization', value: token.trim() }]
      : undefined;
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body: McpCreateServerRequest = {
        ...form,
        ...(buildSecrets() ? { secrets: buildSecrets() } : {}),
      };
      await createMcpServer(body);
      setToken('');
      toast.success('MCP Server 已保存并开始连接。');
      setMcpFormMode(null);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiProblem ? err.problem.detail : '保存 MCP Server 失败。');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(event: React.FormEvent) {
    event.preventDefault();
    if (mcpFormMode?.kind !== 'edit') return;
    setSaving(true);
    setError(null);
    try {
      const body: McpUpdateServerRequest = {
        ...form,
        ...(buildSecrets() ? { secrets: buildSecrets() } : {}),
      };
      await updateMcpServer(mcpFormMode.serverId, body);
      setToken('');
      toast.success('MCP Server 已更新并开始连接。');
      setMcpFormMode(null);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiProblem ? err.problem.detail : '更新 MCP Server 失败。');
    } finally {
      setSaving(false);
    }
  }

  async function handlePatchServer(id: string, patch: McpPatchServerRequest, toastMessage: string) {
    setError(null);
    setPatchingServerId(id);
    const snapshot = servers;
    setServers((current) =>
      current.map((server) => (server.id === id ? { ...server, ...patch } : server)),
    );
    try {
      await patchMcpServer(id, patch);
      await refresh();
      toast.success(toastMessage);
    } catch (err) {
      setServers(snapshot);
      setError(err instanceof ApiProblem ? err.problem.detail : '更新 MCP 配置失败。');
    } finally {
      setPatchingServerId(null);
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

  async function handleTest(id: string): Promise<string[]> {
    setError(null);
    const result = await testMcpServer(id);
    if (result.ok) {
      const count = result.toolNames.length;
      toast.success(
        count > 0 ? `探测成功，共 ${count} 个工具` : '探测成功，未发现工具',
      );
      await refresh();
      return result.toolNames;
    }
    const message = result.error ?? '探测失败。';
    setError(message);
    throw new Error(message);
  }

  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast('URL 已复制到剪贴板。');
    } catch {
      setError('复制失败，请手动选择 URL。');
    }
  }

  const mcpFormVisible = mcpFormMode !== null;

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
                  setMcpFormMode(null);
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

                  {authUser && onAuthUserChange && onLogout ? (
                    <AccountSection
                      user={authUser}
                      onUserChange={onAuthUserChange}
                      onLoggedOut={() => {
                        onOpenChange(false);
                        onLogout();
                      }}
                    />
                  ) : onRequestLogin ? (
                    <div className="settings-dialog__row">
                      <div className="settings-dialog__row-text">
                        <div className="settings-dialog__row-title">账号</div>
                      </div>
                      <button
                        type="button"
                        className="settings-dialog__outline-btn"
                        onClick={onRequestLogin}
                      >
                        登录
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {section === 'mcp' ? (
                <div className="settings-dialog__mcp-page">
                  {error ? <div className="settings-dialog__error-banner">{error}</div> : null}

                  {!authUser ? (
                    <p className="settings-dialog__page-intro">请先登录后再配置 MCP Server。</p>
                  ) : null}

                  {!authUser ? null : !mcpFormVisible ? (
                    <>
                      <div className="settings-dialog__mcp-toolbar">
                        <div>
                          <h2 className="settings-dialog__page-heading">MCP Servers</h2>
                        </div>
                        <button
                          type="button"
                          className="settings-dialog__outline-btn"
                          onClick={openAddForm}
                        >
                          <Plus size={14} aria-hidden="true" />
                          添加 Server
                        </button>
                      </div>
                      <ul className="settings-dialog__mcp-cards">
                        {loading && servers.length === 0 ? (
                          <li className="settings-dialog__empty-card">正在加载…</li>
                        ) : null}
                        {!loading && servers.length === 0 ? (
                          <li className="settings-dialog__empty-card">暂无已配置的 MCP Server</li>
                        ) : null}
                        {servers.map((server) => (
                          <McpServerCard
                            key={server.id}
                            server={server}
                            expanded={expandedMcpIds.has(server.id)}
                            patching={patchingServerId === server.id}
                            onToggleExpand={() =>
                              setExpandedMcpIds((current) => {
                                const next = new Set(current);
                                if (next.has(server.id)) next.delete(server.id);
                                else next.add(server.id);
                                return next;
                              })
                            }
                            onEdit={() => openEditForm(server)}
                            onPatch={(patch, toastMessage) =>
                              void handlePatchServer(server.id, patch, toastMessage)
                            }
                            onTest={() => handleTest(server.id)}
                            onDelete={() => void handleDelete(server.id)}
                            onCopyUrl={() => void copyUrl(server.url)}
                          />
                        ))}
                      </ul>
                    </>
                  ) : mcpFormMode?.kind === 'add' ? (
                    <McpServerForm
                      key="mcp-add"
                      mode="create"
                      heading="添加 MCP Server"
                      form={form}
                      onFormChange={setForm}
                      token={token}
                      onTokenChange={setToken}
                      saving={saving}
                      onSubmit={(e) => void handleCreate(e)}
                      onCancel={() => setMcpFormMode(null)}
                    />
                  ) : mcpFormMode?.kind === 'edit' ? (
                    <McpServerForm
                      key={mcpFormMode.serverId}
                      mode="edit"
                      heading="编辑 MCP Server"
                      form={form}
                      onFormChange={setForm}
                      token={token}
                      onTokenChange={setToken}
                      saving={saving}
                      onSubmit={(e) => void handleUpdate(e)}
                      onCancel={() => setMcpFormMode(null)}
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

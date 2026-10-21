import { useState } from 'react';
import type { McpCreateServerRequest, McpServerView } from '@harness/agent-protocol';
import {
  DialogAction,
  DialogCancel,
  DialogFooter,
} from '../../../components/ui/dialog';
import { McpServerToggleRow } from './mcp-settings-shared';

export function serverViewToForm(server: McpServerView): McpCreateServerRequest {
  return {
    serverName: server.serverName,
    enabled: server.enabled,
    url: server.url,
    headersPlain: server.headersPlain ?? {},
    startupTimeoutMs: server.startupTimeoutMs,
    toolCallTimeoutMs: server.toolCallTimeoutMs,
    required: server.required,
    failOnStartupError: server.failOnStartupError,
    defaultApproval: server.defaultApproval,
    maxInstructionBytes: server.maxInstructionBytes,
    reconnectEnabled: server.reconnectEnabled,
    reconnectMaxAttempts: server.reconnectMaxAttempts,
  };
}

function headersToText(headers: Record<string, string>): string {
  const entries = Object.entries(headers);
  if (!entries.length) return '';
  return JSON.stringify(Object.fromEntries(entries), null, 2);
}

function parseHeadersText(text: string): Record<string, string> {
  const trimmed = text.trim();
  if (!trimmed) return {};
  const parsed = JSON.parse(trimmed) as unknown;
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Headers 必须是 JSON 对象。');
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== 'string') throw new Error(`Header「${key}」的值必须是字符串。`);
    out[key] = value;
  }
  return out;
}

type McpServerFormProps = {
  mode: 'create' | 'edit';
  heading: string;
  form: McpCreateServerRequest;
  onFormChange: (next: McpCreateServerRequest) => void;
  token: string;
  onTokenChange: (value: string) => void;
  saving: boolean;
  onSubmit: (event: React.FormEvent) => void;
  onCancel: () => void;
};

export function McpServerForm({
  mode,
  heading,
  form,
  onFormChange,
  token,
  onTokenChange,
  saving,
  onSubmit,
  onCancel,
}: McpServerFormProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [headersText, setHeadersText] = useState(() => headersToText(form.headersPlain ?? {}));
  const [headersError, setHeadersError] = useState<string | null>(null);

  function applyHeadersFromText(text: string) {
    setHeadersText(text);
    try {
      onFormChange({ ...form, headersPlain: parseHeadersText(text) });
      setHeadersError(null);
    } catch (err) {
      setHeadersError(err instanceof Error ? err.message : 'Headers JSON 无效。');
    }
  }

  return (
    <form
      className="settings-dialog__form"
      onSubmit={(event) => {
        if (headersError) {
          event.preventDefault();
          return;
        }
        try {
          onFormChange({ ...form, headersPlain: parseHeadersText(headersText) });
          setHeadersError(null);
        } catch (err) {
          event.preventDefault();
          setHeadersError(err instanceof Error ? err.message : 'Headers JSON 无效。');
          return;
        }
        onSubmit(event);
      }}
    >
      <h2 className="settings-dialog__page-heading">{heading}</h2>
      <label className="settings-dialog__field">
        <span className="settings-dialog__field-label">Server Name</span>
        <input
          className="settings-dialog__field-input settings-dialog__field-input--mono"
          value={form.serverName}
          onChange={(e) => onFormChange({ ...form, serverName: e.target.value })}
          required
          pattern="^[A-Za-z0-9_-]+$"
          readOnly={mode === 'edit'}
          aria-readonly={mode === 'edit'}
        />
      </label>
      <label className="settings-dialog__field">
        <span className="settings-dialog__field-label">Endpoint URL</span>
        <input
          className="settings-dialog__field-input settings-dialog__field-input--mono"
          type="url"
          value={form.url}
          onChange={(e) => onFormChange({ ...form, url: e.target.value })}
          required
        />
      </label>
      <label className="settings-dialog__field">
        <span className="settings-dialog__field-label">额外 Headers（JSON 对象，可选）</span>
        <textarea
          className="settings-dialog__field-input settings-dialog__field-input--mono settings-dialog__field-textarea"
          rows={3}
          value={headersText}
          onChange={(e) => applyHeadersFromText(e.target.value)}
          placeholder='{"X-Api-Key": "..."}'
        />
        {headersError ? <span className="settings-dialog__field-error">{headersError}</span> : null}
      </label>
      <label className="settings-dialog__field">
        <span className="settings-dialog__field-label">Bearer Token（可选）</span>
        <input
          className="settings-dialog__field-input settings-dialog__field-input--mono"
          type="password"
          autoComplete="off"
          value={token}
          onChange={(e) => onTokenChange(e.target.value)}
          placeholder={mode === 'edit' ? '留空保留原 Token' : '保存后不回显'}
        />
      </label>
      <div className="settings-dialog__form-toggle-block">
        <McpServerToggleRow
          title="启用"
          checked={form.enabled}
          onCheckedChange={(enabled) => onFormChange({ ...form, enabled })}
        />
        <McpServerToggleRow
          title="执行前需批准"
          checked={form.defaultApproval === 'require_approval'}
          onCheckedChange={(requireApproval) =>
            onFormChange({
              ...form,
              defaultApproval: requireApproval ? 'require_approval' : 'auto_execute',
            })
          }
        />
      </div>
      <label className="settings-dialog__checkbox">
        <input
          type="checkbox"
          checked={form.required}
          onChange={(e) => onFormChange({ ...form, required: e.target.checked })}
        />
        启动 Run 时必须连接成功
      </label>
      <button
        type="button"
        className="settings-dialog__link-btn"
        onClick={() => setAdvancedOpen((open) => !open)}
      >
        {advancedOpen ? '收起高级选项' : '高级选项'}
      </button>
      {advancedOpen ? (
        <div className="settings-dialog__advanced-block">
          <label className="settings-dialog__field">
            <span className="settings-dialog__field-label">连接超时（startupTimeoutMs）</span>
            <input
              className="settings-dialog__field-input settings-dialog__field-input--mono"
              type="number"
              min={1000}
              max={120_000}
              value={form.startupTimeoutMs}
              onChange={(e) =>
                onFormChange({ ...form, startupTimeoutMs: Number(e.target.value) || 30_000 })
              }
            />
          </label>
          <label className="settings-dialog__field">
            <span className="settings-dialog__field-label">工具调用超时（toolCallTimeoutMs）</span>
            <input
              className="settings-dialog__field-input settings-dialog__field-input--mono"
              type="number"
              min={1000}
              max={600_000}
              value={form.toolCallTimeoutMs}
              onChange={(e) =>
                onFormChange({ ...form, toolCallTimeoutMs: Number(e.target.value) || 60_000 })
              }
            />
          </label>
          <label className="settings-dialog__field">
            <span className="settings-dialog__field-label">Instructions 上限（maxInstructionBytes）</span>
            <input
              className="settings-dialog__field-input settings-dialog__field-input--mono"
              type="number"
              min={256}
              max={262_144}
              value={form.maxInstructionBytes}
              onChange={(e) =>
                onFormChange({ ...form, maxInstructionBytes: Number(e.target.value) || 32_768 })
              }
            />
          </label>
          <label className="settings-dialog__checkbox">
            <input
              type="checkbox"
              checked={form.failOnStartupError}
              onChange={(e) => onFormChange({ ...form, failOnStartupError: e.target.checked })}
            />
            启动失败时标记为错误（failOnStartupError）
          </label>
          <label className="settings-dialog__checkbox">
            <input
              type="checkbox"
              checked={form.reconnectEnabled}
              onChange={(e) => onFormChange({ ...form, reconnectEnabled: e.target.checked })}
            />
            启用自动重连
          </label>
          <label className="settings-dialog__field">
            <span className="settings-dialog__field-label">重连最大次数</span>
            <input
              className="settings-dialog__field-input settings-dialog__field-input--mono"
              type="number"
              min={0}
              max={100}
              value={form.reconnectMaxAttempts}
              onChange={(e) =>
                onFormChange({ ...form, reconnectMaxAttempts: Number(e.target.value) || 0 })
              }
            />
          </label>
        </div>
      ) : null}
      <DialogFooter className="settings-dialog__form-footer">
        <DialogCancel type="button" onClick={onCancel}>
          取消
        </DialogCancel>
        <DialogAction type="submit" disabled={saving || Boolean(headersError)}>
          {saving ? '保存中…' : mode === 'edit' ? '保存并连接' : '保存并连接'}
        </DialogAction>
      </DialogFooter>
    </form>
  );
}

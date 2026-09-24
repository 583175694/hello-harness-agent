import { ChevronDown } from 'lucide-react';
import type { McpServerView } from '@harness/agent-protocol';

/** degraded / disconnected 时的可操作排查建议（不含 secret）。 */
export function mcpDegradedActionHint(server: McpServerView): string | null {
  if (server.status !== 'degraded' && server.status !== 'disconnected') return null;
  const hints: string[] = [];
  hints.push('请检查 Endpoint URL 是否可从本机访问。');
  const hasBearer =
    server.secretsConfigured.headerNames.includes('Authorization') ||
    server.secretsConfigured.headerNames.some((n) => n.toLowerCase() === 'authorization');
  if (!hasBearer && server.secretsConfigured.headerNames.length === 0) {
    hints.push('若 Server 需要鉴权，请编辑并填写 Bearer Token 或 Header。');
  } else {
    hints.push('若 Token 已过期，请编辑 Server 并更新凭证（留空字段不会清除原 Token）。');
  }
  if (server.required) {
    hints.push('已勾选「启动 Run 时必须连接成功」：连接失败会导致无法创建 Run。');
  }
  hints.push('可点击探测（Wifi）查看即时错误，或暂时关闭「启用」以免阻塞其它 Server。');
  return hints.join(' ');
}

export function mcpStatusLabel(status: McpServerView['status']): string {
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

export function McpStatusBadge({ status }: { status: McpServerView['status'] }) {
  return (
    <span className={`settings-dialog__status settings-dialog__status--${status}`}>
      <span className="settings-dialog__status-dot" aria-hidden="true" />
      {mcpStatusLabel(status)}
    </span>
  );
}

export function SettingsSwitch({
  checked,
  disabled,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="settings-dialog__switch">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => onCheckedChange(event.target.checked)}
      />
      <span className="settings-dialog__switch-track" aria-hidden="true" />
    </label>
  );
}

export function McpServerToggleRow({
  title,
  checked,
  disabled,
  onCheckedChange,
}: {
  title: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="settings-dialog__mcp-toggle">
      <div className="settings-dialog__mcp-toggle-title">{title}</div>
      <SettingsSwitch
        checked={checked}
        disabled={disabled}
        label={title}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

export function McpToolCountPill({ server }: { server: McpServerView }) {
  const exposed = server.toolCountExposed ?? server.toolCount;
  const total = server.toolCountTotal ?? exposed;
  return (
    <span className="settings-dialog__pill">
      可用 {exposed} / 共 {total}
    </span>
  );
}

export function McpCardChevron({ expanded }: { expanded: boolean }) {
  return (
    <ChevronDown
      size={16}
      className={`settings-dialog__mcp-chevron${expanded ? ' is-expanded' : ''}`}
      aria-hidden="true"
    />
  );
}

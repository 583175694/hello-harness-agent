import { useMemo, useState } from 'react';
import type { McpPatchServerRequest, McpServerView } from '@harness/agent-protocol';

type McpToolFilterProps = {
  server: McpServerView;
  disabled: boolean;
  onLoadTools: () => Promise<string[]>;
  onSave: (patch: McpPatchServerRequest, toastMessage: string) => void;
};

export function McpToolFilter({ server, disabled, onLoadTools, onSave }: McpToolFilterProps) {
  const [toolNames, setToolNames] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const filteredNames = useMemo(() => {
    if (!toolNames) return [];
    const q = query.trim().toLowerCase();
    if (!q) return toolNames;
    return toolNames.filter((name) => name.toLowerCase().includes(q));
  }, [toolNames, query]);

  const isSearchActive = query.trim().length > 0;

  async function handleLoad() {
    setLoading(true);
    setLoadError(null);
    try {
      const names = await onLoadTools();
      setToolNames(names);
      if (server.enabledTools?.length) {
        setSelected(new Set(server.enabledTools.filter((n) => names.includes(n))));
      } else {
        setSelected(new Set(names));
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : '加载工具列表失败。');
    } finally {
      setLoading(false);
    }
  }

  function toggle(name: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(name);
      else next.delete(name);
      return next;
    });
  }

  function selectAllInView() {
    if (!toolNames?.length) return;
    setLoadError(null);
    if (isSearchActive) {
      setSelected((current) => {
        const next = new Set(current);
        for (const name of filteredNames) next.add(name);
        return next;
      });
    } else {
      setSelected(new Set(toolNames));
    }
  }

  function deselectAllInView() {
    if (!toolNames?.length) return;
    setLoadError(null);
    if (isSearchActive) {
      setSelected((current) => {
        const next = new Set(current);
        for (const name of filteredNames) next.delete(name);
        return next;
      });
    } else {
      setSelected(new Set());
    }
  }

  function saveFilter() {
    if (!toolNames) return;
    if (selected.size === 0) {
      setLoadError('请至少选择一个工具，或先全选再保存。');
      return;
    }
    const allSelected = selected.size === toolNames.length;
    onSave(
      { enabledTools: allSelected ? null : [...selected].sort() },
      '已保存',
    );
  }

  return (
    <div className="settings-dialog__mcp-tool-filter">
      <div className="settings-dialog__mcp-tool-filter-head">
        <strong>工具列表</strong>
        <div className="settings-dialog__mcp-tool-filter-actions">
          <button
            type="button"
            className="settings-dialog__outline-btn settings-dialog__outline-btn--sm"
            disabled={disabled || loading}
            onClick={() => void handleLoad()}
          >
            {loading ? '加载中…' : '加载工具列表'}
          </button>
          {toolNames ? (
            <button
              type="button"
              className="settings-dialog__outline-btn settings-dialog__outline-btn--sm"
              disabled={disabled}
              onClick={saveFilter}
            >
              保存
            </button>
          ) : null}
        </div>
      </div>
      {loadError ? <p className="settings-dialog__inline-error">{loadError}</p> : null}
      {toolNames ? (
        <>
          <input
            className="settings-dialog__field-input settings-dialog__field-input--mono"
            type="search"
            placeholder="搜索工具名…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="settings-dialog__mcp-tool-filter-list-bar">
            <span className="settings-dialog__meta">
              已选 {selected.size} / 共 {toolNames.length}
              {isSearchActive ? ` · 当前结果 ${filteredNames.length} 个` : null}
            </span>
            <div className="settings-dialog__mcp-tool-filter-list-actions">
              <button
                type="button"
                className="settings-dialog__link-btn"
                disabled={disabled || filteredNames.length === 0}
                onClick={selectAllInView}
              >
                {isSearchActive ? '全选当前结果' : '全选'}
              </button>
              <button
                type="button"
                className="settings-dialog__link-btn"
                disabled={disabled || filteredNames.length === 0}
                onClick={deselectAllInView}
              >
                {isSearchActive ? '全不选当前结果' : '全不选'}
              </button>
            </div>
          </div>
          <ul className="settings-dialog__mcp-tool-list">
            {filteredNames.map((name) => (
              <li key={name}>
                <label className="settings-dialog__mcp-tool-item">
                  <input
                    type="checkbox"
                    checked={selected.has(name)}
                    disabled={disabled}
                    onChange={(e) => toggle(name, e.target.checked)}
                  />
                  <code>{name}</code>
                </label>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

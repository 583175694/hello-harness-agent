import { useCallback, useEffect, useState } from 'react';
import type { MemoryRecordView } from '@harness/agent-protocol';
import {
  createMemory,
  deleteMemory,
  listMemories,
  patchMemorySettings,
  readMemorySettings,
  updateMemory,
} from '../../../api/client';
import {
  DialogAction,
  DialogCancel,
  DialogFooter,
} from '../../../components/ui/dialog';
import { toast } from '../../../components/ui/toast';
import { SettingsSwitch } from './mcp-settings-shared';

const KIND_LABEL: Record<string, string> = {
  preference: '偏好',
  workflow: '流程',
  format: '格式',
  correction: '更正',
  identity_context: '身份',
};

function indexingHint(status: MemoryRecordView['indexingStatus']): string | null {
  if (status === 'failed') return '索引失败';
  if (status === 'pending') return '索引中';
  return null;
}

type MemorySettingsSectionProps = {
  authUser: { id: string } | null | undefined;
};

type MemoryPage = 'hub' | 'list' | 'form';

export function MemorySettingsSection({ authUser }: MemorySettingsSectionProps) {
  const [page, setPage] = useState<MemoryPage>('hub');
  const [memories, setMemories] = useState<MemoryRecordView[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [allowAgentWrite, setAllowAgentWrite] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ kind: 'preference', title: '', content: '' });

  const reload = useCallback(async () => {
    if (!authUser) return;
    setLoading(true);
    setError(null);
    try {
      const [list, settings] = await Promise.all([listMemories(), readMemorySettings()]);
      setMemories(list.memories);
      setActiveCount(list.activeCount);
      setAllowAgentWrite(settings.allowAgentWrite);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '加载记忆失败');
    } finally {
      setLoading(false);
    }
  }, [authUser]);

  useEffect(() => {
    void reload();
  }, [reload]);

  function openCreateForm() {
    setEditingId(null);
    setForm({ kind: 'preference', title: '', content: '' });
    setPage('form');
  }

  function openEditForm(memory: MemoryRecordView) {
    setEditingId(memory.memoryId);
    setForm({ kind: memory.kind, title: memory.title, content: memory.summary });
    setPage('form');
  }

  function closeForm() {
    setEditingId(null);
    setForm({ kind: 'preference', title: '', content: '' });
    setPage(memories.length ? 'list' : 'hub');
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.content.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        await updateMemory(editingId, {
          kind: form.kind,
          title: form.title,
          content: form.content,
        });
        toast('记忆已更新');
      } else {
        await createMemory({
          kind: form.kind,
          title: form.title,
          content: form.content,
        });
        toast('记忆已添加');
      }
      closeForm();
      await reload();
      setPage('list');
    } catch (saveError) {
      toast(saveError instanceof Error ? saveError.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(memoryId: string) {
    try {
      await deleteMemory(memoryId);
      toast('已删除');
      await reload();
    } catch (deleteError) {
      toast(deleteError instanceof Error ? deleteError.message : '删除失败');
    }
  }

  async function toggleAllowAgentWrite(next: boolean) {
    try {
      const settings = await patchMemorySettings({ allowAgentWrite: next });
      setAllowAgentWrite(settings.allowAgentWrite);
    } catch (patchError) {
      toast(patchError instanceof Error ? patchError.message : '更新设置失败');
    }
  }

  if (!authUser) {
    return <p className="settings-dialog__page-intro">请先登录后管理长期记忆。</p>;
  }

  if (page === 'form') {
    return (
      <div className="settings-dialog__mcp-page">
        {error ? <div className="settings-dialog__error-banner">{error}</div> : null}
        <button type="button" className="settings-dialog__memory-back" onClick={closeForm}>
          返回
        </button>
        <form className="settings-dialog__form" onSubmit={(e) => void handleSave(e)}>
          <h2 className="settings-dialog__page-heading">{editingId ? '编辑记忆' : '新增记忆'}</h2>
          <label className="settings-dialog__field">
            <span className="settings-dialog__field-label">类型</span>
            <select
              className="settings-dialog__field-input settings-dialog__field-input--select"
              value={form.kind}
              onChange={(event) => setForm((current) => ({ ...current, kind: event.target.value }))}
            >
              {Object.entries(KIND_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="settings-dialog__field">
            <span className="settings-dialog__field-label">标题</span>
            <input
              className="settings-dialog__field-input"
              value={form.title}
              maxLength={80}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              required
            />
          </label>
          <label className="settings-dialog__field">
            <span className="settings-dialog__field-label">内容</span>
            <textarea
              className="settings-dialog__field-input settings-dialog__field-textarea"
              value={form.content}
              maxLength={500}
              rows={4}
              onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))}
              required
            />
          </label>
          <DialogFooter className="settings-dialog__form-footer">
            <DialogCancel type="button" onClick={closeForm}>
              取消
            </DialogCancel>
            <DialogAction type="submit" disabled={saving}>
              {saving ? '保存中…' : '保存'}
            </DialogAction>
          </DialogFooter>
        </form>
      </div>
    );
  }

  if (page === 'list') {
    return (
      <div className="settings-dialog__mcp-page">
        {error ? <div className="settings-dialog__error-banner">{error}</div> : null}
        <div className="settings-dialog__memory-list-head">
          <button
            type="button"
            className="settings-dialog__memory-back"
            onClick={() => setPage('hub')}
          >
            返回
          </button>
          <button type="button" className="settings-dialog__link-btn" onClick={openCreateForm}>
            新增
          </button>
        </div>
        <h2 className="settings-dialog__page-heading">记忆条目</h2>
        <p className="settings-dialog__meta">共 {activeCount} 条</p>

        <ul className="settings-dialog__memory-list">
          {loading && memories.length === 0 ? (
            <li className="settings-dialog__memory-list-empty">正在加载…</li>
          ) : null}
          {!loading && memories.length === 0 ? (
            <li className="settings-dialog__memory-list-empty">暂无记忆，可点「新增」添加。</li>
          ) : null}
          {memories.map((memory) => {
            const hint = indexingHint(memory.indexingStatus);
            return (
              <li key={memory.memoryId} className="settings-dialog__memory-list-item">
                <button
                  type="button"
                  className="settings-dialog__memory-list-main"
                  onClick={() => openEditForm(memory)}
                >
                  <span className="settings-dialog__memory-list-title">{memory.title}</span>
                  <span className="settings-dialog__memory-list-summary">{memory.summary}</span>
                  {hint ? (
                    <span className="settings-dialog__memory-list-hint">{hint}</span>
                  ) : null}
                </button>
                <button
                  type="button"
                  className="settings-dialog__link-btn settings-dialog__link-btn--danger"
                  onClick={() => void handleDelete(memory.memoryId)}
                >
                  删除
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div className="settings-dialog__mcp-page">
      {error ? <div className="settings-dialog__error-banner">{error}</div> : null}

      <h2 className="settings-dialog__page-heading">记忆</h2>

      <section className="settings-dialog__memory-card" aria-label="记忆设置">
        <div className="settings-dialog__memory-toggle">
          <div className="settings-dialog__memory-toggle-text">
            <span className="settings-dialog__memory-toggle-label">允许 Agent 写入记忆</span>
            <span className="settings-dialog__memory-toggle-desc">
              开启后，对话中 Agent 可调用 memory_write 保存长期记忆；关闭后仅能在下方条目里手动维护。
            </span>
          </div>
          <SettingsSwitch
            checked={allowAgentWrite}
            label="允许 Agent 写入记忆"
            onCheckedChange={(next) => void toggleAllowAgentWrite(next)}
          />
        </div>

        <div className="settings-dialog__memory-card-divider" role="presentation" />

        <button
          type="button"
          className="settings-dialog__memory-nav-row"
          onClick={() => setPage('list')}
        >
          <span>记忆条目</span>
          <span className="settings-dialog__memory-nav-meta">
            {loading ? '加载中…' : `已保存 ${activeCount} 条`}
            <span aria-hidden="true"> ›</span>
          </span>
        </button>
      </section>
    </div>
  );
}

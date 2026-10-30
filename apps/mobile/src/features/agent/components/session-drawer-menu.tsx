import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { showAppAlert } from '@/lib/app-alert';
import type { SessionSummary } from '@harness/agent-protocol';

import { AppModalActionRow } from '@/components/ui/app-modal-action-row';
import { AppModalShell } from '@/components/ui/app-modal-shell';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import {
  SessionDrawerContextMenu,
  type SessionMenuAnchor,
} from './session-drawer-context-menu';

type SessionDrawerMenuProps = {
  session: SessionSummary | null;
  anchor: SessionMenuAnchor | null;
  visible: boolean;
  onClose: () => void;
  onRename: (sessionId: string, title: string) => void;
  onTogglePin: (sessionId: string, isPinned: boolean) => void;
  onDelete: (sessionId: string) => void;
};

export function SessionDrawerMenu({
  session,
  anchor,
  visible,
  onClose,
  onRename,
  onTogglePin,
  onDelete,
}: SessionDrawerMenuProps) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');

  useEffect(() => {
    if (session && visible) {
      setDraftTitle(session.title);
      setRenameOpen(false);
    }
  }, [session, visible]);

  const closeAll = useCallback(() => {
    setRenameOpen(false);
    onClose();
  }, [onClose]);

  const confirmDelete = useCallback(() => {
    if (!session) return;
    closeAll();
    showAppAlert({
      title: '删除会话',
      message: `确定删除「${session.title}」吗？会话中的消息、报告和证据也会一并删除。`,
      buttons: [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: () => onDelete(session.id),
        },
      ],
    });
  }, [closeAll, onDelete, session]);

  if (!session) return null;

  const pinLabel = session.isPinned ? '取消置顶' : '置顶';

  return (
    <>
      <SessionDrawerContextMenu
        visible={visible && !renameOpen}
        anchor={anchor}
        menuKey={session.id}
        pinLabel={pinLabel}
        onDismiss={closeAll}
        onRename={() => setRenameOpen(true)}
        onTogglePin={() => {
          onTogglePin(session.id, !session.isPinned);
          closeAll();
        }}
        onDelete={confirmDelete}
      />

      <AppModalShell
        visible={renameOpen}
        onDismiss={() => setRenameOpen(false)}
        dismissOnScrimPress
      >
        <Text variant="headline" className="mb-3 text-[15px]" fixedSize>
          重命名会话
        </Text>
        <Text variant="body-sm" className="mb-2 font-medium" fixedSize>
          会话标题
        </Text>
        <View className="rounded-control border border-composer-border bg-canvas px-3 py-1">
          <Input
            value={draftTitle}
            onChangeText={setDraftTitle}
            autoFocus
            placeholder="输入标题"
            className="border-0 bg-transparent px-0"
          />
        </View>
        <AppModalActionRow
          cancelLabel="取消"
          onCancel={() => setRenameOpen(false)}
          confirmLabel="保存"
          confirmDisabled={!draftTitle.trim()}
          onConfirm={() => {
            const title = draftTitle.trim();
            if (!title) return;
            onRename(session.id, title);
            setRenameOpen(false);
            closeAll();
          }}
        />
      </AppModalShell>
    </>
  );
}

export type { SessionMenuAnchor };

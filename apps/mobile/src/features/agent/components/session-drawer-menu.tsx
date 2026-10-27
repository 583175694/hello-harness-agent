import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { showAppAlert } from '@/lib/app-alert';
import type { SessionSummary } from '@harness/agent-protocol';

import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';

type SessionDrawerMenuProps = {
  session: SessionSummary | null;
  visible: boolean;
  onClose: () => void;
  onRename: (sessionId: string, title: string) => void;
  onTogglePin: (sessionId: string, isPinned: boolean) => void;
  onDelete: (sessionId: string) => void;
};

export function SessionDrawerMenu({
  session,
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
    showAppAlert({
      title: '删除会话',
      message: `确定删除「${session.title}」吗？会话中的消息、报告和证据也会一并删除。`,
      buttons: [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: () => {
            onDelete(session.id);
            closeAll();
          },
        },
      ],
    });
  }, [closeAll, onDelete, session]);

  if (!session) return null;

  return (
    <>
      <Modal visible={visible && !renameOpen} transparent animationType="fade" onRequestClose={closeAll}>
        <Pressable className="flex-1 justify-end bg-black/40" onPress={closeAll}>
          <Pressable className="rounded-t-2xl bg-canvas px-4 pb-8 pt-3" onPress={(e) => e.stopPropagation()}>
            <Text variant="caption" className="mb-3 text-center text-muted" numberOfLines={1}>
              {session.title}
            </Text>
            <Pressable
              className="min-h-11 justify-center border-b border-composer-border py-2 active:opacity-70"
              onPress={() => setRenameOpen(true)}
            >
              <Text variant="body-sm">重命名</Text>
            </Pressable>
            <Pressable
              className="min-h-11 justify-center border-b border-composer-border py-2 active:opacity-70"
              onPress={() => {
                onTogglePin(session.id, !session.isPinned);
                closeAll();
              }}
            >
              <Text variant="body-sm">{session.isPinned ? '取消置顶' : '置顶'}</Text>
            </Pressable>
            <Pressable
              className="min-h-11 justify-center py-2 active:opacity-70"
              onPress={confirmDelete}
            >
              <Text variant="body-sm" className="text-rejection-text">
                删除
              </Text>
            </Pressable>
            <Pressable className="mt-2 min-h-11 items-center justify-center rounded-lg bg-subtle active:opacity-70" onPress={closeAll}>
              <Text variant="body-sm" className="font-medium">
                取消
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={renameOpen} transparent animationType="fade" onRequestClose={() => setRenameOpen(false)}>
        <Pressable
          className="flex-1 items-center justify-center bg-black/40 px-6"
          onPress={() => setRenameOpen(false)}
        >
          <Pressable
            className="w-full max-w-sm rounded-2xl bg-canvas p-4"
            onPress={(e) => e.stopPropagation()}
          >
            <Text variant="body" className="mb-3 font-semibold">
              重命名会话
            </Text>
            <Input value={draftTitle} onChangeText={setDraftTitle} autoFocus placeholder="会话标题" />
            <View className="mt-4 flex-row justify-end gap-3">
              <Pressable onPress={() => setRenameOpen(false)} className="px-3 py-2 active:opacity-70">
                <Text variant="body-sm" className="text-muted">
                  取消
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  const title = draftTitle.trim();
                  if (!title) return;
                  onRename(session.id, title);
                  setRenameOpen(false);
                  closeAll();
                }}
                className="px-3 py-2 active:opacity-70"
              >
                <Text variant="body-sm" className="font-semibold text-link">
                  保存
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

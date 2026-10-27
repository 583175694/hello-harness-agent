import { memo } from 'react';
import { Image, ScrollView, View } from 'react-native';
import type { FileRef } from '@harness/agent-protocol';
import { Text } from '@/components/ui/text';
import { resolveUserAttachmentImageUri } from '@/lib/resolve-file-preview-url';
import { MessageCopyButton } from './message-copy-button';
import { SkillMentionChip } from './skill-mention-chip';
import { UserAttachmentFileCard } from './user-attachment-file-card';

type UserMessageBubbleProps = {
  content: string;
  pendingState?: 'steer_pending' | 'steer_applied' | 'follow_up_pending';
  attachmentHint?: string;
  attachments?: FileRef[];
  apiBaseUrl?: string;
  skillNames?: string[];
};

const pendingCopy: Record<NonNullable<UserMessageBubbleProps['pendingState']>, string> = {
  steer_pending: '方向调整排队中',
  steer_applied: '已接受，将从下一步生效',
  follow_up_pending: 'Follow-up 排队中',
};

/** 对齐 Web `.message--user` + `.user-message-content` + `bubble-user`（右对齐、约 82% 宽）。 */
export const UserMessageBubble = memo(function UserMessageBubble({
  content,
  pendingState,
  attachmentHint,
  attachments = [],
  apiBaseUrl = '',
  skillNames = [],
}: UserMessageBubbleProps) {
  const imageAttachments = attachments.filter(
    (a) => a.fileKind === 'image' || a.mediaType.toLowerCase().startsWith('image/'),
  );
  const fileAttachments = attachments.filter(
    (a) => !(a.fileKind === 'image' || a.mediaType.toLowerCase().startsWith('image/')),
  );

  return (
    <View className="items-end gap-1">
      {/* 对齐 Web `.user-message-content`：附件与文本同属一条用户消息、同一 max-width 列。 */}
      <View className="max-w-[82%] items-end gap-2">
        {attachments.length > 0 ? (
          <View className="w-full items-end gap-2">
            {imageAttachments.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerClassName="flex-row justify-end gap-2"
                className="max-w-full"
              >
                {imageAttachments.map((attachment) => {
                  const uri = resolveUserAttachmentImageUri(attachment, apiBaseUrl);
                  return (
                    <View
                      key={attachment.fileId}
                      className="h-28 w-28 overflow-hidden rounded-xl border border-composer-border bg-subtle"
                    >
                      {uri ? (
                        <Image source={{ uri }} className="h-full w-full" resizeMode="cover" />
                      ) : (
                        <View className="flex-1 items-center justify-center">
                          <Text variant="caption" className="text-muted">
                            IMG
                          </Text>
                        </View>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            ) : null}
            {fileAttachments.map((attachment) => (
              <UserAttachmentFileCard
                key={attachment.fileId}
                fileName={attachment.fileName}
                size={attachment.size}
              />
            ))}
          </View>
        ) : null}
        {skillNames.length > 0 || content.trim() || (attachmentHint && !attachments.length) ? (
          <View className="w-full rounded-bubble bg-user-bubble px-4 py-2.5">
            {skillNames.length > 0 ? (
              <View className="mb-2 flex-row flex-wrap justify-end">
                {skillNames.map((name) => (
                  <SkillMentionChip key={name} name={name} mode="readonly" />
                ))}
              </View>
            ) : null}
            {content.trim() ? (
              <Text variant="body-sm" className="leading-relaxed text-primary" selectable>
                {content}
              </Text>
            ) : null}
            {attachmentHint && !attachments.length ? (
              <Text variant="caption" className="mt-2 text-muted">
                {attachmentHint}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
      {pendingState ? (
        <Text variant="caption" className="text-muted">
          {pendingCopy[pendingState]}
        </Text>
      ) : null}
      {content.trim() ? <MessageCopyButton text={content} /> : null}
    </View>
  );
});

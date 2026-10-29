import { ChatLine } from './PreviewModels';
import { PreviewUiActionKind } from './PreviewSessionReducer';

export function conversationUserTurnCount(lines: ChatLine[]): number {
  return lines.filter((line: ChatLine) => line.role === 'user').length;
}

/** 用户主动发消息的动作（吸底触发）。 */
export function previewUiActionScrollsConversationToBottom(kind: PreviewUiActionKind): boolean {
  return kind === 'sendText' || kind === 'submitClarification' || kind === 'sendFollowUp';
}

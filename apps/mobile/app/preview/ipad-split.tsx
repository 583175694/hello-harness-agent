import { ChatScreen } from '@/features/agent/screens/chat-screen';

/** iPad 并排：Conversation | Workbench（强制 split） */
export default function IpadSplitPreviewScreen() {
  return <ChatScreen previewState="tool-running-open" forceSplitLayout />;
}

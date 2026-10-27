type ConversationFlush = () => void;

let scrolling = false;
let pendingFlush: ConversationFlush | null = null;

/** 用户拖动列表时暂缓对话 data 提交，避免流式增高与手势抢帧。 */
export const conversationScrollGuard = {
  get isScrolling() {
    return scrolling;
  },
  setScrolling(next: boolean) {
    scrolling = next;
    if (!scrolling && pendingFlush) {
      const flush = pendingFlush;
      pendingFlush = null;
      flush();
    }
  },
  deferWhileScrolling(flush: ConversationFlush) {
    if (!scrolling) {
      flush();
      return;
    }
    pendingFlush = flush;
  },
  /** @internal */
  resetForTests() {
    scrolling = false;
    pendingFlush = null;
  },
};

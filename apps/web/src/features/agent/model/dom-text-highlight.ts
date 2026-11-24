type HighlightRegistryLike = {
  set: (name: string, highlight: unknown) => void;
  delete: (name: string) => void;
};

type HighlightConstructorLike = new (...ranges: AbstractRange[]) => unknown;

const ALL_MATCH_HIGHLIGHT_NAME = 'harness-search-match';
const ACTIVE_MATCH_HIGHLIGHT_NAME = 'harness-search-active';
const MAX_HIGHLIGHT_RANGES = 500;

function getHighlightApi(): {
  registry: HighlightRegistryLike;
  HighlightCtor: HighlightConstructorLike;
} | null {
  if (typeof globalThis === 'undefined') return null;
  const registry = (globalThis.CSS as unknown as { highlights?: HighlightRegistryLike } | undefined)
    ?.highlights;
  const HighlightCtor = (globalThis as unknown as { Highlight?: HighlightConstructorLike })
    .Highlight;
  if (!registry || typeof HighlightCtor !== 'function') return null;
  return { registry, HighlightCtor };
}

export function clearDomSearchHighlights(): void {
  const api = getHighlightApi();
  if (!api) return;
  api.registry.delete(ALL_MATCH_HIGHLIGHT_NAME);
  api.registry.delete(ACTIVE_MATCH_HIGHLIGHT_NAME);
}

/**
 * 使用浏览器原生 CSS Custom Highlight API 对已挂载消息文本绘制无侵入高亮，
 * 不修改 React/Streamdown DOM 树；不支持该 API 的环境自动降级为消息容器高亮。
 */
export function applyDomSearchHighlights(
  container: HTMLElement | null,
  query: string,
  activeMessageId: string | null,
): void {
  const api = getHighlightApi();
  if (!api) return;
  const trimmed = query.trim();
  if (!container || !trimmed) {
    clearDomSearchHighlights();
    return;
  }

  const lowerQuery = trimmed.toLowerCase();
  const queryLen = trimmed.length;
  const allRanges: Range[] = [];
  const activeRanges: Range[] = [];

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (
        parent.closest(
          '.message-actions, .conversation-find-bar, .conversation-message-nav, button, script, style',
        )
      ) {
        return NodeFilter.FILTER_REJECT;
      }
      return node.nodeValue ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });

  let current = walker.nextNode();
  while (current && allRanges.length < MAX_HIGHLIGHT_RANGES) {
    const text = current.nodeValue ?? '';
    const lowerText = text.toLowerCase();
    const row = current.parentElement?.closest<HTMLElement>('[data-message-id]');
    const isActiveRow = Boolean(activeMessageId && row?.dataset.messageId === activeMessageId);

    let searchFrom = 0;
    while (allRanges.length < MAX_HIGHLIGHT_RANGES) {
      const idx = lowerText.indexOf(lowerQuery, searchFrom);
      if (idx < 0) break;
      const range = document.createRange();
      range.setStart(current, idx);
      range.setEnd(current, idx + queryLen);
      allRanges.push(range);
      if (isActiveRow) activeRanges.push(range);
      searchFrom = idx + queryLen;
    }
    current = walker.nextNode();
  }

  if (allRanges.length > 0) {
    api.registry.set(ALL_MATCH_HIGHLIGHT_NAME, new api.HighlightCtor(...allRanges));
  } else {
    api.registry.delete(ALL_MATCH_HIGHLIGHT_NAME);
  }

  if (activeRanges.length > 0) {
    api.registry.set(ACTIVE_MATCH_HIGHLIGHT_NAME, new api.HighlightCtor(...activeRanges));
  } else {
    api.registry.delete(ACTIVE_MATCH_HIGHLIGHT_NAME);
  }
}

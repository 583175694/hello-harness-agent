import '@testing-library/jest-dom/vitest';

class ResizeObserverMock {
  callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element) {
    const entry = {
      target,
      contentRect: new DOMRect(0, 0, 1280, 800),
      borderBoxSize: [{ inlineSize: 1280, blockSize: 800 }],
      contentBoxSize: [{ inlineSize: 1280, blockSize: 800 }],
      devicePixelContentBoxSize: [{ inlineSize: 1280, blockSize: 800 }],
    } satisfies ResizeObserverEntry;
    this.callback([entry], this as unknown as ResizeObserver);
  }

  unobserve() {}

  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;

if (typeof globalThis.DataTransfer === 'undefined') {
  globalThis.DataTransfer = class DataTransfer {
    files = [] as unknown as FileList;
    items = [] as unknown as DataTransferItemList;
    types: readonly string[] = [];
    private readonly store = new Map<string, string>();

    setData(format: string, data: string) {
      this.store.set(format, data);
      this.types = [...this.store.keys()];
    }

    getData(format: string) {
      return this.store.get(format) ?? '';
    }

    clear() {
      this.store.clear();
      this.types = [];
    }
  } as unknown as typeof DataTransfer;
}

if (typeof globalThis.ClipboardEvent === 'undefined') {
  globalThis.ClipboardEvent = class ClipboardEvent extends Event {
    clipboardData: DataTransfer | null;
    constructor(type: string, eventInitDict?: ClipboardEventInit) {
      super(type, eventInitDict);
      this.clipboardData = eventInitDict?.clipboardData ?? null;
    }
  } as typeof ClipboardEvent;
}

Element.prototype.scrollIntoView = function scrollIntoView() {
  /* jsdom stub */
};

if (!Range.prototype.getBoundingClientRect) {
  Range.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return new DOMRect(0, 0, 0, 0);
  };
}

if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = function getClientRects() {
    return {
      length: 0,
      item: () => null,
      [Symbol.iterator]: function* iterator() {},
    } as DOMRectList;
  };
}

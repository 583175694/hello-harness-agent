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

Element.prototype.scrollIntoView = function scrollIntoView() {
  /* jsdom stub */
};

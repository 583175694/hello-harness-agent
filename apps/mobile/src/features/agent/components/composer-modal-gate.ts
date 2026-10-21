/**
 * ComposerBottomDrawer 使用 RN Modal；Workbench 使用 Gorhom BottomSheetModal。
 * iOS 上在前者未完全卸载时 present 后者会静默失败，需等 Modal 动画结束后再 present。
 */
let activeComposerModalCount = 0;
const idleWaiters = new Set<() => void>();

function notifyIdleWaiters() {
  if (activeComposerModalCount > 0) {
    return;
  }
  for (const resolve of idleWaiters) {
    resolve();
  }
  idleWaiters.clear();
}

export function composerModalDidMount() {
  activeComposerModalCount += 1;
}

export function composerModalDidUnmount() {
  activeComposerModalCount = Math.max(0, activeComposerModalCount - 1);
  notifyIdleWaiters();
}

export function waitForComposerModalsIdle(): Promise<void> {
  if (activeComposerModalCount === 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    idleWaiters.add(resolve);
  });
}

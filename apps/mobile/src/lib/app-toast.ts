type AppToastPresenter = (message: string) => void;

let presenter: AppToastPresenter | null = null;

export function registerAppToastPresenter(next: AppToastPresenter | null) {
  presenter = next;
}

/** 轻提示（对齐原生 AppToast / Web toast）。 */
export function showAppToast(message: string) {
  presenter?.(message);
}

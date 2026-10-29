import promptAction from '@ohos.promptAction';

export class AppToast {
  static show(message: string): void {
    try {
      promptAction.showToast({ message: message, duration: 2000 });
    } catch (_e) {
      // Preview：部分 DevEco 环境可能无 toast 能力
    }
  }
}

export interface AppConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel?: () => void;
}

export class AppAlert {
  static confirm(options: AppConfirmOptions): void {
    const cancel = options.cancelLabel ?? '取消';
    AlertDialog.show({
      title: options.title,
      message: options.message,
      primaryButton: {
        value: options.confirmLabel ?? '确认',
        action: () => {
          options.onConfirm();
        },
      },
      secondaryButton: cancel.length > 0 ? {
        value: cancel,
        action: () => {
          options.onCancel?.();
        },
      } : undefined,
    });
  }

  /** 单按钮信息框（替代散落 AlertDialog.show）。 */
  static info(title: string, message: string, onDismiss?: () => void): void {
    AlertDialog.show({
      title: title,
      message: message,
      primaryButton: {
        value: '确定',
        action: () => {
          onDismiss?.();
        },
      },
    });
  }
}

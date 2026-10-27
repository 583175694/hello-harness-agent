import { Alert } from 'react-native';

export type AppAlertButtonStyle = 'default' | 'cancel' | 'destructive';

export type AppAlertButton = {
  text: string;
  style?: AppAlertButtonStyle;
  onPress?: () => void;
};

export type AppAlertOptions = {
  title: string;
  message?: string;
  buttons?: AppAlertButton[];
};

type AppAlertPresenter = (options: AppAlertOptions) => void;

let presenter: AppAlertPresenter | null = null;

export function registerAppAlertPresenter(next: AppAlertPresenter | null) {
  presenter = next;
}

/** 应用内 Alert（Modal 浮卡）；未挂载 Host 时回退系统 Alert。 */
export function showAppAlert(options: AppAlertOptions) {
  if (presenter) {
    presenter(options);
    return;
  }
  Alert.alert(
    options.title,
    options.message,
    options.buttons?.map((button) => ({
      text: button.text,
      style: button.style,
      onPress: button.onPress,
    })),
  );
}

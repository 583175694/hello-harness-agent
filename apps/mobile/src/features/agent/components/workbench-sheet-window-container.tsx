import type { PropsWithChildren } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';
import { AGENT_UI_LAYOUT } from '../config/ui.constants';

/**
 * Gorhom BottomSheetModal 通过 Portal 挂在 Provider 内 HostingContainer 上，
 * 绘制顺序常早于 Chat/Composer 子树，Plan 浮卡（elevation）会叠在 Sheet 上。
 * iOS：FullWindowOverlay；Android：全屏高层 View + elevation。
 */
export function WorkbenchSheetWindowContainer({ children }: PropsWithChildren) {
  if (Platform.OS === 'ios') {
    return <FullWindowOverlay>{children}</FullWindowOverlay>;
  }

  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        {
          zIndex: AGENT_UI_LAYOUT.workbenchSheetZIndex,
          elevation: AGENT_UI_LAYOUT.workbenchSheetElevation,
        },
      ]}
      pointerEvents="box-none"
    >
      {children}
    </View>
  );
}

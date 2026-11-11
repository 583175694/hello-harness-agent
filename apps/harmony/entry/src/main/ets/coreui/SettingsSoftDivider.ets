import { HarnessColors } from './HarnessColors';

/** 设置卡片内淡分割线（左 inset 16，随深浅色切换）。 */
@Component
export struct SettingsSoftDivider {
  @Prop useDark: boolean = false;

  build() {
    Row() {
      Divider()
        .strokeWidth(0.5)
        .color(HarnessColors.settingsDividerColor(this.useDark))
        .width('100%')
    }
    .width('100%')
    .padding({ left: 16 })
  }
}

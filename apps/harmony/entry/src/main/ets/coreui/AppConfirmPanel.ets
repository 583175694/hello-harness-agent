import { HarnessColors } from './HarnessColors';
import { SettingsPillButton } from './SettingsPillButton';
import { SettingsSection } from './SettingsSection';

/** 应用内确认浮层（与重命名卡片同构，替代系统 AlertDialog.confirm）。 */
@Component
export struct AppConfirmPanel {
  @Prop title: string = '';
  @Prop message: string = '';
  @Prop confirmLabel: string = '确认';
  @Prop cancelLabel: string = '取消';
  @Prop destructive: boolean = false;
  @Prop useDark: boolean = false;
  @Prop presentScale: number = 1;
  @Prop presentOpacity: number = 1;
  onCancel: () => void = () => {
  };
  onConfirm: () => void = () => {
  };

  build() {
    Stack({ alignContent: Alignment.Center }) {
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor('#00000040')
        .opacity(this.presentOpacity)
        .onClick(() => this.onCancel())
      Column({ space: 0 }) {
        SettingsSection({
          title: this.title,
          useDark: this.useDark,
        }) {
          Column({ space: 16 }) {
            Text(this.message)
              .fontSize(14)
              .fontColor(HarnessColors.secondaryText(this.useDark))
              .width('100%')
            Row({ space: 12 }) {
              Column() {
                SettingsPillButton({
                  label: this.cancelLabel,
                  useDark: this.useDark,
                  primary: false,
                  onClick: () => this.onCancel(),
                })
              }
              .layoutWeight(1)
              Column() {
                SettingsPillButton({
                  label: this.confirmLabel,
                  useDark: this.useDark,
                  primary: true,
                  destructive: this.destructive,
                  onClick: () => this.onConfirm(),
                })
              }
              .layoutWeight(1)
            }
            .width('100%')
          }
          .width('100%')
        }
      }
      .width('100%')
      .padding({ left: 16, right: 16 })
      .scale({ x: this.presentScale, y: this.presentScale })
      .opacity(this.presentOpacity)
    }
    .width('100%')
    .height('100%')
  }
}

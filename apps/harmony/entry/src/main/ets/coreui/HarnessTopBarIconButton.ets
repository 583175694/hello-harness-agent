import { HarnessColors } from './HarnessColors';
import { harnessPressOpacity } from './HarnessPressScale';

const TOP_BAR_ICON_SIZE: number = 40;
const TOP_BAR_ICON_RADIUS: number = 8;

/** RN `h-10 w-10 rounded-control active:bg-subtle`。 */
@Component
export struct HarnessTopBarIconButton {
  @Prop useDark: boolean = false;
  @Prop accessibilityLabel: string = '';
  @BuilderParam icon: () => void = this.defaultIcon;
  onClick: () => void = () => {
  };
  @State private pressed: boolean = false;

  @Builder
  defaultIcon() {
  }

  build() {
    Row() {
      this.icon();
    }
    .width(TOP_BAR_ICON_SIZE)
    .height(TOP_BAR_ICON_SIZE)
    .justifyContent(FlexAlign.Center)
    .borderRadius(TOP_BAR_ICON_RADIUS)
    .backgroundColor(this.pressed ? HarnessColors.subtleBg(this.useDark) : Color.Transparent)
    .opacity(harnessPressOpacity(this.pressed))
    .accessibilityText(this.accessibilityLabel)
    .onTouch((event: TouchEvent) => {
      if (event.type === TouchType.Down) {
        this.pressed = true;
      }
      if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
        this.pressed = false;
      }
    })
    .onClick(() => this.onClick())
  }
}

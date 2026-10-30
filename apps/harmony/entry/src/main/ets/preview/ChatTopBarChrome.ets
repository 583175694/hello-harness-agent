import { harnessPressOpacity } from '../coreui/HarnessPressScale';
import { HarnessColors } from '../coreui/HarnessColors';

const TOP_BAR_CHROME_SIZE: number = 40;
/** 对齐 mobile-contract `chatTopBarActionCapsule*`：无边框，轻阴影抬升。 */
const TOP_BAR_CAPSULE_PADDING_X: number = 4;
const TOP_BAR_CAPSULE_ICON_GAP: number = 2;
/** 顶栏圆钮 / 胶囊：无边框，极淡阴影 */
const TOP_BAR_CHROME_SHADOW_RADIUS: number = 3;
const TOP_BAR_CHROME_SHADOW_COLOR: string = '#00000008';
const TOP_BAR_CHROME_SHADOW_OFFSET_Y: number = 1;

@Component
export struct ChatTopBarCircleChrome {
  @Prop useDark: boolean = false;
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
    .width(TOP_BAR_CHROME_SIZE)
    .height(TOP_BAR_CHROME_SIZE)
    .justifyContent(FlexAlign.Center)
    .borderRadius(TOP_BAR_CHROME_SIZE / 2)
    .backgroundColor(HarnessColors.surface(this.useDark))
    .shadow({
      radius: TOP_BAR_CHROME_SHADOW_RADIUS,
      color: TOP_BAR_CHROME_SHADOW_COLOR,
      offsetY: TOP_BAR_CHROME_SHADOW_OFFSET_Y,
    })
    .opacity(harnessPressOpacity(this.pressed))
    .onTouch((event: TouchEvent) => {
      if (event.type === TouchType.Down) {
        this.pressed = true;
      } else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
        this.pressed = false;
      }
    })
    .onClick(() => this.onClick())
  }
}

@Component
export struct ChatTopBarCapsuleIcon {
  @Prop useDark: boolean = false;
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
    .width(TOP_BAR_CHROME_SIZE)
    .height(TOP_BAR_CHROME_SIZE)
    .justifyContent(FlexAlign.Center)
    .opacity(harnessPressOpacity(this.pressed))
    .onTouch((event: TouchEvent) => {
      if (event.type === TouchType.Down) {
        this.pressed = true;
      } else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
        this.pressed = false;
      }
    })
    .onClick(() => this.onClick())
  }
}

@Component
export struct ChatTopBarActionCapsule {
  @Prop useDark: boolean = false;
  @BuilderParam content: () => void = this.defaultContent;

  @Builder
  defaultContent() {
  }

  build() {
    Row({ space: TOP_BAR_CAPSULE_ICON_GAP }) {
      this.content();
    }
    .height(TOP_BAR_CHROME_SIZE)
    .padding({ left: TOP_BAR_CAPSULE_PADDING_X, right: TOP_BAR_CAPSULE_PADDING_X })
    .borderRadius(TOP_BAR_CHROME_SIZE / 2)
    .backgroundColor(HarnessColors.surface(this.useDark))
    .shadow({
      radius: TOP_BAR_CHROME_SHADOW_RADIUS,
      color: TOP_BAR_CHROME_SHADOW_COLOR,
      offsetY: TOP_BAR_CHROME_SHADOW_OFFSET_Y,
    })
  }
}

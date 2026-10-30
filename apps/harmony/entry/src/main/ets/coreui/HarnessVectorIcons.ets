/** Gate A：圆角几何占位矢量，对齐 Android Material Rounded / iOS SF 线框感。 */

/** 顶栏会话列表：圆角横线 + 右上状态点。 */
@Component
export struct HarnessSessionDrawerIcon {
  @Prop color: ResourceColor = Color.Black;
  @Prop size: number = 22;
  @Prop stroke: number = 2.5;
  @Prop gap: number = 5;
  private readonly accentDot: string = '#00C4B3';

  build() {
    Stack({ alignContent: Alignment.TopEnd }) {
      Column({ space: this.gap }) {
        Row()
          .width(this.size * 0.78)
          .height(this.stroke)
          .borderRadius(this.stroke / 2)
          .backgroundColor(this.color)
        Row()
          .width(this.size * 0.78)
          .height(this.stroke)
          .borderRadius(this.stroke / 2)
          .backgroundColor(this.color)
        Row()
          .width(this.size * 0.78)
          .height(this.stroke)
          .borderRadius(this.stroke / 2)
          .backgroundColor(this.color)
      }
      .width(this.size)
      .height(this.size)
      .justifyContent(FlexAlign.Center)
      Column()
        .width(this.size * 0.22)
        .height(this.size * 0.22)
        .borderRadius(this.size * 0.11)
        .backgroundColor(this.accentDot)
        .margin({ top: -1, right: -1 })
    }
    .width(this.size)
    .height(this.size)
  }
}

/** 线框气泡 + 中心加号：顶栏新建会话。 */
@Component
export struct HarnessNewChatIcon {
  @Prop color: ResourceColor = Color.Black;
  @Prop size: number = 22;
  @Prop stroke: number = 2;

  build() {
    Stack({ alignContent: Alignment.Center }) {
      Column()
        .width(this.size * 0.88)
        .height(this.size * 0.88)
        .borderRadius(this.size * 0.44)
        .border({ width: this.stroke, color: this.color })
      Row()
        .width(this.size * 0.36)
        .height(this.stroke)
        .borderRadius(this.stroke / 2)
        .backgroundColor(this.color)
      Row()
        .width(this.stroke)
        .height(this.size * 0.36)
        .borderRadius(this.stroke / 2)
        .backgroundColor(this.color)
    }
    .width(this.size)
    .height(this.size)
  }
}

/** 顶栏更多 / 工作台入口：竖向三点。 */
@Component
export struct HarnessMoreVerticalIcon {
  @Prop color: ResourceColor = Color.Black;
  @Prop size: number = 20;
  @Prop dot: number = 2.5;
  @Prop gap: number = 3;

  build() {
    Column({ space: this.gap }) {
      Column().width(this.dot).height(this.dot).borderRadius(this.dot / 2).backgroundColor(this.color)
      Column().width(this.dot).height(this.dot).borderRadius(this.dot / 2).backgroundColor(this.color)
      Column().width(this.dot).height(this.dot).borderRadius(this.dot / 2).backgroundColor(this.color)
    }
    .width(this.size)
    .height(this.size)
    .justifyContent(FlexAlign.Center)
  }
}

/** Lucide align-left：顶栏打开会话列表。 */
@Component
export struct HarnessAlignLeftIcon {
  @Prop color: ResourceColor = Color.Black;
  @Prop size: number = 22;
  @Prop stroke: number = 2.5;
  @Prop gap: number = 4.5;

  build() {
    Column({ space: this.gap }) {
      Row()
        .width(this.size * 0.73)
        .height(this.stroke)
        .borderRadius(this.stroke / 2)
        .backgroundColor(this.color)
      Row()
        .width(this.size * 0.36)
        .height(this.stroke)
        .borderRadius(this.stroke / 2)
        .backgroundColor(this.color)
      Row()
        .width(this.size * 0.55)
        .height(this.stroke)
        .borderRadius(this.stroke / 2)
        .backgroundColor(this.color)
    }
    .width(this.size)
    .height(this.size)
    .justifyContent(FlexAlign.Center)
    .alignItems(HorizontalAlign.Start)
  }
}

@Component
export struct HarnessMenuIcon {
  @Prop color: ResourceColor = Color.Black;
  @Prop barWidth: number = 18;
  @Prop barHeight: number = 2.5;
  @Prop gap: number = 4;

  build() {
    Column({ space: this.gap }) {
      Row()
        .width(this.barWidth)
        .height(this.barHeight)
        .borderRadius(this.barHeight / 2)
        .backgroundColor(this.color)
      Row()
        .width(this.barWidth)
        .height(this.barHeight)
        .borderRadius(this.barHeight / 2)
        .backgroundColor(this.color)
      Row()
        .width(this.barWidth)
        .height(this.barHeight)
        .borderRadius(this.barHeight / 2)
        .backgroundColor(this.color)
    }
    .justifyContent(FlexAlign.Center)
    .alignItems(HorizontalAlign.Center)
  }
}

/** 工作台：圆角方框 + 斜向笔。 */
@Component
export struct HarnessWorkbenchIcon {
  @Prop color: ResourceColor = Color.Black;
  @Prop size: number = 20;
  @Prop stroke: number = 2;
  @Prop corner: number = 4;

  build() {
    Stack({ alignContent: Alignment.Center }) {
      Column()
        .width(this.size)
        .height(this.size)
        .borderRadius(this.corner)
        .border({ width: this.stroke, color: this.color })
      Row()
        .width(this.size * 0.28)
        .height(this.stroke)
        .borderRadius(this.stroke / 2)
        .backgroundColor(this.color)
        .rotate({ angle: 45 })
        .position({ x: this.size * 0.58, y: this.size * 0.32 })
      Row()
        .width(this.size * 0.32)
        .height(this.stroke)
        .borderRadius(this.stroke / 2)
        .backgroundColor(this.color)
        .rotate({ angle: 45 })
        .position({ x: this.size * 0.38, y: this.size * 0.52 })
    }
    .width(this.size)
    .height(this.size)
  }
}

@Component
export struct HarnessPlusIcon {
  @Prop color: ResourceColor = Color.Black;
  @Prop size: number = 20;
  @Prop stroke: number = 2.5;

  build() {
    Stack() {
      Row()
        .width(this.size * 0.55)
        .height(this.stroke)
        .borderRadius(this.stroke / 2)
        .backgroundColor(this.color)
      Row()
        .width(this.stroke)
        .height(this.size * 0.55)
        .borderRadius(this.stroke / 2)
        .backgroundColor(this.color)
    }
    .width(this.size)
    .height(this.size)
  }
}

@Component
export struct HarnessChevronDownIcon {
  @Prop color: ResourceColor = Color.Black;
  @Prop size: number = 12;
  @Prop stroke: number = 2;

  build() {
    Stack() {
      Row()
        .width(this.size * 0.55)
        .height(this.stroke)
        .borderRadius(this.stroke / 2)
        .backgroundColor(this.color)
        .rotate({ angle: 45 })
        .position({ x: this.size * 0.08, y: this.size * 0.38 })
      Row()
        .width(this.size * 0.55)
        .height(this.stroke)
        .borderRadius(this.stroke / 2)
        .backgroundColor(this.color)
        .rotate({ angle: -45 })
        .position({ x: this.size * 0.38, y: this.size * 0.38 })
    }
    .width(this.size)
    .height(this.size * 0.65)
  }
}

@Component
export struct HarnessArrowUpIcon {
  @Prop color: ResourceColor = Color.White;
  @Prop size: number = 16;
  @Prop stroke: number = 2.5;

  build() {
    Stack() {
      Row()
        .width(this.size * 0.5)
        .height(this.stroke)
        .borderRadius(this.stroke / 2)
        .backgroundColor(this.color)
        .rotate({ angle: -45 })
        .position({ x: this.size * 0.12, y: this.size * 0.42 })
      Row()
        .width(this.size * 0.5)
        .height(this.stroke)
        .borderRadius(this.stroke / 2)
        .backgroundColor(this.color)
        .rotate({ angle: 45 })
        .position({ x: this.size * 0.38, y: this.size * 0.42 })
      Row()
        .width(this.stroke)
        .height(this.size * 0.42)
        .borderRadius(this.stroke / 2)
        .backgroundColor(this.color)
        .position({ x: (this.size - this.stroke) / 2, y: this.size * 0.42 })
    }
    .width(this.size)
    .height(this.size)
  }
}

@Component
export struct HarnessCloseIcon {
  @Prop color: ResourceColor = Color.Black;
  @Prop size: number = 14;
  @Prop stroke: number = 2;

  build() {
    Stack() {
      Row()
        .width(this.size * 0.65)
        .height(this.stroke)
        .borderRadius(this.stroke / 2)
        .backgroundColor(this.color)
        .rotate({ angle: 45 })
      Row()
        .width(this.size * 0.65)
        .height(this.stroke)
        .borderRadius(this.stroke / 2)
        .backgroundColor(this.color)
        .rotate({ angle: -45 })
    }
    .width(this.size)
    .height(this.size)
  }
}

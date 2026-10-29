/** Gate A：圆角几何占位矢量，对齐 Android Material Rounded / iOS SF 线框感。 */
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

/** 工作台：Lucide panel-right（圆角线框 + 右侧竖线 x=15/24）。 */
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
      Column()
        .width(this.stroke)
        .height(this.size - this.stroke * 2)
        .borderRadius(this.stroke / 2)
        .backgroundColor(this.color)
        .position({
          x: (this.size * 15) / 24 - this.stroke / 2,
          y: this.stroke,
        })
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

/** Gate A primitive：AppScaffold（顶栏 + 内容区）。 */
@Component
export struct AppScaffold {
  @BuilderParam topBar: () => void = this.defaultTopBar;
  @BuilderParam content: () => void = this.defaultContent;

  @Builder
  defaultTopBar() {
  }

  @Builder
  defaultContent() {
  }

  build() {
    Column() {
      this.topBar()
      Column() {
        this.content()
      }
      .layoutWeight(1)
      .width('100%')
    }
    .width('100%')
    .height('100%')
    .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
  }
}

import { HarnessColors } from '../coreui/HarnessColors';

/** Pattern：Workbench 分段 Tab（对齐 RN WorkbenchSegmentedTabs / AGENT_UI_BUTTON）。 */
@Component
export struct WorkbenchSegmentedTabs {
  @Prop tabs: string[] = [];
  @Prop activeTab: string = 'activity';
  @Prop useDark: boolean = false;
  onTabChange: (tab: string) => void = () => {
  };

  tabLabel(tab: string): string {
    if (tab === 'activity') {
      return '实时跟随';
    }
    if (tab === 'sources') {
      return '来源';
    }
    if (tab === 'report') {
      return '报告';
    }
    if (tab === 'artifact') {
      return '文件';
    }
    return tab;
  }

  build() {
    Row({ space: 0 }) {
      ForEach(this.tabs, (tab: string) => {
        Text(this.tabLabel(tab))
          .fontSize(12)
          .fontWeight(this.activeTab === tab ? FontWeight.Medium : FontWeight.Normal)
          .fontColor(this.activeTab === tab ? '#FFFFFF' :
            HarnessColors.secondaryText(this.useDark))
          .padding({ left: 6, right: 6, top: 6, bottom: 6 })
          .layoutWeight(1)
          .textAlign(TextAlign.Center)
          .backgroundColor(this.activeTab === tab ? HarnessColors.primaryText(this.useDark) :
            Color.Transparent)
          .borderRadius(6)
          .onClick(() => this.onTabChange(tab))
      }, (tab: string) => tab)
    }
    .width('100%')
    .padding(2)
    .backgroundColor(HarnessColors.subtleBg(this.useDark))
    .borderRadius(10)
    .padding({ left: 12, right: 12, top: 6, bottom: 6 })
  }
}

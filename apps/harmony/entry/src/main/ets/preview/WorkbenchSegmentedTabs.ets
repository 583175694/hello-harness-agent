import { HarnessColors } from '../coreui/HarnessColors';
import { PreviewLocalPreferences } from './PreviewLocalPreferences';
import { SlidingSegmentTrack } from './SlidingSegmentTrack';

/** Pattern：Workbench 分段 Tab（滑动高亮，对齐 RN `SlidingSegmentTrack`）。 */
@Component
export struct WorkbenchSegmentedTabs {
  @Prop tabs: string[] = [];
  @Prop activeTab: string = 'activity';
  @Prop useDark: boolean = false;
  @Prop reduceMotion: boolean = PreviewLocalPreferences.reduceMotion;
  onTabChange: (tab: string) => void = () => {
  };

  private activeIndex(): number {
    const idx = this.tabs.indexOf(this.activeTab);
    return idx >= 0 ? idx : 0;
  }

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
    SlidingSegmentTrack({
      segmentCount: this.tabs.length,
      selectedIndex: this.activeIndex(),
      useDark: this.useDark,
      reduceMotion: this.reduceMotion,
    }) {
      Row({ space: 0 }) {
        ForEach(this.tabs, (tab: string) => {
          Text(this.tabLabel(tab))
            .fontSize(12)
            .fontWeight(this.activeTab === tab ? FontWeight.Medium : FontWeight.Normal)
            .fontColor(this.activeTab === tab ? '#FFFFFF' :
              HarnessColors.secondaryText(this.useDark))
            .height(34)
            .layoutWeight(1)
            .textAlign(TextAlign.Center)
            .onClick(() => this.onTabChange(tab))
        }, (tab: string) => tab)
      }
      .width('100%')
    }
    .padding({ left: 12, right: 12, top: 6, bottom: 6 })
  }
}

import { router } from '@kit.ArkUI';
import { AppScaffold } from '../coreui/AppScaffold';
import { AppTopBar } from '../coreui/AppTopBar';
import { HarnessColors } from '../coreui/HarnessColors';
import { SettingsSection } from '../coreui/SettingsSection';
import { SettingsSoftDivider } from '../coreui/SettingsSoftDivider';
import { PreviewLocalPreferences, PreviewMemoryEntry } from '../preview/PreviewLocalPreferences';
import { HarmonyAgentSettingsApi } from '../core/HarmonyAgentSettingsApi';
import { harnessPageTransition } from '../coreui/HarnessPageTransition';

const ROW_MIN_HEIGHT: number = 48;

@Entry
@Component
struct PreviewMemoryPage {
  @State entries: PreviewMemoryEntry[] = [];
  @State allowWrite: boolean = PreviewLocalPreferences.memoryAllowWrite;
  @State themeDark: boolean = PreviewLocalPreferences.themeDark;

  aboutToAppear(): void {
    this.themeDark = PreviewLocalPreferences.themeDark;
    void this.reloadMemoryHub();
  }

  onPageShow(): void {
    this.themeDark = PreviewLocalPreferences.themeDark;
    void this.reloadMemoryHub();
  }

  private async reloadMemoryHub(): Promise<void> {
    if (HarmonyAgentSettingsApi.coreApiEnabled()) {
      try {
        const hub = await HarmonyAgentSettingsApi.loadMemoryHub();
        this.allowWrite = hub.allowWrite;
        this.entries = hub.entries;
        PreviewLocalPreferences.memoryAllowWrite = hub.allowWrite;
        return;
      } catch (_e) {
        // 回落 Preview 本地
      }
    }
    this.entries = PreviewLocalPreferences.listMemory();
    this.allowWrite = PreviewLocalPreferences.memoryAllowWrite;
  }

  pageTransition() {
    harnessPageTransition()
  }

  build() {
    AppScaffold({
      topBar: () => {
        AppTopBar({
          title: '记忆',
          useDark: this.themeDark,
          leadingGlyph: '‹',
          onLeadingClick: () => router.back(),
        })
      },
      content: () => {
        Scroll() {
          Column({ space: 20 }) {
            SettingsSection({ sectionLabel: '写入', useDark: this.themeDark }) {
              Row() {
                Text('允许 Agent 写入记忆')
                  .fontSize(16)
                  .layoutWeight(1)
                  .fontColor(HarnessColors.secondaryText(this.themeDark))
                Toggle({ type: ToggleType.Switch, isOn: this.allowWrite })
                  .selectedColor(HarnessColors.primary)
                  .onChange((on: boolean) => {
                    this.allowWrite = on;
                    PreviewLocalPreferences.memoryAllowWrite = on;
                    if (HarmonyAgentSettingsApi.coreApiEnabled()) {
                      void HarmonyAgentSettingsApi.patchMemorySettings(on);
                    }
                  })
              }
              .width('100%')
              .height(ROW_MIN_HEIGHT)
              .padding({ left: 16, right: 16 })
            }

            SettingsSection({ sectionLabel: '条目', useDark: this.themeDark }) {
              if (this.entries.length === 0) {
                Text('暂无记忆')
                  .fontSize(14)
                  .fontColor(HarnessColors.mutedText(this.themeDark))
                  .width('100%')
                  .padding({ left: 16, top: 14, bottom: 14 })
              } else {
                ForEach(this.entries, (e: PreviewMemoryEntry, index: number) => {
                  Column() {
                    Row() {
                      Text(e.text)
                        .fontSize(15)
                        .fontColor(HarnessColors.secondaryText(this.themeDark))
                        .layoutWeight(1)
                      Text('删除')
                        .fontSize(14)
                        .fontColor(HarnessColors.linkText(this.themeDark))
                        .onClick(() => {
                          if (HarmonyAgentSettingsApi.coreApiEnabled()) {
                            void HarmonyAgentSettingsApi.deleteMemory(e.id).then(() => this.reloadMemoryHub());
                          } else {
                            PreviewLocalPreferences.deleteMemory(e.id);
                            this.entries = PreviewLocalPreferences.listMemory();
                          }
                        })
                    }
                    .width('100%')
                    .height(ROW_MIN_HEIGHT)
                    .padding({ left: 16, right: 16 })
                    if (index < this.entries.length - 1) {
                      SettingsSoftDivider({ useDark: this.themeDark })
                    }
                  }
                }, (e: PreviewMemoryEntry) => e.id)
              }
            }
          }
          .padding({ left: 16, right: 16, top: 8, bottom: 24 })
        }
        .width('100%')
        .height('100%')
        .scrollBar(BarState.Off)
        .backgroundColor(HarnessColors.canvas(this.themeDark))
      },
    })
  }
}

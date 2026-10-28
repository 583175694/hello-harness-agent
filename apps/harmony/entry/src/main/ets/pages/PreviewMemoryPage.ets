import { router } from '@kit.ArkUI';
import { AppButton } from '../coreui/AppButton';
import { AppScaffold } from '../coreui/AppScaffold';
import { AppTextField } from '../coreui/AppTextField';
import { AppTopBar } from '../coreui/AppTopBar';
import { HarnessColors } from '../coreui/HarnessColors';
import { HarnessDivider } from '../coreui/HarnessDivider';
import { SettingsSection } from '../coreui/SettingsSection';
import { PreviewLocalPreferences, PreviewMemoryEntry } from '../preview/PreviewLocalPreferences';

const CONTROL_RADIUS: number = 8;

@Entry
@Component
struct PreviewMemoryPage {
  @State entries: PreviewMemoryEntry[] = [];
  @State draft: string = '';
  @State allowWrite: boolean = PreviewLocalPreferences.memoryAllowWrite;
  @State themeDark: boolean = PreviewLocalPreferences.themeDark;

  aboutToAppear(): void {
    this.entries = PreviewLocalPreferences.listMemory();
    this.allowWrite = PreviewLocalPreferences.memoryAllowWrite;
    this.themeDark = PreviewLocalPreferences.themeDark;
  }

  onPageShow(): void {
    this.themeDark = PreviewLocalPreferences.themeDark;
    this.entries = PreviewLocalPreferences.listMemory();
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
          Column({ space: 12 }) {
            SettingsSection({ title: '写入', useDark: this.themeDark }) {
              Row() {
                Column({ space: 4 }) {
                  Text('允许 Agent 写入记忆')
                    .fontSize(15)
                    .fontColor(HarnessColors.primaryText(this.themeDark))
                  Text('本地开关 · 不调用 API')
                    .fontSize(12)
                    .fontColor(HarnessColors.mutedText(this.themeDark))
                }
                .layoutWeight(1)
                .alignItems(HorizontalAlign.Start)
                Toggle({ type: ToggleType.Switch, isOn: this.allowWrite })
                  .onChange((on: boolean) => {
                    this.allowWrite = on;
                    PreviewLocalPreferences.memoryAllowWrite = on;
                  })
              }
              .width('100%')
            }

            SettingsSection({ title: '新增', useDark: this.themeDark }) {
              Column() {
                AppTextField({
                  label: '记忆条目',
                  placeholder: '输入要记住的内容…',
                  text: this.draft,
                  useDark: this.themeDark,
                  onChange: (v: string) => {
                    this.draft = v;
                  },
                })
              }
              .width('100%')
              .padding({ left: 12, right: 12, top: 4, bottom: 4 })
              .borderRadius(CONTROL_RADIUS)
              .backgroundColor(HarnessColors.canvas(this.themeDark))
              .border({ width: 1, color: HarnessColors.composerBorderColor(this.themeDark) })
              AppButton({
                label: '添加',
                enabled: this.draft.trim().length > 0,
                useDark: this.themeDark,
                onClick: () => {
                  PreviewLocalPreferences.addMemory(this.draft);
                  this.entries = PreviewLocalPreferences.listMemory();
                  this.draft = '';
                },
              })
                .margin({ top: 12 })
            }

            SettingsSection({ title: '条目', useDark: this.themeDark }) {
              if (this.entries.length === 0) {
                Text('暂无记忆').fontSize(14).fontColor(HarnessColors.mutedText(this.themeDark))
              } else {
                ForEach(this.entries, (e: PreviewMemoryEntry, index: number) => {
                  Column() {
                    Row() {
                      Text(e.text)
                        .fontSize(14)
                        .fontColor(HarnessColors.primaryText(this.themeDark))
                        .layoutWeight(1)
                      Text('删除')
                        .fontSize(13)
                        .fontColor(HarnessColors.linkText(this.themeDark))
                        .onClick(() => {
                          PreviewLocalPreferences.deleteMemory(e.id);
                          this.entries = PreviewLocalPreferences.listMemory();
                        })
                    }
                    .width('100%')
                    .padding({ top: 10, bottom: 10 })
                    if (index < this.entries.length - 1) {
                      HarnessDivider({ useDark: this.themeDark })
                    }
                  }
                }, (e: PreviewMemoryEntry) => e.id)
              }
            }
          }
          .padding({ left: 16, right: 16, top: 4, bottom: 24 })
        }
        .width('100%')
        .height('100%')
        .scrollBar(BarState.Off)
        .backgroundColor(HarnessColors.canvas(this.themeDark))
      },
    })
  }
}

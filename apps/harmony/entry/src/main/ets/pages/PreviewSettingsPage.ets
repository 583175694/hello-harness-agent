import { router } from '@kit.ArkUI';
import { AppScaffold } from '../coreui/AppScaffold';
import { AppTextField } from '../coreui/AppTextField';
import { AppTopBar } from '../coreui/AppTopBar';
import { HarnessColors } from '../coreui/HarnessColors';
import { HarnessDivider } from '../coreui/HarnessDivider';
import { SettingsNavRow } from '../coreui/SettingsNavRow';
import { SettingsSection } from '../coreui/SettingsSection';
import { PreviewLocalPreferences } from '../preview/PreviewLocalPreferences';

const PANEL_RADIUS: number = 12;
const CONTROL_RADIUS: number = 8;

@Entry
@Component
struct PreviewSettingsPage {
  @State themeDark: boolean = PreviewLocalPreferences.themeDark;
  @State apiUrl: string = PreviewLocalPreferences.apiUrl;
  @State reduceMotion: boolean = PreviewLocalPreferences.reduceMotion;
  @State contentFontSize: number = PreviewLocalPreferences.contentFontSize;

  onPageShow(): void {
    this.themeDark = PreviewLocalPreferences.themeDark;
  }

  @Builder
  themeChip(label: string, selected: boolean, onPick: () => void) {
    Text(label)
      .fontSize(12)
      .fontColor(HarnessColors.primaryText(this.themeDark))
      .padding({ left: 12, right: 12, top: 6, bottom: 6 })
      .borderRadius(999)
      .backgroundColor(selected ? HarnessColors.subtleBg(this.themeDark) : HarnessColors.surface(this.themeDark))
      .border({
        width: 1,
        color: selected ? HarnessColors.primaryText(this.themeDark) : HarnessColors.composerBorderColor(this.themeDark),
      })
      .onClick(() => onPick())
  }

  @Builder
  stepperButton(label: string, onClick: () => void) {
    Text(label)
      .fontSize(16)
      .fontWeight(FontWeight.Medium)
      .width(32)
      .height(32)
      .textAlign(TextAlign.Center)
      .borderRadius(CONTROL_RADIUS)
      .border({ width: 1, color: HarnessColors.composerBorderColor(this.themeDark) })
      .onClick(() => onClick())
  }

  build() {
    AppScaffold({
      topBar: () => {
        AppTopBar({
          title: '设置',
          useDark: this.themeDark,
          leadingGlyph: '‹',
          onLeadingClick: () => router.back(),
        })
      },
      content: () => {
        Scroll() {
          Column({ space: 12 }) {
            SettingsSection({ title: '通用', useDark: this.themeDark }) {
              Text('主题').fontSize(12).fontColor(HarnessColors.mutedText(this.themeDark))
              Row({ space: 8 }) {
                this.themeChip('跟随系统', !this.themeDark, () => {
                  this.themeDark = false;
                  PreviewLocalPreferences.themeDark = false;
                })
                this.themeChip('深色', this.themeDark, () => {
                  this.themeDark = true;
                  PreviewLocalPreferences.themeDark = true;
                })
              }
              HarnessDivider({ useDark: this.themeDark })
              Row() {
                Text('正文字号').fontSize(15).layoutWeight(1).fontColor(HarnessColors.primaryText(this.themeDark))
                this.stepperButton('−', () => {
                  this.contentFontSize = Math.max(13, this.contentFontSize - 1);
                  PreviewLocalPreferences.contentFontSize = this.contentFontSize;
                })
                Text(`${this.contentFontSize}px`).fontSize(14).padding({ left: 12, right: 12 })
                this.stepperButton('+', () => {
                  this.contentFontSize = Math.min(20, this.contentFontSize + 1);
                  PreviewLocalPreferences.contentFontSize = this.contentFontSize;
                })
              }
              .width('100%')
              HarnessDivider({ useDark: this.themeDark })
              Row() {
                Column({ space: 4 }) {
                  Text('Reduce Motion').fontSize(15).fontColor(HarnessColors.primaryText(this.themeDark))
                  Text('Drawer / Workbench 减少滑动动画（Preview 假保存）')
                    .fontSize(12)
                    .fontColor(HarnessColors.mutedText(this.themeDark))
                }
                .layoutWeight(1)
                .alignItems(HorizontalAlign.Start)
                Toggle({ type: ToggleType.Switch, isOn: this.reduceMotion })
                  .onChange((on: boolean) => {
                    this.reduceMotion = on;
                    PreviewLocalPreferences.reduceMotion = on;
                  })
              }
              .width('100%')
            }

            SettingsSection({ title: 'Agent', useDark: this.themeDark }) {
              SettingsNavRow({
                title: '记忆',
                subtitle: '本地假数据 · UI+Local',
                useDark: this.themeDark,
                onClick: () => router.pushUrl({ url: 'pages/PreviewMemoryPage' }),
              })
              SettingsNavRow({
                title: 'MCP 服务器',
                subtitle: 'CRUD + Test 模拟',
                useDark: this.themeDark,
                onClick: () => router.pushUrl({ url: 'pages/PreviewMcpPage' }),
              })
              SettingsNavRow({
                title: '演示场景',
                subtitle: '切换 Gate A fixture（开发用）',
                useDark: this.themeDark,
                showDivider: false,
                onClick: () => router.pushUrl({ url: 'pages/PreviewMenuPage' }),
              })
            }

            SettingsSection({ title: '连接', useDark: this.themeDark }) {
              Text('API Base URL（仅编辑器 UI）').fontSize(12).fontColor(HarnessColors.mutedText(this.themeDark))
              Column() {
                AppTextField({
                  label: 'http://192.168.x.x:4318',
                  placeholder: 'http://192.168.x.x:4318',
                  text: this.apiUrl,
                  useDark: this.themeDark,
                  onChange: (v: string) => {
                    this.apiUrl = v;
                    PreviewLocalPreferences.apiUrl = v;
                  },
                })
              }
              .width('100%')
              .padding({ left: 12, right: 12, top: 4, bottom: 4 })
              .borderRadius(CONTROL_RADIUS)
              .backgroundColor(HarnessColors.canvas(this.themeDark))
              .border({ width: 1, color: HarnessColors.composerBorderColor(this.themeDark) })
              Text(`当前生效：${this.apiUrl.trim().length > 0 ? this.apiUrl : '（未填 — Phase B 联调后生效）'}`)
                .fontSize(12)
                .fontColor(HarnessColors.mutedText(this.themeDark))
            }

            Text('Phase A：所有保存均为本地 KV，不发起 Harness HTTP。')
              .fontSize(12)
              .fontColor(HarnessColors.mutedText(this.themeDark))
              .padding(12)
              .width('100%')
              .backgroundColor(HarnessColors.subtleBg(this.themeDark))
              .borderRadius(PANEL_RADIUS)
              .border({ width: 1, color: HarnessColors.composerBorderColor(this.themeDark) })
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

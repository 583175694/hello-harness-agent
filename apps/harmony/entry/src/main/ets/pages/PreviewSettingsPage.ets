import { router } from '@kit.ArkUI';
import { AppScaffold } from '../coreui/AppScaffold';
import { AppTopBar } from '../coreui/AppTopBar';
import { HarnessColors } from '../coreui/HarnessColors';
import { SettingsNavRow } from '../coreui/SettingsNavRow';
import { SettingsSoftDivider } from '../coreui/SettingsSoftDivider';
import { SettingsSection } from '../coreui/SettingsSection';
import { AppToast } from '../coreui/AppFeedback';
import { SettingsPillButton } from '../coreui/SettingsPillButton';
import { PreviewComposerBlockKind } from '../preview/PreviewAuth';
import { PreviewLocalPreferences } from '../preview/PreviewLocalPreferences';
import { harnessPageTransition } from '../coreui/HarnessPageTransition';

@Entry
@Component
struct PreviewSettingsPage {
  @State themeDark: boolean = PreviewLocalPreferences.themeDark;
  @State apiUrl: string = PreviewLocalPreferences.apiUrl;
  @State reduceMotion: boolean = PreviewLocalPreferences.reduceMotion;
  @State contentFontSize: number = PreviewLocalPreferences.contentFontSize;
  @State transcriptBlockDemo: boolean =
    PreviewLocalPreferences.composerBlockDemo === PreviewComposerBlockKind.TRANSCRIPT_INCOMPATIBLE;

  onPageShow(): void {
    this.themeDark = PreviewLocalPreferences.themeDark;
    this.apiUrl = PreviewLocalPreferences.apiUrl;
  }

  private apiSummary(): string {
    const t = this.apiUrl.trim();
    if (t.length === 0) {
      return '未配置';
    }
    return t.length > 18 ? `${t.substring(0, 18)}…` : t;
  }

  private themeLabel(): string {
    return this.themeDark ? '深色' : '浅色';
  }

  private cycleTheme(): void {
    this.themeDark = !this.themeDark;
    PreviewLocalPreferences.themeDark = this.themeDark;
  }

  @Builder
  fontSizeStepper(onDecrement: () => void, onIncrement: () => void) {
    Row() {
      Text('−')
        .fontSize(15)
        .fontColor(HarnessColors.secondaryText(this.themeDark))
        .padding({ left: 10, right: 10, top: 4, bottom: 4 })
        .onClick(() => onDecrement())
      Text(`${this.contentFontSize}`)
        .fontSize(14)
        .fontColor(HarnessColors.mutedText(this.themeDark))
        .padding({ left: 6, right: 6 })
      Text('+')
        .fontSize(15)
        .fontColor(HarnessColors.secondaryText(this.themeDark))
        .padding({ left: 10, right: 10, top: 4, bottom: 4 })
        .onClick(() => onIncrement())
    }
    .borderRadius(8)
    .backgroundColor(HarnessColors.subtle(this.themeDark))
  }

  pageTransition() {
    harnessPageTransition()
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
        Column() {
          Scroll() {
            Column({ space: 20 }) {
            SettingsSection({ sectionLabel: '通用', useDark: this.themeDark }) {
              SettingsNavRow({
                title: '外观',
                trailingValue: this.themeLabel(),
                useDark: this.themeDark,
                showDivider: true,
                onClick: () => this.cycleTheme(),
              })
              Row() {
                Text('正文字号')
                  .fontSize(16)
                  .layoutWeight(1)
                  .fontColor(HarnessColors.secondaryText(this.themeDark))
                this.fontSizeStepper(
                  () => {
                    this.contentFontSize = Math.max(13, this.contentFontSize - 1);
                    PreviewLocalPreferences.contentFontSize = this.contentFontSize;
                  },
                  () => {
                    this.contentFontSize = Math.min(20, this.contentFontSize + 1);
                    PreviewLocalPreferences.contentFontSize = this.contentFontSize;
                  }
                )
              }
              .width('100%')
              .height(48)
              .padding({ left: 16, right: 16 })
              SettingsSoftDivider({ useDark: this.themeDark })
              Row() {
                Text('Reduce Motion')
                  .fontSize(16)
                  .layoutWeight(1)
                  .fontColor(HarnessColors.secondaryText(this.themeDark))
                Toggle({ type: ToggleType.Switch, isOn: this.reduceMotion })
                  .selectedColor(HarnessColors.primary)
                  .onChange((on: boolean) => {
                    this.reduceMotion = on;
                    PreviewLocalPreferences.reduceMotion = on;
                  })
              }
              .width('100%')
              .height(48)
              .padding({ left: 16, right: 16 })
              SettingsSoftDivider({ useDark: this.themeDark })
              if (PreviewLocalPreferences.isLoggedIn && PreviewLocalPreferences.authProfile !== null) {
                SettingsNavRow({
                  title: PreviewLocalPreferences.authProfile.displayName,
                  trailingValue: PreviewLocalPreferences.authProfile.phone,
                  useDark: this.themeDark,
                  showChevron: false,
                  showDivider: false,
                  onClick: () => {
                  },
                })
              } else {
                SettingsNavRow({
                  title: '登录',
                  useDark: this.themeDark,
                  showDivider: false,
                  onClick: () => router.pushUrl({ url: 'pages/PreviewLoginPage' }),
                })
              }
            }

            SettingsSection({ sectionLabel: '开发', useDark: this.themeDark }) {
              Row() {
                Text('Composer 阻断')
                  .fontSize(16)
                  .layoutWeight(1)
                  .fontColor(HarnessColors.secondaryText(this.themeDark))
                Toggle({ type: ToggleType.Switch, isOn: this.transcriptBlockDemo })
                  .selectedColor(HarnessColors.primary)
                  .onChange((on: boolean) => {
                    this.transcriptBlockDemo = on;
                    PreviewLocalPreferences.composerBlockDemo =
                      on ? PreviewComposerBlockKind.TRANSCRIPT_INCOMPATIBLE : PreviewComposerBlockKind.NONE;
                  })
              }
              .width('100%')
              .height(48)
              .padding({ left: 16, right: 16 })
            }

            SettingsSection({ sectionLabel: 'Agent', useDark: this.themeDark }) {
              SettingsNavRow({
                title: '记忆',
                useDark: this.themeDark,
                showDivider: true,
                onClick: () => router.pushUrl({ url: 'pages/PreviewMemoryPage' }),
              })
              SettingsNavRow({
                title: 'MCP 服务器',
                useDark: this.themeDark,
                showDivider: true,
                onClick: () => router.pushUrl({ url: 'pages/PreviewMcpPage' }),
              })
              SettingsNavRow({
                title: '演示场景',
                useDark: this.themeDark,
                showDivider: false,
                onClick: () => router.pushUrl({ url: 'pages/PreviewMenuPage' }),
              })
            }

            SettingsSection({ sectionLabel: '连接', useDark: this.themeDark }) {
              SettingsNavRow({
                title: 'API Base URL',
                trailingValue: this.apiSummary(),
                useDark: this.themeDark,
                showDivider: false,
                onClick: () => router.pushUrl({ url: 'pages/PreviewConnectionPage' }),
              })
            }

            }
            .padding({ left: 16, right: 16, top: 8, bottom: 16 })
          }
          .layoutWeight(1)
          .width('100%')
          .scrollBar(BarState.Off)

          Column({ space: 10 }) {
            if (PreviewLocalPreferences.isLoggedIn) {
              SettingsPillButton({
                label: '退出登录',
                useDark: this.themeDark,
                primary: false,
                onClick: () => {
                  PreviewLocalPreferences.updateAuth(null);
                  AppToast.show('已退出登录');
                },
              })
            }
          }
          .width('100%')
          .padding({ left: 16, right: 16, top: 12, bottom: 16 })
        }
        .width('100%')
        .height('100%')
        .backgroundColor(HarnessColors.canvas(this.themeDark))
      },
    })
  }
}

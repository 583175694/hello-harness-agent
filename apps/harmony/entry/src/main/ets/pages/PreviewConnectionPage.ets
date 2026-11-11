import { router } from '@kit.ArkUI';
import { AppScaffold } from '../coreui/AppScaffold';
import { AppTextField } from '../coreui/AppTextField';
import { AppTopBar } from '../coreui/AppTopBar';
import { HarnessColors } from '../coreui/HarnessColors';
import { SettingsSection } from '../coreui/SettingsSection';
import { PreviewLocalPreferences } from '../preview/PreviewLocalPreferences';
import { harnessPageTransition } from '../coreui/HarnessPageTransition';
import { AppToast } from '../coreui/AppFeedback';
import { getSharedHarmonyMobileEngine } from '../core/CoreAgentSessionPort';

@Entry
@Component
struct PreviewConnectionPage {
  @State themeDark: boolean = PreviewLocalPreferences.themeDark;
  @State apiUrl: string = PreviewLocalPreferences.apiUrl;

  pageTransition() {
    harnessPageTransition()
  }

  build() {
    AppScaffold({
      topBar: () => {
        AppTopBar({
          title: '连接',
          useDark: this.themeDark,
          leadingGlyph: '‹',
          onLeadingClick: () => router.back(),
        })
      },
      content: () => {
        Column() {
          Scroll() {
            Column({ space: 20 }) {
              SettingsSection({ useDark: this.themeDark }) {
                Column({ space: 8 }) {
                  Text(PreviewLocalPreferences.API_BASE_URL)
                    .fontSize(16)
                    .fontColor(HarnessColors.secondary(this.themeDark))
                    .width('100%')
                }
                .width('100%')
                .padding(16)
              }
              SettingsSection({ useDark: this.themeDark, sectionLabel: 'Phase B Core' }) {
                Column({ space: 12 }) {
                  Button('检测 /readyz')
                    .width('100%')
                    .onClick(async () => {
                      const core = getSharedHarmonyMobileEngine();
                      await core.refreshReadiness();
                      AppToast.show(core.snapshot.chrome.serviceState === 'ready' ?
                        'API 就绪' : '无法连接');
                    })
                  Button('打开 Core 联调会话')
                    .width('100%')
                    .onClick(() => {
                      PreviewLocalPreferences.useCorePort = true;
                      router.pushUrl({ url: 'pages/PreviewChatPage', params: { core: '1', title: 'Core 联调' } });
                    })
                }
                .width('100%')
                .padding(16)
              }
            }
            .padding({ left: 16, right: 16, top: 8, bottom: 16 })
          }
          .layoutWeight(1)
          .width('100%')
          .scrollBar(BarState.Off)
        }
        .width('100%')
        .height('100%')
        .backgroundColor(HarnessColors.canvas(this.themeDark))
      },
    })
  }
}

import { router } from '@kit.ArkUI';
import { AppScaffold } from '../coreui/AppScaffold';
import { AppTextField } from '../coreui/AppTextField';
import { AppTopBar } from '../coreui/AppTopBar';
import { HarnessColors } from '../coreui/HarnessColors';
import { SettingsSection } from '../coreui/SettingsSection';
import { PreviewLocalPreferences } from '../preview/PreviewLocalPreferences';
import { harnessPageTransition } from '../coreui/HarnessPageTransition';

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
                  AppTextField({
                    label: 'API Base URL',
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

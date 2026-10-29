import { router } from '@kit.ArkUI';
import { SettingsPillButton } from '../coreui/SettingsPillButton';
import { AppScaffold } from '../coreui/AppScaffold';
import { AppTextField } from '../coreui/AppTextField';
import { AppToast } from '../coreui/AppFeedback';
import { AppTopBar } from '../coreui/AppTopBar';
import { HarnessColors } from '../coreui/HarnessColors';
import { PreviewLocalPreferences } from '../preview/PreviewLocalPreferences';
import { harnessPageTransition } from '../coreui/HarnessPageTransition';

@Entry
@Component
struct PreviewLoginPage {
  @State phone: string = '';
  @State code: string = '';
  @State codeSent: boolean = false;
  @State themeDark: boolean = PreviewLocalPreferences.themeDark;

  pageTransition() {
    harnessPageTransition()
  }

  build() {
    AppScaffold({
      topBar: () => {
        AppTopBar({
          title: '登录',
          useDark: this.themeDark,
          leadingGlyph: '‹',
          onLeadingClick: () => router.back(),
        })
      },
      content: () => {
        Column() {
          Scroll() {
            Column({ space: 20 }) {
              AppTextField({
                label: '手机号',
                placeholder: '11 位手机号',
                text: this.phone,
                useDark: this.themeDark,
                onChange: (v: string) => {
                  this.phone = v;
                },
              })
              if (this.codeSent) {
                AppTextField({
                  label: '验证码',
                  placeholder: '6 位验证码',
                  text: this.code,
                  useDark: this.themeDark,
                  onChange: (v: string) => {
                    this.code = v;
                  },
                })
              }
            }
            .padding({ left: 16, right: 16, top: 8, bottom: 16 })
          }
          .layoutWeight(1)
          .width('100%')
          .scrollBar(BarState.Off)

          Column() {
            SettingsPillButton({
              label: this.primaryLabel(),
              enabled: this.phone.trim().length >= 6,
              useDark: this.themeDark,
              onClick: () => this.submit(),
            })
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

  private primaryLabel(): string {
    if (!this.codeSent) {
      return '发送验证码';
    }
    return this.code.trim().length >= 4 ? '登录' : '请输入验证码';
  }

  private submit(): void {
    const trimmed = this.phone.trim();
    if (trimmed.length < 6) {
      AppToast.show('请输入有效手机号');
      return;
    }
    if (!this.codeSent) {
      this.codeSent = true;
      AppToast.show('验证码已发送');
      return;
    }
    if (this.code.trim().length < 4) {
      AppToast.show('请输入验证码');
      return;
    }
    PreviewLocalPreferences.updateAuth({
      displayName: this.maskPhone(trimmed),
      phone: trimmed,
    });
    AppToast.show('登录成功');
    router.back();
  }

  private maskPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 7) {
      return phone;
    }
    return `${digits.substring(0, 3)}****${digits.substring(digits.length - 4)}`;
  }
}

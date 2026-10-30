import { router } from '@kit.ArkUI';
import { AppToast } from '../coreui/AppFeedback';
import { PreviewLocalPreferences } from '../preview/PreviewLocalPreferences';
import { harnessPageTransition } from '../coreui/HarnessPageTransition';

const LOGIN_BG: string = '#FFFFFF';
const LOGIN_TITLE: string = '#000000';
const LOGIN_SUBTITLE: string = '#999999';
const LOGIN_FIELD_BORDER: string = '#E5E5E5';
const LOGIN_PLACEHOLDER: string = '#BBBBBB';
const LOGIN_FIELD_TEXT: string = '#333333';
const LOGIN_BUTTON: string = '#1A1A1A';
const LOGIN_ICON: string = '#AAAAAA';
const FIELD_RADIUS: number = 14;
const HORIZONTAL_PADDING: number = 24;
const HERO_COMPACT_RATIO: number = 0.62;
const REFERENCE_KEYBOARD_HEIGHT: number = 280;

@Entry
@Component
struct PreviewLoginPage {
  @State phone: string = '';
  @State code: string = '';
  @State codeSent: boolean = false;
  @State themeDark: boolean = PreviewLocalPreferences.themeDark;
  @State layoutHeight: number = 800;
  @State fullLayoutHeight: number = 800;
  @State keyboardOverlap: number = 0;

  pageTransition() {
    harnessPageTransition()
  }

  build() {
    Column() {
      Scroll() {
        Column() {
          this.heroIllustration()
          Text('Your AI Assistant\nIs Here')
            .fontSize(28)
            .fontWeight(FontWeight.Bold)
            .fontColor(LOGIN_TITLE)
            .textAlign(TextAlign.Center)
            .lineHeight(34)
            .margin({ top: this.lerp(24, 12) })
          Text('Always ready to help')
            .fontSize(15)
            .fontColor(LOGIN_SUBTITLE)
            .textAlign(TextAlign.Center)
            .margin({ top: 8 })
          this.phoneField()
          if (this.codeSent) {
            this.codeField()
          }
          this.primaryButton()
        }
        .width('100%')
        .constraintSize({ minHeight: this.availableHeight() })
        .justifyContent(FlexAlign.Center)
        .alignItems(HorizontalAlign.Center)
        .padding({
          left: HORIZONTAL_PADDING,
          right: HORIZONTAL_PADDING,
          top: this.lerp(this.verticalInset(), 12),
          bottom: this.verticalInset(),
        })
      }
      .layoutWeight(1)
      .width('100%')
      .scrollBar(BarState.Off)
    }
    .width('100%')
    .height('100%')
    .backgroundColor(LOGIN_BG)
    .keyboardAvoidMode(KeyboardAvoidMode.RESIZE)
    .onAreaChange((_old, area) => {
      const nextHeight = area.height as number;
      if (nextHeight <= 0) {
        return;
      }
      if (this.keyboardOverlap <= 0) {
        this.fullLayoutHeight = nextHeight;
      }
      this.layoutHeight = nextHeight;
      const overlap = Math.max(0, this.fullLayoutHeight - nextHeight);
      this.keyboardOverlap = overlap;
      if (overlap <= 0) {
        this.fullLayoutHeight = nextHeight;
      }
    })
  }

  private keyboardProgress(): number {
    return Math.min(Math.max(this.keyboardOverlap / REFERENCE_KEYBOARD_HEIGHT, 0), 1);
  }

  private lerp(from: number, to: number): number {
    const t = this.keyboardProgress();
    return from + (to - from) * t;
  }

  private availableHeight(): number {
    return Math.max(this.layoutHeight, 0);
  }

  private verticalInset(): number {
    return Math.min(Math.max(this.fullLayoutHeight * 0.06, 24), 40);
  }

  private expandedHeroHeight(): number {
    return Math.min(Math.max(this.fullLayoutHeight * 0.34, 220), 252);
  }

  private compactHeroHeight(): number {
    return Math.max(this.expandedHeroHeight() * HERO_COMPACT_RATIO, 140);
  }

  private heroHeight(): number {
    return this.lerp(this.expandedHeroHeight(), this.compactHeroHeight());
  }

  @Builder
  heroIllustration() {
    Image($r('app.media.login_hero_illustration'))
      .width('95%')
      .height(this.heroHeight())
      .objectFit(ImageFit.Contain)
  }

  @Builder
  phoneOutlineIcon() {
    Column()
      .width(14)
      .height(22)
      .borderRadius(3)
      .border({ width: 1.5, color: LOGIN_ICON })
      .margin({ right: 10 })
  }

  @Builder
  phoneField() {
    Row() {
      this.phoneOutlineIcon()
      TextInput({ placeholder: 'Enter your phone number', text: this.phone })
        .layoutWeight(1)
        .height(52)
        .fontSize(16)
        .fontColor(LOGIN_FIELD_TEXT)
        .placeholderColor(LOGIN_PLACEHOLDER)
        .backgroundColor(Color.Transparent)
        .border({ width: 0 })
        .padding(0)
        .onChange((v: string) => {
          this.phone = v;
        })
    }
    .width('100%')
    .height(52)
    .margin({ top: this.lerp(32, 20) })
    .padding({ left: 16, right: 16 })
    .borderRadius(FIELD_RADIUS)
    .backgroundColor(Color.White)
    .border({ width: 1, color: LOGIN_FIELD_BORDER })
    .alignItems(VerticalAlign.Center)
  }

  @Builder
  codeField() {
    TextInput({ placeholder: 'Enter verification code', text: this.code })
      .width('100%')
      .height(52)
      .margin({ top: 12 })
      .fontSize(16)
      .fontColor(LOGIN_FIELD_TEXT)
      .placeholderColor(LOGIN_PLACEHOLDER)
      .padding({ left: 16, right: 16 })
      .borderRadius(FIELD_RADIUS)
      .backgroundColor(Color.White)
      .border({ width: 1, color: LOGIN_FIELD_BORDER })
      .onChange((v: string) => {
        this.code = v;
      })
  }

  @Builder
  primaryButton() {
    Text(this.buttonLabel())
      .fontSize(16)
      .fontWeight(FontWeight.Medium)
      .fontColor(Color.White)
      .width('100%')
      .height(52)
      .margin({ top: 16 })
      .textAlign(TextAlign.Center)
      .borderRadius(FIELD_RADIUS)
      .backgroundColor(this.canSubmit() ? LOGIN_BUTTON : '#1A1A1A59')
      .onClick(() => this.submit())
  }

  private buttonLabel(): string {
    return this.codeSent ? 'Log in' : 'Get Verification Code';
  }

  private canSubmit(): boolean {
    const phoneReady = this.phone.trim().length >= 6;
    const codeReady = !this.codeSent || this.code.trim().length >= 4;
    return phoneReady && codeReady;
  }

  private submit(): void {
    const trimmed = this.phone.trim();
    if (trimmed.length < 6) {
      AppToast.show('Please enter a valid phone number');
      return;
    }
    if (!this.codeSent) {
      this.codeSent = true;
      AppToast.show('Verification code sent');
      return;
    }
    if (this.code.trim().length < 4) {
      AppToast.show('Please enter the verification code');
      return;
    }
    PreviewLocalPreferences.updateAuth({
      displayName: this.maskPhone(trimmed),
      phone: trimmed,
    });
    AppToast.show('Logged in');
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

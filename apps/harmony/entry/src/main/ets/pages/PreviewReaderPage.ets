import { router } from '@kit.ArkUI';
import { util } from '@kit.ArkTS';
import { fileIo } from '@kit.CoreFileKit';
import { systemShare } from '@kit.ArkShareKit';
import { common } from '@kit.AbilityKit';
import { AppScaffold } from '../coreui/AppScaffold';
import { AppTopBar } from '../coreui/AppTopBar';
import { AppButton } from '../coreui/AppButton';
import { Spinner } from '../coreui/Spinner';
import { HarnessColors } from '../coreui/HarnessColors';
import { PreviewMarkdownText } from '../coreui/PreviewMarkdownText';
import { PreviewLocalPreferences } from '../preview/PreviewLocalPreferences';
import { HarnessAgentHttp } from '../core/HarnessAgentHttp';
import { getSharedHarmonyMobileEngine } from '../core/CoreAgentSessionPort';

type ReaderStatus = 'loading' | 'empty' | 'error' | 'unsupported' | 'text' | 'image' | 'binary';

interface ArtifactReaderContent {
  artifactId?: string;
  fileId?: string;
  fileName: string;
  mediaType: string;
  fileKind: string;
  data?: ArrayBuffer;
  contentType?: string;
  loaded: boolean;
  error?: string;
}

@Entry
@Component
struct PreviewReaderPage {
  @State title: string = 'Reader';
  @State body: string = '';
  @State isArtifact: boolean = false;
  @State themeDark: boolean = PreviewLocalPreferences.themeDark;
  @State artifactId: string = '';
  @State fileId: string = '';
  @State fileName: string = '';
  @State mediaType: string = '';
  @State fileKind: string = '';
  @State status: ReaderStatus = 'loading';
  @State errorMessage: string = '';
  @State imageScale: number = 1;
  @State imageOffsetX: number = 0;
  @State imageOffsetY: number = 0;
  private gestureScale: number = 1;
  private gestureOffsetX: number = 0;
  private gestureOffsetY: number = 0;
  private payload: ArrayBuffer | undefined = undefined;
  private payloadContentType: string = '';

  aboutToAppear(): void {
    const params = router.getParams() as Record<string, string | boolean>;
    this.title = `${params['title'] ?? 'Reader'}`;
    this.body = `${params['body'] ?? ''}`;
    this.isArtifact = params['isArtifact'] === true || params['isArtifact'] === 'true';
    this.artifactId = `${params['artifactId'] ?? ''}`;
    this.fileId = `${params['fileId'] ?? ''}`;
    this.fileName = `${params['fileName'] ?? this.title}`;
    this.mediaType = `${params['mediaType'] ?? ''}`;
    this.fileKind = `${params['fileKind'] ?? ''}`;
    this.themeDark = PreviewLocalPreferences.themeDark;
    if (this.artifactId.length > 0 || this.fileId.length > 0) {
      void this.loadArtifact();
      return;
    }
    this.imageScale = 1;
    this.imageOffsetX = 0;
    this.imageOffsetY = 0;
    this.gestureScale = 1;
    this.gestureOffsetX = 0;
    this.gestureOffsetY = 0;
    this.status = this.body.trim().length > 0 ? 'text' : 'empty';
  }

  onPageShow(): void {
    this.themeDark = PreviewLocalPreferences.themeDark;
  }

  private async loadArtifact(): Promise<void> {
    this.status = 'loading';
    const engine = getSharedHarmonyMobileEngine();
    try {
      const content =
        this.artifactId.length > 0 ? await engine.previewArtifact(this.artifactId) : await engine.previewFile(this.fileId);
      this.payload = content.data;
      this.payloadContentType = content.contentType.length > 0 ? content.contentType : this.mediaType;
      this.title = content.fileName.length > 0 ? content.fileName : this.fileName;
      this.classify(content.data, this.payloadContentType);
    } catch (error) {
      this.errorMessage = this.readableError(error);
      this.status = 'error';
    }
  }

  private classify(data: ArrayBuffer, contentType: string): void {
    if (data.byteLength === 0) {
      this.status = 'empty';
      return;
    }
    const kind = this.fileKind.toLowerCase();
    const mediaType = this.mediaType.toLowerCase();
    if (kind === 'docx' || kind === 'xlsx' || kind === 'pptx' ||
      mediaType.indexOf('wordprocessingml') >= 0 || mediaType.indexOf('spreadsheetml') >= 0 ||
      mediaType.indexOf('presentationml') >= 0) {
      this.status = 'unsupported';
      return;
    }
    if (contentType.startsWith('image/') || kind === 'image') {
      this.status = 'image';
      return;
    }
    if (contentType.indexOf('html') >= 0 || kind === 'html') {
      this.status = 'unsupported';
      return;
    }
    if (contentType.startsWith('text/') || contentType.indexOf('json') >= 0 ||
      kind === 'markdown' || kind === 'json' || kind === 'text') {
      const decoder = new util.TextDecoder('utf-8', { ignoreBOM: true });
      this.body = decoder.decodeWithStream(data);
      this.status = this.body.trim().length > 0 ? 'text' : 'empty';
      return;
    }
    this.status = 'unsupported';
  }

  private readableError(error: Object): string {
    const message = error instanceof Error ? error.message : `${error}`;
    if (message.indexOf('401') >= 0 || message.indexOf('AUTH_REQUIRED') >= 0) {
      return '登录已失效，请重新登录后重试。';
    }
    if (message.indexOf('404') >= 0 || message.indexOf('NOT_FOUND') >= 0 ||
      message.indexOf('ARTIFACT_DELETED') >= 0) {
      return '文件不存在或已被删除。';
    }
    if (message.toLowerCase().indexOf('timeout') >= 0 || message.toLowerCase().indexOf('connect') >= 0) {
      return '网络连接失败，请检查网络后重试。';
    }
    return message.length > 0 ? message : '请求失败，请稍后重试。';
  }

  private async downloadAndShare(): Promise<void> {
    try {
      const engine = getSharedHarmonyMobileEngine();
      const content =
        this.artifactId.length > 0 ? await engine.downloadArtifact(this.artifactId) :
          await engine.downloadFile(this.fileId);
      const name = content.fileName.length > 0 ? content.fileName : (this.fileName.length > 0 ? this.fileName : 'artifact');
      const path = `${getContext(this).cacheDir}/${name.replace(/\//g, '_')}`;
      const file = fileIo.openSync(path, fileIo.OpenMode.CREATE | fileIo.OpenMode.READ_WRITE | fileIo.OpenMode.TRUNC);
      fileIo.writeSync(file.fd, content.data);
      fileIo.closeSync(file);
      const context = getContext(this) as common.UIAbilityContext;
      await systemShare.ShareData.share({
        uri: `file://${path}`,
        utd: content.contentType.length > 0 ? content.contentType : (this.mediaType.length > 0 ? this.mediaType : 'text/plain'),
        title: name,
      }, { previewMode: systemShare.SharePreviewMode.DETAIL, selectionMode: systemShare.SelectionMode.SINGLE });
      context;
    } catch (error) {
      this.errorMessage = this.readableError(error);
      this.status = 'error';
    }
  }

  private resetImage(): void {
    this.imageScale = 1;
    this.imageOffsetX = 0;
    this.imageOffsetY = 0;
    this.gestureScale = 1;
    this.gestureOffsetX = 0;
    this.gestureOffsetY = 0;
  }

  @Builder
  statePanel(title: string, detail: string, actionLabel: string, onAction: () => void) {
    Column({ space: 10 }) {
      Text(title)
        .fontSize(18)
        .fontWeight(FontWeight.Medium)
        .fontColor(HarnessColors.primaryText(this.themeDark))
      Text(detail)
        .fontSize(14)
        .fontColor(HarnessColors.secondaryText(this.themeDark))
        .textAlign(TextAlign.Center)
      if (actionLabel.length > 0) {
        AppButton({
          label: actionLabel,
          useDark: this.themeDark,
          onClick: onAction,
        })
      }
    }
    .width('100%')
    .layoutWeight(1)
    .padding({ left: 24, right: 24, top: 48 })
    .alignItems(HorizontalAlign.Center)
  }

  build() {
    Column() {
      AppScaffold({
        topBar: () => {
          AppTopBar({
            title: this.title,
            useDark: this.themeDark,
            leadingGlyph: '‹',
            showBottomBorder: false,
            onLeadingClick: () => router.back(),
          })
        },
        content: () => {
          Column() {
            if (this.status === 'loading') {
              Column() {
                Spinner({ useDark: this.themeDark })
              }
              .layoutWeight(1)
              .justifyContent(FlexAlign.Center)
              .width('100%')
            } else if (this.status === 'empty') {
              this.statePanel('内容为空', '该文件暂无可用内容。', '', () => {
              })
            } else if (this.status === 'error') {
              this.statePanel(
                '无法预览',
                this.errorMessage,
                this.artifactId.length > 0 ? '下载并打开' : '重试',
                () => {
                  if (this.artifactId.length > 0) {
                    void this.downloadAndShare();
                  } else if (this.fileId.length > 0) {
                    void this.loadArtifact();
                  }
                },
              )
            } else if (this.status === 'unsupported') {
              this.statePanel('暂不支持内联预览', '可下载后用系统应用打开。', '下载并打开', () => {
                void this.downloadAndShare();
              })
            } else if (this.status === 'image') {
              Stack({ alignContent: Alignment.Center }) {
                Image(this.payload)
                  .width('100%')
                  .height('100%')
                  .objectFit(ImageFit.Contain)
                  .scale({ x: this.imageScale * this.gestureScale, y: this.imageScale * this.gestureScale })
                  .translate({ x: this.imageOffsetX + this.gestureOffsetX, y: this.imageOffsetY + this.gestureOffsetY })
                  .gesture(
                    GestureGroup(GestureMode.Parallel,
                      PinchGesture()
                        .onActionUpdate((event: GestureEvent) => {
                          this.gestureScale = event.scale;
                        })
                        .onActionEnd((event: GestureEvent) => {
                          this.imageScale = Math.min(Math.max(this.imageScale * event.scale, 1), 5);
                          this.gestureScale = 1;
                        }),
                      PanGesture()
                        .onActionUpdate((event: GestureEvent) => {
                          this.gestureOffsetX = event.offsetX;
                          this.gestureOffsetY = event.offsetY;
                        })
                        .onActionEnd((event: GestureEvent) => {
                          if (this.imageScale > 1) {
                            this.imageOffsetX += event.offsetX;
                            this.imageOffsetY += event.offsetY;
                          }
                          this.gestureOffsetX = 0;
                          this.gestureOffsetY = 0;
                        }),
                    ),
                  )
                  .onClick(() => {
                    if (this.imageScale > 1) {
                      this.resetImage();
                    }
                  })
              }
              .layoutWeight(1)
              .width('100%')
              .clip(true)
              .padding(12)
            } else {
              Scroll() {
                Column() {
                  PreviewMarkdownText({
                    markdown: this.body,
                    fontSize: PreviewLocalPreferences.contentFontSize,
                    useDark: this.themeDark,
                  })
                    .width('100%')
                }
                .width('100%')
                .padding({ left: 16, right: 16, top: 8, bottom: 16 })
              }
              .layoutWeight(1)
              .width('100%')
            }
          }
          .layoutWeight(1)
          .width('100%')
          .backgroundColor(HarnessColors.canvas(this.themeDark))
        },
      })
    }
    .width('100%')
    .height('100%')
    .backgroundColor(HarnessColors.canvas(this.themeDark))
  }
}

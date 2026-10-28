import { router } from '@kit.ArkUI';
import { AppButton } from '../coreui/AppButton';
import { AppScaffold } from '../coreui/AppScaffold';
import { AppTextField } from '../coreui/AppTextField';
import { AppTopBar } from '../coreui/AppTopBar';
import { HarnessColors } from '../coreui/HarnessColors';
import { HarnessDivider } from '../coreui/HarnessDivider';
import { SettingsSection } from '../coreui/SettingsSection';
import { PreviewLocalPreferences, PreviewMcpServer } from '../preview/PreviewLocalPreferences';

const CONTROL_RADIUS: number = 8;

@Entry
@Component
struct PreviewMcpPage {
  @State servers: PreviewMcpServer[] = [];
  @State editName: string = '';
  @State editUrl: string = '';
  @State editEnabled: boolean = true;
  @State themeDark: boolean = PreviewLocalPreferences.themeDark;

  aboutToAppear(): void {
    this.servers = PreviewLocalPreferences.listMcp();
    this.themeDark = PreviewLocalPreferences.themeDark;
  }

  onPageShow(): void {
    this.themeDark = PreviewLocalPreferences.themeDark;
    this.servers = PreviewLocalPreferences.listMcp();
  }

  build() {
    AppScaffold({
      topBar: () => {
        AppTopBar({
          title: 'MCP 服务器',
          useDark: this.themeDark,
          leadingGlyph: '‹',
          onLeadingClick: () => router.back(),
        })
      },
      content: () => {
        Scroll() {
          Column({ space: 12 }) {
            Text('列表与表单为静态 UI；Test 为本地 Alert 模拟。')
              .fontSize(12)
              .fontColor(HarnessColors.mutedText(this.themeDark))

            SettingsSection({ title: '已配置', useDark: this.themeDark }) {
              if (this.servers.length === 0) {
                Text('暂无服务器').fontSize(14).fontColor(HarnessColors.mutedText(this.themeDark))
              } else {
                ForEach(this.servers, (s: PreviewMcpServer, index: number) => {
                  Column() {
                    Row() {
                      Column({ space: 4 }) {
                        Row() {
                          Text(s.name)
                            .fontSize(15)
                            .fontColor(HarnessColors.primaryText(this.themeDark))
                            .layoutWeight(1)
                          Text(s.enabled ? '已启用' : '未启用')
                            .fontSize(11)
                            .fontColor(HarnessColors.secondaryText(this.themeDark))
                            .padding({ left: 8, right: 8, top: 2, bottom: 2 })
                            .borderRadius(999)
                            .backgroundColor(HarnessColors.subtleBg(this.themeDark))
                        }
                        .width('100%')
                        Text(s.url).fontSize(12).fontColor(HarnessColors.mutedText(this.themeDark))
                      }
                      .layoutWeight(1)
                    }
                    .width('100%')
                    .padding({ top: 10, bottom: 10 })
                    if (index < this.servers.length - 1) {
                      HarnessDivider({ useDark: this.themeDark })
                    }
                  }
                }, (s: PreviewMcpServer) => s.id)
              }
            }

            SettingsSection({ title: '新建', useDark: this.themeDark }) {
              Column() {
                AppTextField({
                  label: '名称',
                  placeholder: '服务器名称',
                  text: this.editName,
                  useDark: this.themeDark,
                  onChange: (v: string) => {
                    this.editName = v;
                  },
                })
              }
              .width('100%')
              .padding({ left: 12, right: 12, top: 4, bottom: 4 })
              .borderRadius(CONTROL_RADIUS)
              .backgroundColor(HarnessColors.canvas(this.themeDark))
              .border({ width: 1, color: HarnessColors.composerBorderColor(this.themeDark) })
              Column() {
                AppTextField({
                  label: 'URL / 命令',
                  placeholder: 'stdio://…',
                  text: this.editUrl,
                  useDark: this.themeDark,
                  onChange: (v: string) => {
                    this.editUrl = v;
                  },
                })
              }
              .width('100%')
              .padding({ left: 12, right: 12, top: 4, bottom: 4 })
              .borderRadius(CONTROL_RADIUS)
              .backgroundColor(HarnessColors.canvas(this.themeDark))
              .border({ width: 1, color: HarnessColors.composerBorderColor(this.themeDark) })
              .margin({ top: 8 })
              Row() {
                Text('启用').fontSize(15).layoutWeight(1).fontColor(HarnessColors.primaryText(this.themeDark))
                Toggle({ type: ToggleType.Switch, isOn: this.editEnabled })
                  .onChange((on: boolean) => {
                    this.editEnabled = on;
                  })
              }
              .width('100%')
              .margin({ top: 8 })
              AppButton({
                label: '保存服务器',
                enabled: this.editName.length > 0 && this.editUrl.length > 0,
                useDark: this.themeDark,
                onClick: () => {
                  PreviewLocalPreferences.upsertMcp({
                    id: `mcp-${Date.now()}`,
                    name: this.editName,
                    url: this.editUrl,
                    enabled: this.editEnabled,
                  });
                  this.servers = PreviewLocalPreferences.listMcp();
                  this.editName = '';
                  this.editUrl = '';
                },
              })
                .margin({ top: 12 })
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

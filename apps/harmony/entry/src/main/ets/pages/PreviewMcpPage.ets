import { router } from '@kit.ArkUI';
import { AppScaffold } from '../coreui/AppScaffold';
import { AppTextField } from '../coreui/AppTextField';
import { AppTopBar } from '../coreui/AppTopBar';
import { HarnessColors } from '../coreui/HarnessColors';
import { SettingsNavRow } from '../coreui/SettingsNavRow';
import { SettingsPillButton } from '../coreui/SettingsPillButton';
import { SettingsSection } from '../coreui/SettingsSection';
import { PreviewLocalPreferences, PreviewMcpServer } from '../preview/PreviewLocalPreferences';
import { harnessPageTransition } from '../coreui/HarnessPageTransition';

const ROW_MIN_HEIGHT: number = 48;

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

  pageTransition() {
    harnessPageTransition()
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
        Column() {
          Scroll() {
            Column({ space: 20 }) {
              SettingsSection({ sectionLabel: '已配置', useDark: this.themeDark }) {
                if (this.servers.length === 0) {
                  Text('暂无服务器')
                    .fontSize(14)
                    .fontColor(HarnessColors.mutedText(this.themeDark))
                    .width('100%')
                    .padding({ left: 16, top: 14, bottom: 14 })
                } else {
                  ForEach(this.servers, (s: PreviewMcpServer, index: number) => {
                    SettingsNavRow({
                      title: s.name,
                      trailingValue: s.enabled ? '已启用' : '未启用',
                      useDark: this.themeDark,
                      showDivider: index < this.servers.length - 1,
                      onClick: () => {
                      },
                    })
                  }, (s: PreviewMcpServer) => s.id)
                }
              }

              SettingsSection({ sectionLabel: '新建', useDark: this.themeDark }) {
                Column({ space: 12 }) {
                  AppTextField({
                    label: '名称',
                    placeholder: '服务器名称',
                    text: this.editName,
                    useDark: this.themeDark,
                    onChange: (v: string) => {
                      this.editName = v;
                    },
                  })
                  AppTextField({
                    label: 'URL / 命令',
                    placeholder: 'stdio://…',
                    text: this.editUrl,
                    useDark: this.themeDark,
                    onChange: (v: string) => {
                      this.editUrl = v;
                    },
                  })
                  Row() {
                    Text('启用')
                      .fontSize(16)
                      .layoutWeight(1)
                      .fontColor(HarnessColors.secondaryText(this.themeDark))
                    Toggle({ type: ToggleType.Switch, isOn: this.editEnabled })
                      .selectedColor(HarnessColors.primary)
                      .onChange((on: boolean) => {
                        this.editEnabled = on;
                      })
                  }
                  .width('100%')
                  .height(ROW_MIN_HEIGHT)
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

          Column({ space: 10 }) {
            SettingsPillButton({
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

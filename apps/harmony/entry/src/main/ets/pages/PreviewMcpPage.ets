import { router } from '@kit.ArkUI';
import { AppScaffold } from '../coreui/AppScaffold';
import { AppTextField } from '../coreui/AppTextField';
import { AppTopBar } from '../coreui/AppTopBar';
import { HarnessColors } from '../coreui/HarnessColors';
import { AppSheet } from '../coreui/AppSheet';
import { AppToast } from '../coreui/AppFeedback';
import { SettingsNavRow } from '../coreui/SettingsNavRow';
import { SettingsPillButton } from '../coreui/SettingsPillButton';
import { SettingsSection } from '../coreui/SettingsSection';
import { PreviewLocalPreferences, PreviewMcpServer } from '../preview/PreviewLocalPreferences';
import { HarmonyAgentSettingsApi } from '../core/HarmonyAgentSettingsApi';
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
  @State mcpActionSheetOpen: boolean = false;
  @State mcpActionTarget: PreviewMcpServer | null = null;
  @State mcpTesting: boolean = false;

  aboutToAppear(): void {
    this.themeDark = PreviewLocalPreferences.themeDark;
    void this.reloadMcpList();
  }

  onPageShow(): void {
    this.themeDark = PreviewLocalPreferences.themeDark;
    void this.reloadMcpList();
  }

  private async reloadMcpList(): Promise<void> {
    if (HarmonyAgentSettingsApi.coreApiEnabled()) {
      try {
        this.servers = await HarmonyAgentSettingsApi.listMcpServers();
        return;
      } catch (_e) {
        // 回落 Preview 本地
      }
    }
    this.servers = PreviewLocalPreferences.listMcp();
  }

  private async saveMcpServer(): Promise<void> {
    const name = this.editName.trim();
    const url = this.editUrl.trim();
    if (name.length === 0 || url.length === 0) {
      return;
    }
    if (HarmonyAgentSettingsApi.coreApiEnabled()) {
      try {
        await HarmonyAgentSettingsApi.saveMcpServer(undefined, name, url, this.editEnabled);
        this.editName = '';
        this.editUrl = '';
        await this.reloadMcpList();
        return;
      } catch (_e) {
        // 回落 Preview 本地
      }
    }
    PreviewLocalPreferences.upsertMcp({
      id: `mcp-${Date.now()}`,
      name,
      url,
      enabled: this.editEnabled,
    });
    this.servers = PreviewLocalPreferences.listMcp();
    this.editName = '';
    this.editUrl = '';
  }

  private openMcpActions(server: PreviewMcpServer): void {
    this.mcpActionTarget = server;
    this.mcpActionSheetOpen = true;
  }

  private async runMcpTest(): Promise<void> {
    const target = this.mcpActionTarget;
    if (target === null || this.mcpTesting) {
      return;
    }
    this.mcpActionSheetOpen = false;
    this.mcpTesting = true;
    try {
      if (HarmonyAgentSettingsApi.coreApiEnabled()) {
        const msg = await HarmonyAgentSettingsApi.testMcpServer(target.id);
        AppToast.show(msg);
      } else {
        AppToast.show('连接成功（Preview 模拟）');
      }
    } catch (e) {
      AppToast.show(`${e}`);
    } finally {
      this.mcpTesting = false;
      this.mcpActionTarget = null;
    }
  }

  private async deleteMcpRow(): Promise<void> {
    const target = this.mcpActionTarget;
    if (target === null) {
      return;
    }
    this.mcpActionSheetOpen = false;
    if (HarmonyAgentSettingsApi.coreApiEnabled()) {
      try {
        await HarmonyAgentSettingsApi.deleteMcpServer(target.id);
        AppToast.show('已删除');
        await this.reloadMcpList();
      } catch (e) {
        AppToast.show(`${e}`);
      }
    } else {
      PreviewLocalPreferences.deleteMcp(target.id);
      this.servers = PreviewLocalPreferences.listMcp();
      AppToast.show('已删除（Preview 模拟）');
    }
    this.mcpActionTarget = null;
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
                        this.openMcpActions(s);
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
                void this.saveMcpServer();
              },
            })
          }
          .width('100%')
          .padding({ left: 16, right: 16, top: 12, bottom: 16 })
        }
        .width('100%')
        .height('100%')
        .backgroundColor(HarnessColors.canvas(this.themeDark))

        AppSheet({
          visible: this.mcpActionSheetOpen,
          title: this.mcpActionTarget?.name ?? 'MCP',
          actionLabel: '',
          minBodyHeight: 120,
          contentBottomPadding: 24,
          useDark: this.themeDark,
          reduceMotion: PreviewLocalPreferences.reduceMotion,
          rows: ['测试连接', '删除服务器'],
          onPick: (row: string) => {
            if (row === '测试连接') {
              void this.runMcpTest();
            } else if (row === '删除服务器') {
              void this.deleteMcpRow();
            } else {
              this.mcpActionSheetOpen = false;
            }
          },
          onClose: () => {
            this.mcpActionSheetOpen = false;
            this.mcpActionTarget = null;
          },
        })
      },
    })
  }
}

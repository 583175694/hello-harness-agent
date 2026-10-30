import { AppTextField } from '../coreui/AppTextField';
import { HarnessColors } from '../coreui/HarnessColors';
import { SettingsPillButton } from '../coreui/SettingsPillButton';
import { SettingsSection } from '../coreui/SettingsSection';
import { AppConfirmPanel } from '../coreui/AppConfirmPanel';
import { AppAlert, AppToast } from '../coreui/AppFeedback';
import { PreviewLocalPreferences } from './PreviewLocalPreferences';
import { SessionDrawerRow } from './PreviewModels';
import { harnessPressOpacity } from '../coreui/HarnessPressScale';

@Component
export struct PreviewDrawerOverlay {
  @Link visible: boolean;
  @Prop sessions: SessionDrawerRow[] = [];
  @Prop refreshing: boolean = false;
  @Prop newConversationEnabled: boolean = true;
  @Prop reduceMotion: boolean = PreviewLocalPreferences.reduceMotion;
  @Prop useDark: boolean = PreviewLocalPreferences.themeDark;
  onRefresh: () => void = () => {
  };
  onNewConversation: () => void = () => {
  };
  onOpenSettings: () => void = () => {
  };
  onSelectSession: (sessionId: string) => void = () => {
  };
  @State menuTarget: SessionDrawerRow | null = null;
  @State renameOpen: boolean = false;
  @State renameDraft: string = '';
  @State renamePresentScale: number = 0.96;
  @State renamePresentOpacity: number = 0;
  @State deleteConfirmOpen: boolean = false;
  @State deleteConfirmTitle: string = '';
  @State deletePresentScale: number = 0.96;
  @State deletePresentOpacity: number = 0;
  @State newChatPressed: boolean = false;
  @State menuPresentScale: number = 0.82;
  @State menuPresentOpacity: number = 0;
  @State menuPresentOffsetY: number = -12;
  /** 侧栏滑入 + 蒙层淡入（280ms，与 Workbench 一致） */
  @State presentProgress: number = 0;

  @Watch('visible')
  onVisibleChange(): void {
    this.presentProgress = this.visible ? 1 : 0;
    if (!this.visible) {
      this.menuTarget = null;
    }
  }

  private panelSlideX(): string {
    return `${(1 - this.presentProgress) * -100}%`;
  }

  private closeSessionMenu(): void {
    this.menuTarget = null;
    this.renameOpen = false;
    this.renameDraft = '';
    this.menuPresentScale = 0.82;
    this.menuPresentOpacity = 0;
    this.menuPresentOffsetY = -12;
    this.renamePresentScale = 0.96;
    this.renamePresentOpacity = 0;
    this.deleteConfirmOpen = false;
    this.deleteConfirmTitle = '';
    this.deletePresentScale = 0.96;
    this.deletePresentOpacity = 0;
  }

  private openRenameSheet(): void {
    if (this.menuTarget === null) {
      return;
    }
    this.renameDraft = this.menuTarget.title;
    this.renameOpen = true;
    this.renamePresentScale = 0.96;
    this.renamePresentOpacity = 0;
    animateTo({
      duration: this.reduceMotion ? 0 : 240,
      curve: Curve.EaseOut,
    }, () => {
      this.renamePresentScale = 1;
      this.renamePresentOpacity = 1;
    });
  }

  private closeRenameSheet(): void {
    this.renameOpen = false;
    this.renamePresentScale = 0.96;
    this.renamePresentOpacity = 0;
    this.menuTarget = null;
  }

  private saveRenamePreview(): void {
    const title = this.renameDraft.trim();
    if (title.length === 0) {
      return;
    }
    AppToast.show('已重命名（Preview 模拟）');
    this.closeRenameSheet();
  }

  private openSessionMenu(row: SessionDrawerRow): void {
    this.menuTarget = row;
    this.renameDraft = row.title;
    this.menuPresentScale = 0.82;
    this.menuPresentOpacity = 0;
    this.menuPresentOffsetY = -12;
    setTimeout(() => {
      animateTo({
        duration: this.reduceMotion ? 0 : 280,
        curve: Curve.FastOutSlowIn,
      }, () => {
        this.menuPresentScale = 1;
        this.menuPresentOpacity = 1;
        this.menuPresentOffsetY = 0;
      });
    }, 16);
  }

  private previewSessionAction(label: string): void {
    AppAlert.info(label, '演示环境暂不支持此操作', () => {
      this.closeSessionMenu();
    });
  }

  private openDeleteConfirm(title: string): void {
    this.deleteConfirmTitle = title;
    this.deleteConfirmOpen = true;
    this.deletePresentScale = 0.96;
    this.deletePresentOpacity = 0;
    setTimeout(() => {
      animateTo({
        duration: this.reduceMotion ? 0 : 240,
        curve: Curve.EaseOut,
      }, () => {
        this.deletePresentScale = 1;
        this.deletePresentOpacity = 1;
      });
    }, 16);
  }

  private closeDeleteConfirm(): void {
    this.deleteConfirmOpen = false;
    this.deletePresentScale = 0.96;
    this.deletePresentOpacity = 0;
    this.menuTarget = null;
  }

  private confirmDeleteSession(): void {
    AppToast.show('已删除（Preview 模拟）');
    this.closeDeleteConfirm();
  }

  @Builder
  sessionRow(row: SessionDrawerRow) {
    Row() {
      if (row.running) {
        Column()
          .width(8)
          .height(8)
          .borderRadius(4)
          .backgroundColor('#2F5D3A')
          .margin({ right: 6 })
      }
      Text(row.title)
        .fontSize(14)
        .fontWeight(row.active ? FontWeight.Medium : FontWeight.Normal)
        .fontColor(HarnessColors.primaryText(this.useDark))
        .layoutWeight(1)
      if (row.time.length > 0) {
        Text(row.time).fontSize(11).fontColor(HarnessColors.mutedText(this.useDark))
      }
    }
    .width('100%')
    .padding({ left: 12, right: 12, top: 10, bottom: 10 })
    .margin({ left: 16, right: 16, bottom: 2 })
    .borderRadius(8)
    .backgroundColor(
      this.menuTarget !== null && this.menuTarget.id === row.id
        ? HarnessColors.surface(this.useDark)
        : (row.active ? HarnessColors.subtleBg(this.useDark) : Color.Transparent),
    )
    .onClick(() => {
      this.onSelectSession(row.id);
      this.visible = false;
    })
    .gesture(
      LongPressGesture({ repeat: false })
        .onAction(() => {
          this.openSessionMenu(row);
        }),
    )
  }

  @Builder
  contextMenuRow(label: string, destructive: boolean, onTap: () => void) {
    Text(label)
      .fontSize(14)
      .fontWeight(FontWeight.Medium)
      .fontColor(destructive ? '#B42318' : HarnessColors.primaryText(this.useDark))
      .width('100%')
      .padding({ left: 16, right: 16, top: 10, bottom: 10 })
      .onClick(() => onTap())
  }

  @Builder
  sessionDeleteConfirm() {
    if (!this.deleteConfirmOpen || this.menuTarget === null) {
      Blank();
      return;
    }
    AppConfirmPanel({
      title: '删除会话',
      message: `确定删除「${this.deleteConfirmTitle}」？Preview 中仅为静态确认。`,
      confirmLabel: '删除',
      cancelLabel: '取消',
      destructive: true,
      useDark: this.useDark,
      presentScale: this.deletePresentScale,
      presentOpacity: this.deletePresentOpacity,
      onCancel: () => this.closeDeleteConfirm(),
      onConfirm: () => this.confirmDeleteSession(),
    })
  }

  @Builder
  sessionRenameSheet() {
    if (!this.renameOpen || this.menuTarget === null) {
      Blank();
      return;
    }
    Stack({ alignContent: Alignment.Center }) {
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor('#00000040')
        .opacity(this.renamePresentOpacity)
        .onClick(() => this.closeRenameSheet())
      Column({ space: 0 }) {
        SettingsSection({
          title: '重命名会话',
          useDark: this.useDark,
        }) {
          Column({ space: 16 }) {
            AppTextField({
              label: '会话标题',
              placeholder: '输入标题',
              text: this.renameDraft,
              useDark: this.useDark,
              onChange: (v: string) => {
                this.renameDraft = v;
              },
            })
            Row({ space: 12 }) {
              Column() {
                SettingsPillButton({
                  label: '取消',
                  useDark: this.useDark,
                  primary: false,
                  onClick: () => this.closeRenameSheet(),
                })
              }
              .layoutWeight(1)
              Column() {
                SettingsPillButton({
                  label: '保存',
                  useDark: this.useDark,
                  primary: true,
                  enabled: this.renameDraft.trim().length > 0,
                  onClick: () => this.saveRenamePreview(),
                })
              }
              .layoutWeight(1)
            }
            .width('100%')
          }
          .width('100%')
        }
      }
      .width('100%')
      .padding({ left: 16, right: 16 })
      .scale({ x: this.renamePresentScale, y: this.renamePresentScale })
      .opacity(this.renamePresentOpacity)
    }
    .width('100%')
    .height('100%')
  }

  @Builder
  sessionContextMenu() {
    if (this.menuTarget === null || this.renameOpen || this.deleteConfirmOpen) {
      Blank();
      return;
    }
    Stack({ alignContent: Alignment.TopStart }) {
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor(Color.Transparent)
        .onClick(() => this.closeSessionMenu())
      Column({ space: 0 }) {
        this.contextMenuRow('重命名', false, () => {
          this.openRenameSheet();
        })
        this.contextMenuRow(this.menuTarget!.pinned ? '取消置顶' : '置顶', false, () => {
          this.previewSessionAction(this.menuTarget!.pinned ? '已取消置顶' : '已置顶');
          this.closeSessionMenu();
        })
        Divider().strokeWidth(1).color(HarnessColors.composerBorderColor(this.useDark)).margin({ left: 12, right: 12 })
        this.contextMenuRow('删除', true, () => {
          this.openDeleteConfirm(this.menuTarget!.title);
        })
      }
      .width(200)
      .padding({ top: 4, bottom: 4 })
      .margin({ left: 16, top: 120 })
      .backgroundColor(HarnessColors.surface(this.useDark))
      .borderRadius(16)
      .border({ width: 1, color: HarnessColors.composerBorderColor(this.useDark) })
      .scale({ x: this.menuPresentScale, y: this.menuPresentScale })
      .opacity(this.menuPresentOpacity)
      .translate({ y: this.menuPresentOffsetY })
    }
    .width('100%')
    .height('100%')
  }

  build() {
    if (!this.visible && this.presentProgress <= 0.01) {
      Blank();
      return;
    }
    Stack({ alignContent: Alignment.TopStart }) {
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor('#00000066')
        .opacity(this.presentProgress)
        .animation({
          duration: this.reduceMotion ? 0 : 280,
          curve: Curve.EaseOut,
        })
        .onClick(() => {
          this.visible = false;
        })

      Column({ space: 0 }) {
        Row() {
          Text('+')
            .fontSize(20)
            .fontWeight(FontWeight.Medium)
            .fontColor(HarnessColors.primaryText(this.useDark))
            .width(20)
            .textAlign(TextAlign.Center)
          Text('新对话')
            .fontSize(15)
            .fontWeight(FontWeight.Medium)
            .fontColor(HarnessColors.primaryText(this.useDark))
            .layoutWeight(1)
            .margin({ left: 10 })
        }
        .width('100%')
        .height(48)
        .padding({ left: 10, right: 12 })
        .margin({ left: 16, right: 16, top: 12 })
        .backgroundColor(HarnessColors.subtleBg(this.useDark))
        .borderRadius(8)
        .border({ width: 1, color: HarnessColors.composerBorderColor(this.useDark) })
        .opacity(this.newConversationEnabled ? harnessPressOpacity(this.newChatPressed) : 0.45)
        .onTouch((event: TouchEvent) => {
          if (event.type === TouchType.Down) {
            this.newChatPressed = true;
          } else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
            this.newChatPressed = false;
          }
        })
        .onClick(() => {
          this.onNewConversation();
        })
        .accessibilityText('新建对话')

        Refresh({ refreshing: this.refreshing, offset: 64, friction: 100 }) {
          Scroll() {
            Column({ space: 0 }) {
              if (this.sessions.filter((r) => r.pinned).length > 0) {
                Text('置顶')
                  .fontSize(12)
                  .fontColor(HarnessColors.mutedText(this.useDark))
                  .padding({ left: 16, top: 12, bottom: 4 })
                ForEach(this.sessions.filter((r) => r.pinned), (row: SessionDrawerRow) => {
                  this.sessionRow(row)
                }, (row: SessionDrawerRow) => `p-${row.id}`)
              }
              Text('最近')
                .fontSize(12)
                .fontColor(HarnessColors.mutedText(this.useDark))
                .padding({ left: 16, top: 8, bottom: 4 })
              if (this.sessions.filter((r) => !r.pinned).length > 0) {
                ForEach(this.sessions.filter((r) => !r.pinned), (row: SessionDrawerRow) => {
                  this.sessionRow(row)
                }, (row: SessionDrawerRow) => `r-${row.id}`)
              }
            }
            .width('100%')
          }
          .layoutWeight(1)
          .width('100%')
          .scrollBar(BarState.Off)
        }
        .onRefreshing(() => {
          this.onRefresh();
        })
        .width('100%')
        .layoutWeight(1)

        Row() {
          Text('设置')
            .fontSize(14)
            .fontWeight(FontWeight.Medium)
            .fontColor(HarnessColors.primaryText(this.useDark))
        }
        .width('100%')
        .height(48)
        .padding({ left: 20, right: 16, bottom: 12 })
        .onClick(() => {
          this.visible = false;
          this.onOpenSettings();
        })
      }
      .width('78%')
      .height('100%')
      .backgroundColor(HarnessColors.canvas(this.useDark))
      .safeAreaPadding([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
      .translate({ x: this.panelSlideX() })
      .animation({
        duration: this.reduceMotion ? 0 : 280,
        curve: Curve.EaseOut,
      })

      this.sessionContextMenu()
      this.sessionRenameSheet()
      this.sessionDeleteConfirm()
    }
    .width('100%')
    .height('100%')
  }
}

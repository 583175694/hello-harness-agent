import { AppTextField } from '../coreui/AppTextField';
import { HarnessColors } from '../coreui/HarnessColors';
import { HarnessDivider } from '../coreui/HarnessDivider';
import { Spinner } from '../coreui/Spinner';
import { AppAlert, AppToast } from '../coreui/AppFeedback';
import { PreviewLocalPreferences } from './PreviewLocalPreferences';
import { SessionDrawerRow } from './PreviewModels';

@Component
export struct PreviewDrawerOverlay {
  @Link visible: boolean;
  @Prop sessions: SessionDrawerRow[] = [];
  @Prop draftTitle: string = '新对话';
  @Prop searchPlaceholder: string = '搜索会话';
  @Prop refreshing: boolean = false;
  @Prop reduceMotion: boolean = PreviewLocalPreferences.reduceMotion;
  @Prop useDark: boolean = PreviewLocalPreferences.themeDark;
  onRefresh: () => void = () => {
  };
  onOpenSettings: () => void = () => {
  };
  onSelectSession: (sessionId: string) => void = () => {
  };
  @State searchQuery: string = '';
  @State menuTarget: SessionDrawerRow | null = null;
  @State renameDraft: string = '';
  /** 侧栏滑入 + 蒙层淡入（280ms，与 Workbench 一致） */
  @State presentProgress: number = 0;

  @Watch('visible')
  onVisibleChange(): void {
    this.presentProgress = this.visible ? 1 : 0;
    if (!this.visible) {
      this.searchQuery = '';
      this.menuTarget = null;
    }
  }

  private panelSlideX(): string {
    return `${(1 - this.presentProgress) * -100}%`;
  }

  private closeSessionMenu(): void {
    this.menuTarget = null;
    this.renameDraft = '';
  }

  private previewSessionAction(label: string): void {
    AppAlert.info(label, '演示环境暂不支持此操作', () => {
      this.closeSessionMenu();
    });
  }

  private confirmDeleteSession(title: string): void {
    AppAlert.confirm({
      title: '删除会话',
      message: `确定删除「${title}」？Preview 中仅为静态确认。`,
      confirmLabel: '删除',
      cancelLabel: '取消',
      onConfirm: () => {
        AppToast.show('已删除（Preview 模拟）');
        this.closeSessionMenu();
      },
    });
  }

  private filteredSessions(): SessionDrawerRow[] {
    const q = this.searchQuery.trim().toLowerCase();
    if (q.length === 0) {
      return this.sessions;
    }
    return this.sessions.filter((row) => row.title.toLowerCase().includes(q));
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
      Text(`${row.pinned ? '📌 ' : ''}${row.title}`)
        .fontSize(15)
        .layoutWeight(1)
      if (row.time.length > 0) {
        Text(row.time).fontSize(11).fontColor(HarnessColors.mutedText(this.useDark))
      }
    }
    .width('100%')
    .padding({ left: 16, right: 16, top: 12, bottom: 12 })
    .borderRadius(8)
    .backgroundColor(row.active ? HarnessColors.userBubbleBg(this.useDark) : HarnessColors.surface(this.useDark))
    .onClick(() => {
      this.onSelectSession(row.id);
      this.visible = false;
    })
    .gesture(
      LongPressGesture({ repeat: false })
        .onAction(() => {
          this.menuTarget = row;
          this.renameDraft = row.title;
        }),
    )
  }

  @Builder
  sessionContextMenu() {
    if (this.menuTarget === null) {
      Blank();
      return;
    }
    Stack({ alignContent: Alignment.Bottom }) {
      Column()
        .width('100%')
        .height('100%')
        .backgroundColor('#00000055')
        .onClick(() => this.closeSessionMenu())
      Column({ space: 10 }) {
        Text(this.menuTarget.title)
          .fontSize(16)
          .fontWeight(FontWeight.Medium)
          .fontColor(HarnessColors.primaryText(this.useDark))
          .width('100%')
        AppTextField({
          label: '重命名',
          placeholder: '会话标题',
          text: this.renameDraft,
          useDark: this.useDark,
          onChange: (v: string) => {
            this.renameDraft = v;
          },
        })
        Text('重命名')
          .fontSize(15)
          .fontColor(HarnessColors.linkText(this.useDark))
          .padding(12)
          .width('100%')
          .backgroundColor(HarnessColors.subtleBg(this.useDark))
          .borderRadius(8)
          .onClick(() => this.previewSessionAction('已重命名'))
        Text(this.menuTarget.pinned ? '取消置顶' : '置顶')
          .fontSize(15)
          .fontColor(HarnessColors.primaryText(this.useDark))
          .padding(12)
          .width('100%')
          .backgroundColor(HarnessColors.subtleBg(this.useDark))
          .borderRadius(8)
          .onClick(() => this.previewSessionAction(this.menuTarget!.pinned ? '已取消置顶' : '已置顶'))
        Text('删除会话')
          .fontSize(15)
          .fontColor('#B42318')
          .padding(12)
          .width('100%')
          .backgroundColor(HarnessColors.subtleBg(this.useDark))
          .borderRadius(8)
          .onClick(() => this.confirmDeleteSession(this.menuTarget!.title))
        Text('完成')
          .fontSize(14)
          .fontWeight(FontWeight.Medium)
          .fontColor(HarnessColors.linkText(this.useDark))
          .padding(8)
          .onClick(() => this.closeSessionMenu())
      }
      .width('100%')
      .padding(16)
      .backgroundColor(HarnessColors.surface(this.useDark))
      .borderRadius({ topLeft: 20, topRight: 20 })
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
        Text('会话')
          .fontSize(18)
          .fontWeight(FontWeight.Bold)
          .fontColor(HarnessColors.primaryText(this.useDark))
          .padding({ top: 8, left: 16, bottom: 8 })
        AppTextField({
          label: this.searchPlaceholder,
          placeholder: this.searchPlaceholder,
          text: this.searchQuery,
          useDark: this.useDark,
          onChange: (v: string) => {
            this.searchQuery = v;
          },
        })
          .padding({ left: 16, right: 16, top: 4, bottom: 4 })
        Row() {
          Text('刷新列表')
            .fontSize(13)
            .fontColor(HarnessColors.mutedText(this.useDark))
            .layoutWeight(1)
          if (this.refreshing) {
            Spinner({ label: '刷新中…', useDark: this.useDark })
          } else {
            Text('↻')
              .fontSize(16)
              .fontColor(HarnessColors.linkText(this.useDark))
              .onClick(() => {
                this.onRefresh();
              })
          }
        }
        .width('100%')
        .padding({ left: 16, right: 16, bottom: 8 })

        HarnessDivider()

        Scroll() {
          Column({ space: 0 }) {
            Text(this.draftTitle)
              .fontSize(15)
              .fontWeight(FontWeight.Medium)
              .fontColor(HarnessColors.primaryText(this.useDark))
              .padding({ left: 12, right: 12, top: 10, bottom: 10 })
              .width('100%')
              .backgroundColor(HarnessColors.subtleBg(this.useDark))
              .borderRadius(12)
              .margin({ left: 16, right: 16, top: 8, bottom: 8 })

            if (this.sessions.length > 0) {
              if (this.filteredSessions().filter((r) => r.pinned).length > 0) {
                Text('置顶')
                  .fontSize(12)
                  .fontColor(HarnessColors.mutedText(this.useDark))
                  .padding({ left: 16, top: 4, bottom: 4 })
                ForEach(this.filteredSessions().filter((r) => r.pinned), (row: SessionDrawerRow) => {
                  this.sessionRow(row)
                }, (row: SessionDrawerRow) => `p-${row.id}`)
              }
              Text('最近')
                .fontSize(12)
                .fontColor(HarnessColors.mutedText(this.useDark))
                .padding({ left: 16, top: 8, bottom: 4 })
              if (this.filteredSessions().filter((r) => !r.pinned).length > 0) {
                ForEach(this.filteredSessions().filter((r) => !r.pinned), (row: SessionDrawerRow) => {
                  this.sessionRow(row)
                }, (row: SessionDrawerRow) => `r-${row.id}`)
              } else if (this.searchQuery.trim().length > 0) {
                Text('无匹配会话')
                  .fontSize(14)
                  .fontColor(HarnessColors.mutedText(this.useDark))
                  .padding(16)
              }
            } else {
              Text('Preview 会话 A')
                .fontSize(15)
                .fontColor(HarnessColors.primaryText(this.useDark))
                .padding(16)
                .width('100%')
                .backgroundColor(HarnessColors.userBubbleBg(this.useDark))
            }
          }
          .width('100%')
        }
        .layoutWeight(1)
        .scrollBar(BarState.Off)
        HarnessDivider()
        Text('设置')
          .fontSize(16)
          .fontColor(HarnessColors.primaryText(this.useDark))
          .padding(16)
          .width('100%')
          .onClick(() => {
            this.visible = false;
            this.onOpenSettings();
          })
      }
      .width('78%')
      .height('100%')
      .backgroundColor(HarnessColors.surface(this.useDark))
      .safeAreaPadding([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
      .translate({ x: this.panelSlideX() })
      .animation({
        duration: this.reduceMotion ? 0 : 280,
        curve: Curve.EaseOut,
      })

      this.sessionContextMenu()
    }
    .width('100%')
    .height('100%')
  }
}

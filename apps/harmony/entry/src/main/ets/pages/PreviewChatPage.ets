import { KeyboardAvoidMode, ListScroller, router, ScrollAlign } from '@kit.ArkUI';
import { HarnessColors } from '../coreui/HarnessColors';
import { ChatTopBar } from '../preview/ChatTopBar';
import { PreviewSessionState } from '../preview/PreviewFixtureLoader';
import { PreviewAgentSessionPort } from '../preview/PreviewAgentSessionPort';
import { ChatLine } from '../preview/PreviewModels';
import { ConversationTurnRow } from '../preview/ConversationPatterns';
import { PreviewComposerStack } from '../preview/PreviewComposerStack';
import { PreviewChromeFlags } from '../preview/PreviewChromeFlags';
import { PlanFloatingCard } from '../preview/PlanFloatingCard';
import { AppSheet } from '../coreui/AppSheet';
import { AppToast } from '../coreui/AppFeedback';
import { PreviewLocalPreferences } from '../preview/PreviewLocalPreferences';
import { PreviewDrawerOverlay } from '../preview/PreviewDrawerOverlay';
import { ProblemDetailsCard, ServiceBanner } from '../preview/ConnectionChrome';
import { PreviewReplayController } from '../preview/PreviewReplayController';
import { PreviewWorkbenchSheet } from '../preview/PreviewWorkbenchSheet';
import { ChatLandingHero } from '../preview/ChatLandingHero';
import { PreviewSessionReducer, PreviewUiAction } from '../preview/PreviewSessionReducer';
import { SessionDrawerRow } from '../preview/PreviewModels';
import {
  PreviewComposerModelSheet,
  formatComposerModelChip,
  resolveModelIdFromLabel,
  resolveReasoningFromLabel,
} from '../preview/PreviewComposerModelSheet';
import { harnessPageTransition } from '../coreui/HarnessPageTransition';
import { previewUiActionScrollsConversationToBottom } from '../preview/ConversationListScroll';

@Entry
@Component
struct PreviewChatPage {
  @State session: PreviewSessionState | null = null;
  @State lines: ChatLine[] = [];
  @State drawerOpen: boolean = false;
  @State workbenchOpen: boolean = false;
  @State focusedToolStepId: string = '';
  @State modelSheetOpen: boolean = false;
  @State attachSheetOpen: boolean = false;
  @State skillSheetOpen: boolean = false;
  @State selectedModelId: string = 'deepseek-reasoner';
  @State reasoningEffort: string = 'high';
  @State serviceBannerDismissed: boolean = false;
  @State themeDark: boolean = PreviewLocalPreferences.themeDark;
  @State reduceMotion: boolean = PreviewLocalPreferences.reduceMotion;
  @State contentFontSize: number = PreviewLocalPreferences.contentFontSize;
  @State drawerRefreshing: boolean = false;
  @State drawerSessions: SessionDrawerRow[] = [];
  @State composerChromeHeight: number = 0;
  private conversationScroller: ListScroller = new ListScroller();
  private replayController: PreviewReplayController = new PreviewReplayController();
  private static readonly DEMO_FIXTURE: string = 'rich-session-showcase.json';

  private scrollConversationToBottom(): void {
    if (this.lines.length === 0) {
      return;
    }
    const last = this.lines.length - 1;
    setTimeout(() => {
      try {
        this.conversationScroller.scrollToIndex(last, false, ScrollAlign.END);
      } catch (_e) {
        // Preview：列表尚未布局完成时忽略
      }
    }, 0);
  }

  @Watch('workbenchOpen')
  onWorkbenchOpenChange(): void {
    if (this.workbenchOpen) {
      this.blurComposer();
    } else {
      this.focusedToolStepId = '';
    }
  }

  @Watch('drawerOpen')
  onDrawerOpenChange(): void {
    if (this.drawerOpen) {
      this.blurComposer();
    }
  }

  private blurComposer(): void {
    try {
      this.getUIContext().getFocusController().clearFocus();
    } catch (_e) {
      // Preview：部分 DevEco 版本 API 差异，忽略
    }
  }

  aboutToAppear(): void {
    const params = router.getParams() as Record<string, string>;
    const fileName = (params['fileName'] as string)?.length > 0 ? `${params['fileName']}` : 'empty-landing.json';
    this.applyFixture(fileName, params['title']);
  }

  private applyFixture(fileName: string, titleOverride?: string): void {
    this.replayController.stop();
    const resMgr = getContext(this).resourceManager;
    const port = new PreviewAgentSessionPort(resMgr);
    const loaded = port.loadPreviewFixture(fileName);
    if (titleOverride && titleOverride.length > 0) {
      loaded.title = titleOverride;
    }
    this.session = loaded;
    this.drawerSessions = loaded.sessionDrawer.sessions.slice();
    this.drawerOpen = loaded.uiHints.initialDrawerOpen;
    this.selectedModelId = resolveModelIdFromLabel(loaded.composer.modelLabel);
    this.reasoningEffort = resolveReasoningFromLabel(loaded.composer.modelLabel);
    this.serviceBannerDismissed = false;
    const badge = loaded.workbench.workbenchCount > 0 ? loaded.workbench.workbenchCount :
      (loaded.workbench.sources.length > 0 ? 1 : 0);
    this.workbenchOpen = badge > 0 || loaded.workbench.reportMarkdown.length > 0;
    this.focusedToolStepId = '';
    this.lines = loaded.lines.slice();
    if (loaded.replay !== null) {
      const replay = loaded.replay;
      this.replayController.start(
        this.lines,
        replay.tailTarget,
        replay.tickMs,
        replay.codepointsPerTick,
        (next: ChatLine[]) => {
          this.lines = next;
        },
      );
    }
    if (!loaded.isLanding) {
      this.scrollConversationToBottom();
    }
  }

  loadDemoFixture(): void {
    this.applyFixture(PreviewChatPage.DEMO_FIXTURE);
  }

  applyPreviewAction(action: PreviewUiAction): void {
    if (this.session === null) {
      return;
    }
    const result = PreviewSessionReducer.reduce(this.session, this.lines, action);
    this.session = result.session;
    this.lines = result.lines;
    if (previewUiActionScrollsConversationToBottom(action.kind)) {
      this.scrollConversationToBottom();
    }
  }

  aboutToDisappear(): void {
    this.replayController.stop();
  }

  onPageShow(): void {
    this.themeDark = PreviewLocalPreferences.themeDark;
    this.reduceMotion = PreviewLocalPreferences.reduceMotion;
    this.contentFontSize = PreviewLocalPreferences.contentFontSize;
  }

  refreshDrawerSessions(): void {
    this.drawerRefreshing = true;
    setTimeout(() => {
      if (this.session !== null) {
        this.drawerSessions = this.session.sessionDrawer.sessions.slice();
      }
      this.drawerRefreshing = false;
    }, 700);
  }

  private isInDraftMode(): boolean {
    const active = this.drawerSessions.find((row) => row.active);
    return active !== undefined && active.id.startsWith('draft-');
  }

  startNewConversation(): boolean {
    if (this.session === null) {
      return false;
    }
    if (this.isInDraftMode()) {
      this.drawerOpen = false;
      AppToast.show('已在新对话中');
      return false;
    }
    const title = this.session.sessionDrawer.draftTitle;
    const newRow: SessionDrawerRow = {
      id: `draft-${Date.now()}`,
      title,
      time: '刚刚',
      active: true,
      pinned: false,
      running: false,
    };
    const inactive = this.drawerSessions.map((row) => {
      const copy: SessionDrawerRow = {
        id: row.id,
        title: row.title,
        time: row.time,
        active: false,
        pinned: row.pinned,
        running: row.running,
      };
      return copy;
    });
    const pinned = inactive.filter((row) => row.pinned);
    const recent = inactive.filter((row) => !row.pinned);
    this.drawerSessions = [...pinned, newRow, ...recent];
    this.drawerOpen = false;
    return true;
  }

  selectDrawerSession(sessionId: string): void {
    this.drawerSessions = this.drawerSessions.map((row) => {
      const copy: SessionDrawerRow = {
        id: row.id,
        title: row.title,
        time: row.time,
        active: row.id === sessionId,
        pinned: row.pinned,
        running: row.running,
      };
      return copy;
    });
    AppToast.show(`已选择会话 ${sessionId}（Preview 假切换）`);
  }

  openReader(title: string, body: string, isArtifact: boolean): void {
    router.pushUrl({
      url: 'pages/PreviewReaderPage',
      params: { title, body, isArtifact },
    });
  }

  pageTransition() {
    harnessPageTransition()
  }

  build() {
    if (this.session === null) {
      Text('加载中…')
        .width('100%')
        .height('100%')
        .fontColor(HarnessColors.primaryText(this.themeDark))
        .backgroundColor(HarnessColors.canvas(this.themeDark))
      return;
    }
    const s = this.session;
    Stack({ alignContent: Alignment.BottomStart }) {
      Column() {
        ChatTopBar({
          title: s.title,
          connectionState: s.chrome.connectionState,
          runSummary: s.chrome.runSummary,
          useDark: this.themeDark,
          onOpenDrawer: () => {
            this.blurComposer();
            this.drawerOpen = true;
          },
          onNewConversation: () => {
            this.blurComposer();
            this.startNewConversation();
          },
          onOpenWorkbench: () => {
            this.blurComposer();
            this.focusedToolStepId = '';
            this.workbenchOpen = true;
          },
        })

        Stack() {
          Column({ space: 8 }) {
          ServiceBanner({
            serviceState: s.chrome.serviceState,
            dismissed: this.serviceBannerDismissed,
            useDark: this.themeDark,
            onRetry: () => {
              this.serviceBannerDismissed = false;
            },
            onDismiss: () => {
              this.serviceBannerDismissed = true;
            },
          })

        if (s.chrome.serviceState === 'ready') {
          ProblemDetailsCard({
            title: s.problemTitle,
            detail: s.problemDetail,
            useDark: this.themeDark,
          })
        }

        if (s.isLanding) {
          Column() {
            ChatLandingHero({
              welcomeText: '欢迎回来，想从哪里开始？',
              useDark: this.themeDark,
              showDemoEntry: s.fileName === 'empty-landing.json',
              onOpenDemo: () => {
                this.loadDemoFixture();
              },
            })
          }
          .layoutWeight(1)
          .justifyContent(FlexAlign.Center)
          .width('100%')
        } else {
          List({ scroller: this.conversationScroller }) {
            ForEach(this.lines, (line: ChatLine, index: number) => {
              ListItem() {
                ConversationTurnRow({
                  line: line,
                  streamingTail: s.replay !== null && line.role === 'assistant' &&
                    index === this.lines.length - 1 && line.text.length < 8,
                  fontSize: this.contentFontSize,
                  useDark: this.themeDark,
                  reduceMotion: this.reduceMotion,
                  onOpenWorkbenchStep: (toolId: string) => {
                    this.focusedToolStepId = toolId;
                    this.workbenchOpen = true;
                  },
                })
              }
            }, (line: ChatLine, index: number) => `${index}-${line.role}`)
            ListItem() {
              Row().width('100%').height(1)
            }
          }
          .layoutWeight(1)
          .padding({ left: 12, right: 12, top: 4 })
          .scrollBar(BarState.Off)
        }
          }
          .width('100%')
          .height('100%')
          .backgroundColor(HarnessColors.canvas(this.themeDark))
        }
        .layoutWeight(1)
        .width('100%')

        PreviewComposerStack({
          composer: s.composer,
          modelLabelOverride: formatComposerModelChip(this.selectedModelId, this.reasoningEffort),
          useDark: this.themeDark,
          workbenchOpen: this.workbenchOpen,
          composerBlock: PreviewLocalPreferences.resolveComposerBlock(),
          onLoginClick: () => {
            router.pushUrl({ url: 'pages/PreviewLoginPage' });
          },
          onModelClick: () => {
            this.blurComposer();
            this.modelSheetOpen = true;
          },
          onAttachClick: () => {
            this.blurComposer();
            this.attachSheetOpen = true;
          },
          onSkillClick: () => {
            this.blurComposer();
            this.skillSheetOpen = true;
          },
          onPreviewAction: (action: PreviewUiAction) => {
            this.applyPreviewAction(action);
          },
        })
          .onAreaChange((_old, area) => {
            this.composerChromeHeight = area.height as number;
          })
      }
      .width('100%')
      .height('100%')
      .backgroundColor(HarnessColors.canvas(this.themeDark))

      if (PreviewChromeFlags.showPlanOverlay && !this.workbenchOpen && s.composer.showPlan &&
        s.composer.composerMode !== 'clarification' &&
        s.composer.composerMode !== 'hitl' && s.composer.planSteps.length > 0) {
        Column() {
          PlanFloatingCard({
            explanation: s.composer.planExplanation,
            steps: s.composer.planSteps,
            initialExpanded: s.composer.planInitialExpanded,
            lockCollapsed: this.workbenchOpen,
            useDark: this.themeDark,
          })
        }
        .width('100%')
        .alignItems(HorizontalAlign.Center)
        .margin({ bottom: this.composerChromeHeight + 8 })
      }

      PreviewDrawerOverlay({
        visible: $drawerOpen,
        sessions: this.drawerSessions,
        refreshing: this.drawerRefreshing,
        newConversationEnabled: !this.isInDraftMode(),
        reduceMotion: this.reduceMotion,
        useDark: this.themeDark,
        onRefresh: () => {
          this.refreshDrawerSessions();
        },
        onNewConversation: () => {
          this.startNewConversation();
        },
        onOpenSettings: () => {
          router.pushUrl({ url: 'pages/PreviewSettingsPage' });
        },
        onSelectSession: (sessionId: string) => {
          this.selectDrawerSession(sessionId);
        },
      })

      PreviewWorkbenchSheet({
        state: s.workbench,
        visible: $workbenchOpen,
        sessionKey: s.fileName,
        initialFocusedToolId: this.focusedToolStepId,
        reduceMotion: this.reduceMotion,
        useDark: this.themeDark,
        onOpenReader: (title: string, body: string, isArtifact: boolean) => {
          this.openReader(title, body, isArtifact);
        },
      })

      AppSheet({
        visible: this.attachSheetOpen,
        title: '',
        actionLabel: '',
        minBodyHeight: 220,
        contentBottomPadding: 32,
        useDark: this.themeDark,
        reduceMotion: this.reduceMotion,
        rows: ['照片与图片', '文件', 'Skill'],
        onPick: (row: string) => {
          if (row === 'Skill') {
            this.attachSheetOpen = false;
            this.skillSheetOpen = true;
          } else if (row === '照片与图片') {
            this.applyPreviewAction({ kind: 'addAttachment', text: 'preview-photo.jpg' });
            this.attachSheetOpen = false;
          } else if (row === '文件') {
            this.applyPreviewAction({ kind: 'addAttachment', text: 'document-preview.pdf' });
            this.attachSheetOpen = false;
          } else {
            this.attachSheetOpen = false;
          }
        },
        onClose: () => {
          this.attachSheetOpen = false;
        },
      })
      PreviewComposerModelSheet({
        visible: this.modelSheetOpen,
        useDark: this.themeDark,
        reduceMotion: this.reduceMotion,
        selectedModelId: $selectedModelId,
        reasoningEffort: $reasoningEffort,
        onClose: () => {
          this.modelSheetOpen = false;
        },
      })
      AppSheet({
        visible: this.skillSheetOpen,
        title: '',
        actionLabel: '',
        minBodyHeight: 240,
        contentBottomPadding: 32,
        useDark: this.themeDark,
        reduceMotion: this.reduceMotion,
        rows: ['/research', '/code-review', '/summarize'],
        onPick: (row: string) => {
          const skill = row.startsWith('/') ? row.substring(1) : row;
          this.applyPreviewAction({ kind: 'addSkill', text: skill });
          this.skillSheetOpen = false;
        },
        onClose: () => {
          this.skillSheetOpen = false;
        },
      })
    }
    .width('100%')
    .height('100%')
    .backgroundColor(HarnessColors.canvas(this.themeDark))
    .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
    .keyboardAvoidMode(KeyboardAvoidMode.RESIZE)
  }
}

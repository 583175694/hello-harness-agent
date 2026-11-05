import { KeyboardAvoidMode, LengthMetrics, ListScroller, router, ScrollAlign } from '@kit.ArkUI';
import { HarnessColors } from '../coreui/HarnessColors';
import { ChatTopBar } from '../preview/ChatTopBar';
import { PreviewSessionState } from '../preview/PreviewFixtureLoader';
import { PreviewAgentSessionPort } from '../preview/PreviewAgentSessionPort';
import { CoreAgentSessionPort } from '../core/CoreAgentSessionPort';
import { HarmonyAttachmentPicker } from '../core/HarmonyAttachmentPicker';
import { ArtifactCardRow, ChatLine } from '../preview/PreviewModels';
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
  PreviewModelDef,
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
  @State coreModelCatalog: PreviewModelDef[] = [];
  @State coreSkillRows: string[] = ['/research', '/code-review', '/summarize'];
  @State serviceBannerDismissed: boolean = false;
  @State themeDark: boolean = PreviewLocalPreferences.themeDark;
  @State reduceMotion: boolean = PreviewLocalPreferences.reduceMotion;
  @State contentFontSize: number = PreviewLocalPreferences.contentFontSize;
  @State drawerRefreshing: boolean = false;
  @State drawerSessions: SessionDrawerRow[] = [];
  @State composerChromeHeight: number = 0;
  private conversationScroller: ListScroller = new ListScroller();
  private replayController: PreviewReplayController = new PreviewReplayController();
  private corePort: CoreAgentSessionPort | null = null;
  private lastSessionKey: string = '';
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
      if (this.corePort !== null) {
        this.corePort.setWorkbenchOpen?.(false);
      }
    }
  }

  @Watch('skillSheetOpen')
  onSkillSheetOpenChange(): void {
    if (!this.skillSheetOpen || this.corePort === null) {
      return;
    }
    void this.corePort.refreshSkillPicker().then(() => {
      if (this.corePort === null) {
        return;
      }
      const names = this.corePort.getSkillPickerNames();
      if (names.length > 0) {
        this.coreSkillRows = names.map((n) => (n.startsWith('/') ? n : `/${n}`));
      }
    });
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
    if (`${params['core'] ?? ''}` === '1' || PreviewLocalPreferences.useCorePort) {
      this.applyCorePort(`${params['title'] ?? 'Core 联调'}`);
      return;
    }
    const fileName = (params['fileName'] as string)?.length > 0 ? `${params['fileName']}` : 'empty-landing.json';
    this.applyFixture(fileName, params['title']);
  }

  private applyCorePort(title: string): void {
    this.replayController.stop();
    this.corePort = new CoreAgentSessionPort();
    this.corePort.onSessionStateChange = (loaded) => {
      const sessionKey = loaded.fileName;
      if (sessionKey.length > 0 && sessionKey !== this.lastSessionKey) {
        this.workbenchOpen = false;
        this.focusedToolStepId = '';
        this.lastSessionKey = sessionKey;
        this.corePort?.setWorkbenchOpen?.(false);
      }
      this.session = loaded;
      this.lines = loaded.lines.slice();
      this.drawerSessions = loaded.sessionDrawer.sessions.slice();
      if (loaded.uiHints.workbenchFocusedToolCallId !== undefined &&
        loaded.uiHints.workbenchFocusedToolCallId.length > 0) {
        this.focusedToolStepId = loaded.uiHints.workbenchFocusedToolCallId;
      }
      if (loaded.uiHints.workbenchFocusHint !== undefined &&
        loaded.uiHints.workbenchFocusHint.length > 0) {
        AppToast.show(loaded.uiHints.workbenchFocusHint);
        this.corePort?.clearWorkbenchFocusHint();
      }
      if (previewUiActionScrollsConversationToBottom('sendText')) {
        this.scrollConversationToBottom();
      }
    };
    this.session = this.corePort.sessionState;
    this.session.title = title;
    this.lines = this.session.lines.slice();
    this.drawerSessions = this.session.sessionDrawer.sessions.slice();
    this.drawerOpen = false;
    this.workbenchOpen = false;
    void this.corePort.bootstrapIfConfigured().then(() => {
      this.syncCoreComposerMenus();
    });
  }

  private pickCoreAttachment(): void {
    if (this.corePort === null) {
      return;
    }
    void HarmonyAttachmentPicker.pickOne().then((picked) => {
      if (picked === null || this.corePort === null) {
        return;
      }
      void this.corePort.uploadComposerAttachment(picked.fileName, picked.data, picked.mediaType);
    });
  }

  private syncCoreComposerMenus(): void {
    if (this.corePort === null) {
      return;
    }
    const models = this.corePort.getComposerModelOptions();
    if (models.length > 0) {
      this.coreModelCatalog = models.map((m) => ({
        id: m.id,
        label: m.label,
        reasoningOptions: m.reasoningOptions.slice(),
      }));
      if (this.coreModelCatalog.find((m) => m.id === this.selectedModelId) === undefined) {
        this.selectedModelId = this.coreModelCatalog[0].id;
        this.reasoningEffort = this.coreModelCatalog[0].reasoningOptions[0] ?? 'high';
      }
    }
    void this.corePort.refreshSkillPicker().then(() => {
      if (this.corePort === null) {
        return;
      }
      const names = this.corePort.getSkillPickerNames();
      if (names.length > 0) {
        this.coreSkillRows = names.map((n) => (n.startsWith('/') ? n : `/${n}`));
      }
    });
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
    this.workbenchOpen = false;
    this.focusedToolStepId = '';
    this.lastSessionKey = loaded.fileName;
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
    if (this.corePort !== null) {
      if (action.kind === 'addSkill' && action.text) {
        this.corePort.addComposerSkill(action.text);
      } else if (action.kind === 'removeAttachment') {
        void this.corePort.removeComposerAttachment?.(action.id ?? '');
      } else if (action.kind === 'sendText' && action.text) {
        const skills = this.session?.composer.selectedSkills ?? [];
        void this.corePort.submitComposerText(
          action.text,
          action.modelId ?? this.selectedModelId,
          action.reasoningEffort ?? this.reasoningEffort,
          skills,
        ).then((accepted: boolean) => {
          if (accepted && this.session !== null) {
            this.session.composer = { ...this.session.composer, submitting: true };
          }
        }).catch((error: Object) => {
          AppToast.show(error instanceof Error ? error.message : '发送失败，请重试');
        });
      } else if (action.kind === 'cancelRun' || action.kind === 'stopRun') {
        void this.corePort.cancelActiveRun();
      } else if (action.kind === 'sendFollowUp') {
        void this.corePort.sendPendingInput(action.id);
      } else if (action.kind === 'dismissFollowUp') {
        void this.corePort.cancelPendingInput(action.id);
      } else if (action.kind === 'submitClarification' && action.text) {
        void this.corePort.respondClarification?.(action.text);
      } else if (action.kind === 'approveTools') {
        void this.corePort.approveToolCalls?.();
      } else if (action.kind === 'rejectTools') {
        void this.corePort.rejectToolCalls?.();
      }
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
    this.corePort?.onAppBackground?.();
  }

  onPageShow(): void {
    this.themeDark = PreviewLocalPreferences.themeDark;
    this.reduceMotion = PreviewLocalPreferences.reduceMotion;
    this.contentFontSize = PreviewLocalPreferences.contentFontSize;
    if (this.corePort !== null) {
      void this.corePort.onAppForeground?.();
    }
  }

  refreshDrawerSessions(): void {
    this.drawerRefreshing = true;
    if (this.corePort !== null) {
      void this.corePort.refreshSessionList?.().then(() => {
        if (this.session !== null) {
          this.drawerSessions = this.session.sessionDrawer.sessions.slice();
        }
        this.drawerRefreshing = false;
      });
      return;
    }
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
    if (this.corePort !== null) {
      void this.corePort.beginNewConversation?.();
      this.drawerOpen = false;
      return true;
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
    if (this.corePort !== null) {
      void this.corePort.selectSession(sessionId);
      this.drawerOpen = false;
      return;
    }
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

  private openArtifactReader(artifact: ArtifactCardRow): void {
    router.pushUrl({
      url: 'pages/PreviewReaderPage',
      params: {
        title: artifact.fileName,
        body: '',
        isArtifact: true,
        artifactId: artifact.artifactId,
        fileId: artifact.fileId ?? '',
        fileName: artifact.fileName,
        mediaType: artifact.mediaType ?? '',
        fileKind: artifact.fileKind ?? '',
      },
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
            if (this.corePort !== null) {
              void this.corePort.openWorkbenchPanel();
            } else {
              this.workbenchOpen = true;
            }
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
            if (s.canLoadOlderMessages === true) {
              ListItem() {
                Text(s.loadingOlderMessages === true ? '正在加载更早消息…' : '加载更早消息')
                  .fontSize(13)
                  .fontColor(HarnessColors.mutedText(this.themeDark))
                  .width('100%')
                  .textAlign(TextAlign.Center)
                  .padding({ top: 12, bottom: 12 })
                  .onClick(() => {
                    if (s.loadingOlderMessages === true || this.corePort === null) {
                      return;
                    }
                    const sessionId = s.fileName;
                    if (sessionId.length === 0 || sessionId === 'core-landing') {
                      return;
                    }
                    void this.corePort.loadOlderMessages(sessionId);
                  })
              }
            }
            ForEach(this.lines, (line: ChatLine, index: number) => {
              ListItem() {
                ConversationTurnRow({
                  line: line,
                  streamingTail: s.replay !== null && line.role === 'assistant' &&
                    index === this.lines.length - 1,
                  fontSize: this.contentFontSize,
                  useDark: this.themeDark,
                  reduceMotion: this.reduceMotion,
                  onOpenWorkbenchStep: (toolId: string) => {
                    this.focusedToolStepId = toolId;
                    this.workbenchOpen = true;
                    if (this.corePort !== null) {
                      const runId = s.workbench.runId ?? s.fileName;
                      void this.corePort.focusWorkbenchToolCall(runId, toolId);
                      void this.corePort.setWorkbenchOpen?.(true);
                    }
                  },
                  onOpenArtifact: (artifact: ArtifactCardRow) => {
                    this.openArtifactReader(artifact);
                  },
                })
              }
            }, (line: ChatLine, index: number) => `${index}-${line.role}`)
            ListItem() {
              Row().width('100%').height(28)
            }
          }
          .layoutWeight(1)
          .padding({ left: 12, right: 12, top: 4 })
          .scrollBar(BarState.Off)
          Row()
            .width('100%')
            .height(18)
            .align(Alignment.Top)
            .linearGradient({
              angle: 180,
              colors: [[HarnessColors.canvas(this.themeDark), 0], ['#00101010', 1]],
            })
            .hitTestBehavior(HitTestMode.None)
          Row()
            .width('100%')
            .height(18)
            .align(Alignment.Bottom)
            .linearGradient({
              angle: 180,
              colors: [['#00101010', 0], [HarnessColors.canvas(this.themeDark), 1]],
            })
            .hitTestBehavior(HitTestMode.None)
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
          modelLabelOverride: formatComposerModelChip(
            this.selectedModelId,
            this.reasoningEffort,
            this.corePort !== null && this.coreModelCatalog.length > 0 ? this.coreModelCatalog : undefined,
          ),
          selectedModelId: this.selectedModelId,
          selectedReasoningEffort: this.reasoningEffort,
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
          onSendComposerText: (text: string, modelId: string, reasoningEffort: string,
            skillNames: string[], onAccepted: (accepted: boolean) => void) => {
            if (this.corePort !== null) {
              void this.corePort.submitComposerText(text, modelId, reasoningEffort, skillNames)
                .then((accepted: boolean) => {
                  onAccepted(accepted);
                })
                .catch((error: Object) => {
                  onAccepted(false);
                  AppToast.show(error instanceof Error ? error.message : '发送失败，请重试');
                });
              return;
            }
            this.applyPreviewAction({ kind: 'sendText', text, modelId, reasoningEffort });
            onAccepted(true);
          },
          onClearComposerRevisionSeed: () => {
            this.corePort?.clearComposerRevisionSeed?.();
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
        loadingMore: s.loadingOlderSessionSummaries === true,
        canLoadMore: s.canLoadOlderSessionSummaries === true,
        newConversationEnabled: !this.isInDraftMode(),
        reduceMotion: this.reduceMotion,
        useDark: this.themeDark,
        liveSessionActions: this.corePort !== null,
        onRefresh: () => {
          this.refreshDrawerSessions();
        },
        onLoadMore: () => {
          void this.corePort?.loadOlderSessionSummaries?.().then(() => {
            if (this.session !== null) {
              this.drawerSessions = this.session.sessionDrawer.sessions.slice();
            }
          });
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
        onRenameSession: (sessionId: string, title: string) => {
          void this.corePort?.renameSession(sessionId, title);
        },
        onTogglePinSession: (sessionId: string) => {
          void this.corePort?.togglePinSession(sessionId);
        },
        onDeleteSession: (sessionId: string) => {
          void this.corePort?.deleteSession(sessionId);
        },
      })

      PreviewWorkbenchSheet({
        state: s.workbench,
        visible: $workbenchOpen,
        sessionKey: s.fileName,
        initialFocusedToolId: this.focusedToolStepId,
        reduceMotion: this.reduceMotion,
        useDark: this.themeDark,
        coreRestoreEnabled: this.corePort !== null,
        onOpenReader: (title: string, body: string, isArtifact: boolean) => {
          this.openReader(title, body, isArtifact);
        },
        onOpenArtifactReader: (artifactId: string, fileId: string, fileName: string,
          mediaType: string, fileKind: string) => {
          this.openArtifactReader({
            artifactId,
            fileId,
            fileName,
            mediaType,
            fileKind,
          });
        },
        onRestoreArtifactVersion: (restoreId: string, expectedId: string) => {
          void this.corePort?.restoreArtifactVersion?.(restoreId, expectedId);
        },
        onBeginArtifactRevision: (artifactId: string) => {
          if (this.corePort !== null) {
            this.corePort.beginArtifactRevision?.(artifactId);
            this.workbenchOpen = false;
          } else {
            AppToast.show('Preview：已预填修改草稿（未写服务器）');
          }
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
          } else if (row === '照片与图片' || row === '文件') {
            if (this.corePort !== null) {
              this.attachSheetOpen = false;
              this.pickCoreAttachment();
            } else if (row === '照片与图片') {
              this.applyPreviewAction({ kind: 'addAttachment', text: 'preview-photo.jpg' });
              this.attachSheetOpen = false;
            } else {
              this.applyPreviewAction({ kind: 'addAttachment', text: 'document-preview.pdf' });
              this.attachSheetOpen = false;
            }
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
        modelCatalog: this.corePort !== null ? this.coreModelCatalog : [],
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
        rows: this.corePort !== null ? this.coreSkillRows : ['/research', '/code-review', '/summarize'],
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
    .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP])
    .keyboardAvoidMode(KeyboardAvoidMode.RESIZE)
  }
}

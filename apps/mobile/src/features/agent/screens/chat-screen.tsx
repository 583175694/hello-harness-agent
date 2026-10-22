import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatTopBar } from '../components/chat-top-bar';
import { ComposerPeekBar } from '../components/composer-peek-bar';
import { ComposerStack } from '../components/composer-stack';
import { ConversationPanel } from '../components/conversation-panel';
import { ComposerBlockBanner } from '../components/composer-block-banner';
import { ServiceBanner, type ServiceState } from '../components/service-banner';
import { SessionDrawer } from '../components/session-drawer';
import { WorkbenchPanel } from '../components/workbench-panel';
import { WorkbenchSheet } from '../components/workbench-sheet';
import { makeMobilePreviewState } from '../fixtures/mobile-preview';
import type { MobilePreviewState } from '../fixtures/mobile-preview.types';
import { normalizeWorkbenchView, resolveMobileWorkbenchVisibleTabs } from '../config/workbench-tabs';
import type {
  WorkbenchActivityEmphasis,
  WorkbenchOpenRequest,
} from '../components/workbench-activity-view';
import type { WorkspaceView } from '../fixtures/ui-fixtures';
import { mobileWorkbenchViewFromFocus } from '../model/workbench-focus';
import { AGENT_UI_COPY, AGENT_UI_LAYOUT } from '../config/ui.constants';
import { catalogPlanFixture } from '../fixtures/ui-catalog-fixtures';
import { useAgentHost } from '../hooks/use-agent-host';
import { useApiBaseUrl } from '../hooks/use-api-base-url';
import {
  readyComposerAttachmentsAsFileRefs,
  useComposerAttachments,
} from '../hooks/use-composer-attachments';
import { useSessionDeepLink } from '../hooks/use-session-deep-link';
import {
  mobileRunPeekSubtitle,
  mobileRunPeekVisible,
  mobileRunSummaryLine,
} from '../model/mobile-run-summary';

type ChatScreenProps = {
  /** 仅 Preview 路由传入；生产路径不得带 fixture 状态。 */
  previewState?: MobilePreviewState | 'default';
  composerMode?: 'default' | 'hitl' | 'clarification';
  showDrawer?: boolean;
  /** Preview：强制 iPad 并排布局 */
  forceSplitLayout?: boolean;
};

function ProductionChatScreenInner({
  showDrawer = false,
  forceSplitLayout = false,
}: Pick<ChatScreenProps, 'showDrawer' | 'forceSplitLayout'>) {
  const host = useAgentHost();
  const { apiBaseUrl } = useApiBaseUrl();
  useSessionDeepLink(host.selectSession);
  const attachments = useComposerAttachments();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isSplitLayout = forceSplitLayout || width >= 768;

  const sheetRef = useRef<BottomSheetModal>(null);
  const [drawerOpen, setDrawerOpen] = useState(showDrawer);
  const [drawerExitInstant, setDrawerExitInstant] = useState(false);
  const [serviceDismissed, setServiceDismissed] = useState(false);

  const workbenchCount = host.workbenchCount;
  const hasDeliverables = host.hasDeliverables;
  const [activityEmphasisOverride, setActivityEmphasisOverride] =
    useState<WorkbenchActivityEmphasis | null>(null);
  const activityEmphasis = activityEmphasisOverride ?? host.activityEmphasis;
  const visibleWorkbenchTabs = useMemo(
    () => resolveMobileWorkbenchVisibleTabs({ workbenchCount, hasDeliverables }),
    [workbenchCount, hasDeliverables],
  );
  const [workbenchView, setWorkbenchView] = useState<WorkspaceView>(() =>
    normalizeWorkbenchView('activity', visibleWorkbenchTabs),
  );
  const [workbenchOpen, setWorkbenchOpen] = useState(isSplitLayout);
  const [selectedToolCallId, setSelectedToolCallId] = useState<string | null>(null);
  const [focusArtifactId, setFocusArtifactId] = useState<string | null>(null);

  const openWorkbench = useCallback(
    (
      request: WorkbenchOpenRequest | WorkspaceView = 'activity',
      snapIndex: number = AGENT_UI_LAYOUT.workbenchSheetDefaultSnapIndex,
    ) => {
      const normalizedRequest: WorkbenchOpenRequest =
        typeof request === 'string' ? { view: request } : request;
      const view = normalizeWorkbenchView(
        normalizedRequest.view ?? 'activity',
        visibleWorkbenchTabs,
      );
      setWorkbenchView(view);
      if (normalizedRequest.toolCallId) {
        setSelectedToolCallId(normalizedRequest.toolCallId);
      }
      if (normalizedRequest.artifactId) {
        setFocusArtifactId(normalizedRequest.artifactId);
      }
      if (normalizedRequest.emphasis) {
        setActivityEmphasisOverride(normalizedRequest.emphasis);
      } else {
        setActivityEmphasisOverride(null);
      }
      setDrawerOpen(false);
      if (isSplitLayout) {
        setWorkbenchOpen(true);
        return;
      }
      const sheet = sheetRef.current;
      if (!sheet) return;
      sheet.present();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          sheetRef.current?.snapToIndex(snapIndex);
        });
      });
    },
    [isSplitLayout, visibleWorkbenchTabs],
  );

  useEffect(() => {
    const target = host.workbench?.focusTarget;
    if (!target || host.activeInterrupt) return;
    setWorkbenchView(
      normalizeWorkbenchView(mobileWorkbenchViewFromFocus(target.kind), visibleWorkbenchTabs),
    );
    if (target.kind === 'tool_call') {
      setSelectedToolCallId(target.toolCallId);
    }
    if (target.kind === 'artifact') {
      setFocusArtifactId(target.artifactId);
    }
  }, [host.workbench?.focusTarget, host.activeInterrupt, visibleWorkbenchTabs]);

  const closeWorkbench = useCallback(() => {
    if (isSplitLayout) {
      setWorkbenchOpen(true);
      return;
    }
    sheetRef.current?.dismiss();
  }, [isSplitLayout]);

  const openDrawer = useCallback(() => {
    setDrawerExitInstant(false);
    if (!isSplitLayout) {
      sheetRef.current?.dismiss();
    }
    setDrawerOpen(true);
  }, [isSplitLayout]);

  const openSettingsFromDrawer = useCallback(() => {
    setDrawerExitInstant(true);
    setDrawerOpen(false);
    router.push('/settings');
  }, [router]);

  useEffect(() => {
    if (!drawerOpen) setDrawerExitInstant(false);
  }, [drawerOpen]);

  useEffect(() => {
    if (host.serviceState === 'unavailable') {
      setServiceDismissed(false);
    }
  }, [host.serviceState]);

  const handleRetryService = useCallback(async () => {
    const ready = await host.refreshReadiness();
    if (ready) {
      await host.refreshSessions();
    }
  }, [host]);

  const title =
    host.sessionDetail?.title ??
    (host.selectedSessionId ? '会话' : AGENT_UI_COPY.defaultSessionTitle);
  const isLandingSession =
    !host.sessionDetailLoading && host.conversation.length === 0 && host.activeInterrupt == null;
  const serviceState = host.serviceState as ServiceState;
  const showServiceBanner = !serviceDismissed && serviceState !== 'ready';
  const composerTextMode =
    host.composerBlock != null
      ? 'disabled'
      : host.activeInterrupt?.kind === 'clarification'
        ? 'clarification'
        : host.activeInterrupt != null
          ? 'disabled'
          : host.runSubmitting || host.activeRunId
            ? 'steer'
            : serviceState === 'ready' && host.defaultModelId
              ? 'new-run'
              : 'disabled';

  const activeRunSessionId = host.activeRunId && host.selectedSessionId ? host.selectedSessionId : null;
  const runSummary =
    mobileRunSummaryLine(host.workbench) ??
    (__DEV__ ? `API ${apiBaseUrl}` : undefined);
  const showRunPeek = mobileRunPeekVisible(host.workbench, host.activeRunId);

  return (
    <>
      <View
        className="flex-1 bg-canvas"
        style={{ paddingTop: insets.top }}
        pointerEvents="box-none"
      >
        <ChatTopBar
          title={title}
          runSummary={runSummary}
          workbenchBadge={workbenchCount}
          connectionState={host.connectionState}
          onOpenDrawer={openDrawer}
          onOpenWorkbench={() => openWorkbench('activity')}
        />
        {showServiceBanner ? (
          <ServiceBanner
            state={serviceState}
            onRetry={() => void handleRetryService()}
            onDismiss={() => setServiceDismissed(true)}
          />
        ) : null}
        {host.composerBlock ? (
          <ComposerBlockBanner
            block={host.composerBlock}
            onCreateSession={() => void host.beginNewSession()}
            onDismiss={host.dismissComposerBlock}
          />
        ) : null}

        <View className="flex-1 flex-row">
          <View className="relative flex-1">
            <ConversationPanel
              conversation={host.conversation}
              apiBaseUrl={host.apiBaseUrl}
              bottomInset={insets.bottom + (showRunPeek ? 200 : 160)}
              scrollEnabled
              landingLayout={isLandingSession}
              onOpenWorkbench={(request) => openWorkbench(request ?? { view: 'activity' })}
            />
            {showRunPeek ? (
              <ComposerPeekBar
                title={runSummary ?? '正在执行任务'}
                subtitle={mobileRunPeekSubtitle(host.workbench)}
                onPress={() => openWorkbench('activity')}
              />
            ) : null}
            <ComposerStack
              composerTextMode={composerTextMode}
              submitting={host.runSubmitting}
              bottomInset={insets.bottom}
              composerModels={host.composerModels}
              defaultModelId={host.defaultModelId}
              defaultReasoningEffort={host.defaultReasoningEffort}
              composerPlan={host.composerPlan}
              composerPlanExplanation={host.composerPlanExplanation}
              followUpItems={host.followUpItems}
              followUpSubmittingId={host.followUpSubmittingId}
              onFollowUpSend={(id) => void host.sendFollowUp(id)}
              onFollowUpDismiss={(id) => void host.cancelFollowUp(id)}
              composerRevisionSeed={host.composerRevisionSeed}
              activeInterrupt={host.activeInterrupt}
              hitlSubmitting={host.hitlSubmitting}
              onClarificationRespond={(answer) => void host.respondClarification(answer)}
              onToolApproval={(approve) => void host.respondToolApproval(approve)}
              composerAttachments={host.activeInterrupt ? undefined : attachments.items}
              onPickImages={() => void attachments.pickImages()}
              onPickFiles={() => void attachments.pickFiles()}
              onReconcileDraftChange={attachments.reconcileDraftChange}
              onRemoveAttachment={attachments.removeItem}
              onRetryAttachment={(id) => void attachments.retryItem(id)}
              onSubmit={(payload) => {
                const optimisticAttachments = readyComposerAttachmentsAsFileRefs(attachments.items);
                attachments.clearItems();
                void host.submitRun({
                  ...payload,
                  optimisticAttachments: optimisticAttachments.length
                    ? optimisticAttachments
                    : undefined,
                });
              }}
              onCancelRun={() => void host.cancelActiveRun()}
            />
          </View>
          {isSplitLayout && workbenchOpen ? (
            <WorkbenchPanel
              activeView={workbenchView}
              workbenchCount={workbenchCount}
              hasDeliverables={hasDeliverables}
              activityEmphasis={activityEmphasis}
              workbench={host.workbench}
              selectedToolCallId={selectedToolCallId}
              focusArtifactId={focusArtifactId}
              onSelectToolCall={setSelectedToolCallId}
              onViewChange={setWorkbenchView}
              activeRunId={host.activeRunId}
              onPauseRun={() => void host.pauseActiveRun()}
              onResumeRun={() => void host.resumeActiveRun()}
              workbenchReportId={host.workbenchReportId}
            />
          ) : null}
        </View>
      </View>

      <SessionDrawer
        visible={drawerOpen}
        exitInstant={drawerExitInstant}
        onClose={() => setDrawerOpen(false)}
        onOpenSettings={openSettingsFromDrawer}
        dataSource="api"
        sessions={host.sessions}
        selectedSessionId={host.selectedSessionId}
        activeRunSessionId={activeRunSessionId}
        onSelectSession={(sessionId) => void host.selectSession(sessionId)}
        onCreateSession={() => void host.beginNewSession()}
        onRenameSession={(sessionId, title) => void host.updateSession(sessionId, { title })}
        onTogglePinSession={(sessionId, isPinned) =>
          void host.updateSession(sessionId, { isPinned })
        }
        onDeleteSession={(sessionId) => void host.deleteSession(sessionId)}
        onRefreshSessions={() => host.refreshSessions()}
        sessionsRefreshing={host.sessionsLoading}
      />

      {!isSplitLayout ? (
        <WorkbenchSheet
          ref={sheetRef}
          activeView={workbenchView}
          workbenchCount={workbenchCount}
          hasDeliverables={hasDeliverables}
          activityEmphasis={activityEmphasis}
          workbench={host.workbench}
          selectedToolCallId={selectedToolCallId}
          focusArtifactId={focusArtifactId}
          onSelectToolCall={setSelectedToolCallId}
          onRequestClose={closeWorkbench}
          onViewChange={setWorkbenchView}
          activeRunId={host.activeRunId}
          onPauseRun={() => void host.pauseActiveRun()}
          onResumeRun={() => void host.resumeActiveRun()}
          workbenchReportId={host.workbenchReportId}
        />
      ) : null}
    </>
  );
}

function PreviewChatScreenInner({
  previewState = 'default',
  composerMode,
  showDrawer = false,
  forceSplitLayout = false,
}: Required<Pick<ChatScreenProps, 'previewState'>> &
  Pick<ChatScreenProps, 'composerMode' | 'showDrawer' | 'forceSplitLayout'>) {
  const fixture = useMemo(() => makeMobilePreviewState(previewState), [previewState]);
  const composer = useMemo(
    () => ({
      ...fixture.composer,
      ...(composerMode ? { mode: composerMode } : {}),
    }),
    [fixture.composer, composerMode],
  );

  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isSplitLayout = forceSplitLayout || width >= 768;

  const sheetRef = useRef<BottomSheetModal>(null);
  const [drawerOpen, setDrawerOpen] = useState(showDrawer);
  const [drawerExitInstant, setDrawerExitInstant] = useState(false);
  const [serviceDismissed, setServiceDismissed] = useState(false);
  const [serviceState, setServiceState] = useState<ServiceState>(
    fixture.chrome?.serviceState ?? 'ready',
  );

  const workbenchConfig = fixture.workbench;
  const workbenchCount = workbenchConfig?.workbenchCount ?? 0;
  const hasDeliverables =
    workbenchConfig?.hasDeliverables ?? (workbenchConfig?.workbenchCount ?? 0) > 0;
  const activityEmphasis = workbenchConfig?.activityEmphasis ?? 'default';
  const visibleWorkbenchTabs = useMemo(
    () => resolveMobileWorkbenchVisibleTabs({ workbenchCount, hasDeliverables }),
    [workbenchCount, hasDeliverables],
  );
  const [workbenchView, setWorkbenchView] = useState<WorkspaceView>(() =>
    normalizeWorkbenchView(fixture.workbench?.initialView, visibleWorkbenchTabs),
  );
  const [workbenchOpen, setWorkbenchOpen] = useState(isSplitLayout);
  const openWorkbench = useCallback(
    (
      view: WorkspaceView = 'activity',
      snapIndex: number = AGENT_UI_LAYOUT.workbenchSheetDefaultSnapIndex,
    ) => {
      setWorkbenchView(view);
      if (isSplitLayout) {
        setWorkbenchOpen(true);
        return;
      }
      const sheet = sheetRef.current;
      if (!sheet) {
        return;
      }
      sheet.present();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          sheetRef.current?.snapToIndex(snapIndex);
        });
      });
    },
    [isSplitLayout],
  );

  const closeWorkbench = useCallback(() => {
    if (isSplitLayout) {
      setWorkbenchOpen(true);
      return;
    }
    sheetRef.current?.dismiss();
  }, [isSplitLayout]);

  const openDrawer = useCallback(() => {
    setDrawerExitInstant(false);
    setDrawerOpen(true);
  }, []);

  const openSettingsFromDrawer = useCallback(() => {
    setDrawerExitInstant(true);
    setDrawerOpen(false);
    router.push('/settings');
  }, [router]);

  useEffect(() => {
    if (!drawerOpen) {
      setDrawerExitInstant(false);
    }
  }, [drawerOpen]);

  const handleOpenWorkbenchFromConversation = useCallback(
    (request?: WorkbenchOpenRequest) => {
      openWorkbench(
        normalizeWorkbenchView(request?.view ?? 'activity', visibleWorkbenchTabs),
      );
    },
    [openWorkbench, visibleWorkbenchTabs],
  );

  useEffect(() => {
    if (previewState === 'default') {
      return;
    }
    const nextView = normalizeWorkbenchView(fixture.workbench?.initialView, visibleWorkbenchTabs);
    setWorkbenchView(nextView);
    const initialIndex = fixture.workbench?.initialSheetIndex ?? -1;
    if (initialIndex >= 0) {
      openWorkbench(nextView, initialIndex);
    }
  }, [
    previewState,
    fixture.workbench?.initialView,
    fixture.workbench?.initialSheetIndex,
    visibleWorkbenchTabs,
    openWorkbench,
  ]);

  const chrome = fixture.chrome;
  const connectionState = chrome?.connectionState ?? 'live';
  const runSummary = chrome?.runSummary;
  const showPeek =
    composer.submitting && !isSplitLayout && Boolean(chrome?.peekBarTitle);
  const peekTitle =
    chrome?.peekBarTitle ??
    catalogPlanFixture.plan.find((s) => s.status === 'in_progress')?.step ??
    '正在执行任务';

  const showServiceBanner = !serviceDismissed && serviceState !== 'ready';

  return (
    <>
      <View
        className="flex-1 bg-canvas"
        style={{ paddingTop: insets.top }}
        pointerEvents="box-none"
      >
        <ChatTopBar
          title={fixture.title}
          runSummary={runSummary}
          connectionState={connectionState}
          onOpenDrawer={openDrawer}
          onOpenWorkbench={() => openWorkbench('activity')}
        />
        {showServiceBanner ? (
          <ServiceBanner
            state={serviceState}
            onRetry={() => setServiceState('checking')}
            onDismiss={() => setServiceDismissed(true)}
          />
        ) : null}

        <View className="flex-1 flex-row">
          <View className={isSplitLayout ? 'flex-1' : 'flex-1'}>
            <ConversationPanel
              conversation={fixture.conversation}
              bottomInset={insets.bottom + (showPeek ? 200 : 160)}
              scrollEnabled
              onOpenWorkbench={handleOpenWorkbenchFromConversation}
            />
            {showPeek ? (
              <ComposerPeekBar
                title={peekTitle}
                subtitle={chrome?.peekBarSubtitle}
                onPress={() => openWorkbench('activity')}
              />
            ) : null}
            <ComposerStack {...composer} bottomInset={insets.bottom} />
          </View>
          {isSplitLayout && workbenchOpen ? (
            <WorkbenchPanel
              activeView={workbenchView}
              workbenchCount={workbenchCount}
              hasDeliverables={hasDeliverables}
              activityEmphasis={activityEmphasis}
              onViewChange={setWorkbenchView}
            />
          ) : null}
        </View>
      </View>

      <SessionDrawer
        visible={drawerOpen}
        exitInstant={drawerExitInstant}
        onClose={() => setDrawerOpen(false)}
        onOpenSettings={openSettingsFromDrawer}
        dataSource="fixture"
      />

      {!isSplitLayout ? (
        <WorkbenchSheet
          ref={sheetRef}
          activeView={workbenchView}
          workbenchCount={workbenchCount}
          hasDeliverables={hasDeliverables}
          activityEmphasis={activityEmphasis}
          onRequestClose={closeWorkbench}
          onViewChange={setWorkbenchView}
        />
      ) : null}
    </>
  );
}

function ChatScreenInner(props: ChatScreenProps) {
  if (props.previewState === undefined) {
    return (
      <ProductionChatScreenInner
        showDrawer={props.showDrawer}
        forceSplitLayout={props.forceSplitLayout}
      />
    );
  }
  return <PreviewChatScreenInner {...props} previewState={props.previewState} />;
}

export function ChatScreen(props: ChatScreenProps) {
  return (
    <BottomSheetModalProvider>
      <ChatScreenInner {...props} />
    </BottomSheetModalProvider>
  );
}

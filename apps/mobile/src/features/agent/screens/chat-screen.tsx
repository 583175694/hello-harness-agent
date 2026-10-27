import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { useRouter } from 'expo-router';
import type { WorkbenchState } from '@harness/agent-ui-types';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatTopBar } from '../components/chat-top-bar';
import { ComposerPeekBar } from '../components/composer-peek-bar';
import { ComposerStack } from '../components/composer-stack';
import { ChatComposerOverlays } from '../components/chat-composer-overlays';
import { ConversationPanel } from '../components/conversation-panel';
import { ComposerBlockBanner } from '../components/composer-block-banner';
import { AuthBanner } from '@/features/auth/auth-banner';
import { useMobileAuth } from '@/providers/mobile-auth-provider';
import { ServiceBanner, type ServiceState } from '../components/service-banner';
import { SessionDrawer } from '../components/session-drawer';
import { makeMobilePreviewState } from '../fixtures/mobile-preview';
import type { MobilePreviewState } from '../fixtures/mobile-preview.types';
import type { WorkbenchOpenRequest } from '../components/workbench-activity-view';
import { ChatWorkbenchSurfaces } from '../components/chat-workbench-surfaces';
import { ChatKeyboardShell } from '../components/chat-keyboard-shell';
import { AGENT_UI_COPY } from '../config/ui.constants';
import { catalogPlanFixture } from '../fixtures/ui-catalog-fixtures';
import {
  useAgentHostComposerSnapshot,
  useAgentHostConnectionState,
  useAgentHostConversation,
  useAgentHostSession,
  useAgentHostWorkbenchSnapshot,
} from '../hooks/use-agent-host';
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
import { useComposerOverlayState } from '../hooks/use-composer-overlay-state';
import { useChatWorkbenchChrome } from '../hooks/use-chat-workbench-chrome';
import { useSkillCatalogWarmup } from '../hooks/use-skill-catalog';

type ChatScreenProps = {
  /** 仅 Preview 路由传入；生产路径不得带 fixture 状态。 */
  previewState?: MobilePreviewState | 'default';
  composerMode?: 'default' | 'hitl' | 'clarification';
  showDrawer?: boolean;
  /** Preview：强制 iPad 并排布局 */
  forceSplitLayout?: boolean;
};

function ProductionChatConversationStack({
  bottomInset,
  onOpenWorkbench,
  showRunPeek,
  runSummary,
  workbench,
  drawerOpen,
}: {
  bottomInset: number;
  onOpenWorkbench: (request?: WorkbenchOpenRequest) => void;
  showRunPeek: boolean;
  runSummary: string | null;
  workbench?: WorkbenchState;
  drawerOpen?: boolean;
}) {
  const conversation = useAgentHostConversation();
  const { apiBaseUrl, sessionDetailLoading } = useAgentHostSession();
  const composer = useAgentHostComposerSnapshot();
  const isLandingSession =
    !sessionDetailLoading && conversation.length === 0 && composer.activeInterrupt == null;

  return (
    <>
      <ConversationPanel
        conversation={conversation}
        apiBaseUrl={apiBaseUrl}
        bottomInset={bottomInset}
        scrollEnabled={!drawerOpen}
        landingLayout={isLandingSession}
        onOpenWorkbench={(request) => onOpenWorkbench(request ?? { view: 'activity' })}
      />
      {showRunPeek ? (
        <ComposerPeekBar
          title={runSummary ?? '正在执行任务'}
          subtitle={mobileRunPeekSubtitle(workbench)}
          onPress={() => onOpenWorkbench({ view: 'activity' })}
        />
      ) : null}
    </>
  );
}

function ProductionChatComposer({
  bottomInset,
  composerTextMode,
  attachments,
  composerOverlays,
}: {
  bottomInset: number;
  composerTextMode: 'new-run' | 'steer' | 'clarification' | 'disabled';
  attachments: ReturnType<typeof useComposerAttachments>;
  composerOverlays: ReturnType<typeof useComposerOverlayState>;
}) {
  const session = useAgentHostSession();
  const composer = useAgentHostComposerSnapshot();

  return (
    <ComposerStack
      hideInlineOverlays
      attachmentSheetOpen={composerOverlays.attachmentSheetOpen}
      onAttachmentSheetOpenChange={composerOverlays.setAttachmentSheetOpen}
      skillPickerOpen={composerOverlays.skillPickerOpen}
      onSkillPickerOpenChange={composerOverlays.setSkillPickerOpen}
      selectedSkills={composerOverlays.selectedSkills}
      onToggleSkill={composerOverlays.toggleSkill}
      composerTextMode={composerTextMode}
      submitting={composer.runSubmitting}
      bottomInset={bottomInset}
      composerModels={composer.composerModels}
      defaultModelId={composer.defaultModelId}
      defaultReasoningEffort={composer.defaultReasoningEffort}
      composerPlan={composer.composerPlan}
      composerPlanExplanation={composer.composerPlanExplanation}
      followUpItems={composer.followUpItems}
      followUpSubmittingId={composer.followUpSubmittingId}
      onFollowUpSend={(id) => void session.sendFollowUp(id)}
      onFollowUpDismiss={(id) => void session.cancelFollowUp(id)}
      composerRevisionSeed={composer.composerRevisionSeed}
      activeInterrupt={composer.activeInterrupt}
      hitlSubmitting={composer.hitlSubmitting}
      onClarificationRespond={(answer) => void session.respondClarification(answer)}
      onToolApproval={(approve) => void session.respondToolApproval(approve)}
      composerAttachments={composer.activeInterrupt ? undefined : attachments.items}
      onPickImages={() => void attachments.pickImages()}
      onPickFiles={() => void attachments.pickFiles()}
      onReconcileDraftChange={attachments.reconcileDraftChange}
      onRemoveAttachment={attachments.removeItem}
      onRetryAttachment={(id) => void attachments.retryItem(id)}
      onSubmit={(payload) => {
        const optimisticAttachments = readyComposerAttachmentsAsFileRefs(attachments.items);
        attachments.clearItems();
        void session.submitRun({
          ...payload,
          optimisticAttachments: optimisticAttachments.length ? optimisticAttachments : undefined,
        });
      }}
      onCancelRun={() => void session.cancelActiveRun()}
    />
  );
}

function ProductionChatScreenInner({
  showDrawer = false,
  forceSplitLayout = false,
}: Pick<ChatScreenProps, 'showDrawer' | 'forceSplitLayout'>) {
  const session = useAgentHostSession();
  useSkillCatalogWarmup();
  const workbenchSnap = useAgentHostWorkbenchSnapshot();
  const composerSnap = useAgentHostComposerSnapshot();
  const connectionState = useAgentHostConnectionState();
  const { needsLogin, authChecking } = useMobileAuth();
  useSessionDeepLink(session.selectSession);
  const attachments = useComposerAttachments();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isSplitLayout = forceSplitLayout || width >= 768;

  const [drawerOpen, setDrawerOpen] = useState(showDrawer);
  const [drawerExitInstant, setDrawerExitInstant] = useState(false);
  const [serviceDismissed, setServiceDismissed] = useState(false);
  const [authBannerDismissed, setAuthBannerDismissed] = useState(false);
  const composerOverlays = useComposerOverlayState();

  const workbenchCount = workbenchSnap.workbenchCount;
  const hasDeliverables = workbenchSnap.hasDeliverables;
  const workbench = workbenchSnap.workbench;
  const activeRunId = workbenchSnap.activeRunId;

  const workbenchChrome = useChatWorkbenchChrome({
    isSplitLayout,
    workbenchCount,
    hasDeliverables,
    baselineActivityEmphasis: workbenchSnap.activityEmphasis,
    workbench,
    sessionKey: session.selectedSessionId,
    suppressFocusTarget: composerSnap.activeInterrupt != null,
  });
  const {
    sheetRef,
    workbenchView,
    setWorkbenchView,
    splitPaneOpen,
    openWorkbench,
    closeWorkbench,
    activityEmphasis,
    selectedToolCallId,
    focusArtifactId,
    setSelectedToolCallId,
  } = workbenchChrome;

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
    if (!drawerOpen) setDrawerExitInstant(false);
  }, [drawerOpen]);

  useEffect(() => {
    if (session.serviceState === 'unavailable') {
      setServiceDismissed(false);
    }
  }, [session.serviceState]);

  const handleRetryService = useCallback(async () => {
    const ready = await session.refreshReadiness();
    if (ready) {
      await session.refreshSessions();
    }
  }, [session]);

  const title =
    session.sessionDetail?.title ??
    (session.selectedSessionId ? '会话' : AGENT_UI_COPY.defaultSessionTitle);
  const serviceState = session.serviceState as ServiceState;
  const showServiceBanner = !serviceDismissed && serviceState !== 'ready';
  const showAuthBanner =
    !authBannerDismissed && serviceState === 'ready' && needsLogin && !authChecking;
  const composerTextMode =
    composerSnap.composerBlock != null
      ? 'disabled'
      : composerSnap.activeInterrupt?.kind === 'clarification'
        ? 'clarification'
        : composerSnap.activeInterrupt != null
          ? 'disabled'
          : composerSnap.runSubmitting || activeRunId
            ? 'steer'
            : serviceState === 'ready' && composerSnap.defaultModelId && !needsLogin
              ? 'new-run'
              : 'disabled';

  const activeRunSessionId =
    activeRunId && session.selectedSessionId ? session.selectedSessionId : null;
  const runSummary = mobileRunSummaryLine(workbench);
  const showRunPeek = mobileRunPeekVisible(workbench, activeRunId);

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
          connectionState={connectionState}
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
        {showAuthBanner ? (
          <AuthBanner
            onLogin={() => router.push('/settings/login')}
            onDismiss={() => setAuthBannerDismissed(true)}
          />
        ) : null}
        {composerSnap.composerBlock ? (
          <ComposerBlockBanner
            block={composerSnap.composerBlock}
            onCreateSession={() => void session.beginNewSession()}
            onDismiss={session.dismissComposerBlock}
          />
        ) : null}

        <View className="flex-1 flex-row">
          <ChatKeyboardShell>
            <View className="relative flex-1">
              <ProductionChatConversationStack
                bottomInset={insets.bottom + (showRunPeek ? 200 : 160)}
                onOpenWorkbench={openWorkbench}
                showRunPeek={showRunPeek}
                runSummary={runSummary ?? null}
                workbench={workbench}
                drawerOpen={drawerOpen}
              />
              <ProductionChatComposer
                bottomInset={insets.bottom}
                composerTextMode={composerTextMode}
                attachments={attachments}
                composerOverlays={composerOverlays}
              />
            </View>
          </ChatKeyboardShell>
        </View>

        <SessionDrawer
          visible={drawerOpen}
          exitInstant={drawerExitInstant}
          onClose={() => setDrawerOpen(false)}
          onOpenSettings={openSettingsFromDrawer}
          dataSource="api"
          sessions={session.sessions}
          selectedSessionId={session.selectedSessionId}
          activeRunSessionId={activeRunSessionId}
          onSelectSession={(sessionId) => void session.selectSession(sessionId)}
          onCreateSession={() => void session.beginNewSession()}
          onRenameSession={(sessionId, title) => void session.updateSession(sessionId, { title })}
          onTogglePinSession={(sessionId, isPinned) =>
            void session.updateSession(sessionId, { isPinned })
          }
          onDeleteSession={(sessionId) => void session.deleteSession(sessionId)}
          onRefreshSessions={() => session.refreshSessions()}
          sessionsRefreshing={session.sessionsLoading}
        />
      </View>

      <ChatWorkbenchSurfaces
        isSplitLayout={isSplitLayout}
        splitPaneOpen={splitPaneOpen}
        sheetRef={sheetRef}
        activeView={workbenchView}
        workbenchCount={workbenchCount}
        hasDeliverables={hasDeliverables}
        activityEmphasis={activityEmphasis}
        workbench={workbench}
        selectedToolCallId={selectedToolCallId}
        focusArtifactId={focusArtifactId}
        onSelectToolCall={setSelectedToolCallId}
        onViewChange={setWorkbenchView}
        onRequestClose={closeWorkbench}
        activeRunId={activeRunId}
        onPauseRun={() => void session.pauseActiveRun()}
        onResumeRun={() => void session.resumeActiveRun()}
        workbenchReportId={workbenchSnap.workbenchReportId}
      />

      <ChatComposerOverlays
        attachmentSheetOpen={composerOverlays.attachmentSheetOpen}
        onAttachmentSheetOpenChange={composerOverlays.setAttachmentSheetOpen}
        onAttachmentSheetDidClose={composerOverlays.handleAttachmentSheetDidClose}
        closeAttachmentSheetThen={composerOverlays.closeAttachmentSheetThen}
        skillPickerOpen={composerOverlays.skillPickerOpen}
        onSkillPickerOpenChange={composerOverlays.setSkillPickerOpen}
        selectedSkills={composerOverlays.selectedSkills}
        onToggleSkill={composerOverlays.toggleSkill}
        onPickImages={() => void attachments.pickImages()}
        onPickFiles={() => void attachments.pickFiles()}
      />
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

  const {
    sheetRef,
    workbenchView,
    setWorkbenchView,
    splitPaneOpen,
    openWorkbench,
    closeWorkbench,
    activityEmphasis,
  } = useChatWorkbenchChrome({
    isSplitLayout,
    workbenchCount,
    hasDeliverables,
    baselineActivityEmphasis: workbenchConfig?.activityEmphasis ?? 'default',
    initialView: workbenchConfig?.initialView,
    initialSheetIndex: workbenchConfig?.initialSheetIndex,
    autoPresentOnMount: previewState !== 'default',
  });

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
      openWorkbench(request ?? { view: 'activity' });
    },
    [openWorkbench],
  );

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
          <ChatKeyboardShell>
            <View className="relative flex-1">
              <ConversationPanel
                conversation={fixture.conversation}
                bottomInset={insets.bottom + (showPeek ? 200 : 160)}
                scrollEnabled
                previewLegacyBlocks
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
          </ChatKeyboardShell>
        </View>

        <SessionDrawer
          visible={drawerOpen}
          exitInstant={drawerExitInstant}
          onClose={() => setDrawerOpen(false)}
          onOpenSettings={openSettingsFromDrawer}
          dataSource="fixture"
        />
      </View>

      <ChatWorkbenchSurfaces
        isSplitLayout={isSplitLayout}
        splitPaneOpen={splitPaneOpen}
        sheetRef={sheetRef}
        activeView={workbenchView}
        workbenchCount={workbenchCount}
        hasDeliverables={hasDeliverables}
        activityEmphasis={activityEmphasis}
        onViewChange={setWorkbenchView}
        onRequestClose={closeWorkbench}
        usePreviewFixtures
      />
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

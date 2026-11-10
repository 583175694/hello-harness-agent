package com.harness.agent.ui

import com.harness.agent.BuildConfig
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.harness.agent.coreui.primitives.Badge
import com.harness.agent.coreui.primitives.AppScaffold
import com.harness.agent.coreui.primitives.AppText
import com.harness.agent.coreui.primitives.AppTextStyle
import com.harness.agent.ui.settings.SettingsGroup
import com.harness.agent.ui.settings.SettingsNavRow
import com.harness.agent.ui.settings.SettingsTopBar
import com.harness.agent.coreui.tokens.HarnessLayout
import com.harness.agent.coreui.tokens.LocalHarnessColors
import com.harness.agent.preview.PreviewAppPreferences
import com.harness.agent.coreui.feedback.LocalAppToast
import com.harness.agent.preview.PreviewSessionViewModel
import com.harness.agent.ui.chat.ConversationScrollOnEnterAndUserSendEffect
import com.harness.agent.ui.chat.rememberConversationListState
import com.harness.agent.ui.chat.LoadOlderMessagesBanner
import com.harness.agent.ui.chat.ServiceBanner
import com.harness.agent.ui.chat.formatApiProblemToast
import com.harness.agent.ui.chat.ChatLandingHero
import com.harness.agent.ui.chat.ChatTopBar
import com.harness.agent.preview.PreviewUiAction
import com.harness.agent.ui.chat.ComposerStack
import com.harness.agent.preview.PreviewChromeFlags
import com.harness.agent.ui.chat.PlanFloatingCard
import com.harness.agent.ui.chat.rememberDismissKeyboard
import com.harness.agent.ui.chat.ConversationTurnRow
import com.harness.agent.ui.chat.SessionDrawerOverlay
import com.harness.agent.MainActivity
import com.harness.agent.ui.workbench.WorkbenchSheetOverlay
import com.harness.agent.model.ArtifactItem
import com.harness.agent.model.toReaderTarget
import com.harness.agent.model.ReaderTarget
import com.harness.agent.model.WorkbenchDeliverableFile
import kotlinx.coroutines.launch

@Composable
fun PreviewDevMenuScreen(
    viewModel: PreviewSessionViewModel,
    onOpenScenario: (String) -> Unit,
    onOpenSettings: () -> Unit,
    onBack: (() -> Unit)? = null,
) {
    val fixtures =
        remember(viewModel.fixtures) {
            viewModel.fixtures.sortedWith(
                compareBy({ MainActivity.demoFixtureSortRank(it.fileName) }, { it.fileName }),
            )
        }
    val colors = LocalHarnessColors.current
    AppScaffold(
        topBar = {
            if (onBack != null) {
                SettingsTopBar(title = "演示场景", onBack = onBack)
            }
        },
    ) {
        Column(
            modifier =
                Modifier
                    .fillMaxSize()
                    .background(colors.canvas)
                    .verticalScroll(rememberScrollState())
                    .padding(top = 8.dp, bottom = 16.dp),
            verticalArrangement = Arrangement.spacedBy(HarnessLayout.settingsGroupGap),
        ) {
            SettingsGroup(sectionLabel = "快捷") {
                SettingsNavRow(
                    title = "设置",
                    onClick = onOpenSettings,
                    showDivider = false,
                    modifier = Modifier.testTag("dev-menu-settings"),
                )
            }
            SettingsGroup(sectionLabel = "场景") {
                fixtures.forEachIndexed { index, item ->
                    SettingsNavRow(
                        title = item.title,
                        onClick = { onOpenScenario(item.fileName) },
                        showDivider = index < fixtures.lastIndex,
                        modifier = Modifier.testTag("dev-menu-fixture-${item.fileName}"),
                    )
                }
            }
        }
    }
}

@Composable
fun PreviewChatShellScreen(
    viewModel: PreviewSessionViewModel,
    preferences: PreviewAppPreferences,
    fixtureFileName: String,
    onLoadDemoFixture: () -> Unit = {},
    onOpenSettings: () -> Unit,
    onOpenLogin: () -> Unit = {},
    onOpenReportReader: (title: String, markdown: String) -> Unit,
    onOpenArtifactReader: (ReaderTarget) -> Unit,
) {
    val context = LocalContext.current
    val imagePicker =
        rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
            uri?.let { viewModel.uploadComposerAttachment(context.contentResolver, it) }
        }
    val documentPicker =
        rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
            uri?.let { viewModel.uploadComposerAttachment(context.contentResolver, it) }
        }
    val modelCatalog by viewModel.composerModelCatalog.collectAsState()
    val skillPickerNames by viewModel.skillPickerNames.collectAsState()
    val state by viewModel.sessionState.collectAsState()
    val drawerOpen by viewModel.drawerOpen.collectAsState()
    val drawerSessions by viewModel.drawerSessions.collectAsState()
    val drawerRefreshing by viewModel.drawerRefreshing.collectAsState()
    val menuTarget by viewModel.sessionMenuTarget.collectAsState()
    val selectedSessionId by viewModel.selectedSessionId.collectAsState()
    val inDraftMode = selectedSessionId?.startsWith("draft-") == true
    val toast = LocalAppToast.current
    val scope = rememberCoroutineScope()
    var workbenchOpen by remember { mutableStateOf(false) }
    var focusedToolStepId by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(state.scenarioId) {
        workbenchOpen = false
        focusedToolStepId = null
        if (viewModel.coreEngineActive) {
            viewModel.syncWorkbenchOpenFromUi(false)
        }
    }
    LaunchedEffect(state.uiHints.workbenchFocusedToolCallId) {
        val toolId = state.uiHints.workbenchFocusedToolCallId
        if (viewModel.coreEngineActive && !toolId.isNullOrBlank()) {
            focusedToolStepId = toolId
        }
    }
    LaunchedEffect(state.uiHints.workbenchFocusHint) {
        val hint = state.uiHints.workbenchFocusHint
        if (viewModel.coreEngineActive && !hint.isNullOrBlank()) {
            toast.show(hint)
            viewModel.clearWorkbenchFocusHint()
        }
    }
    LaunchedEffect(viewModel.coreEngineActive) {
        if (!viewModel.coreEngineActive) return@LaunchedEffect
        viewModel.apiErrorToasts.collect { message ->
            toast.show(message)
        }
    }
    LaunchedEffect(state.scenarioId, state.problemTitle, state.problemDetail) {
        if (viewModel.coreEngineActive) return@LaunchedEffect
        formatApiProblemToast(state.problemTitle, state.problemDetail)?.let { message ->
            toast.show(message)
        }
    }

    PreviewChatShellLayout(
        state = state,
        fixtureFileName = fixtureFileName,
        previewReduceMotion = preferences.reduceMotion,
        workbenchOpen = workbenchOpen,
        focusedToolStepId = focusedToolStepId,
        onWorkbenchOpenChange = { open ->
            workbenchOpen = open
            if (!open) focusedToolStepId = null
            if (viewModel.coreEngineActive) {
                viewModel.syncWorkbenchOpenFromUi(open)
            }
        },
        onOpenWorkbenchFromProcess = { toolId ->
            focusedToolStepId = toolId
            workbenchOpen = true
            if (viewModel.coreEngineActive) {
                val runId = state.workbench.runId ?: state.scenarioId
                viewModel.focusWorkbenchToolCall(runId, toolId)
                viewModel.syncWorkbenchOpenFromUi(true)
            }
        },
        drawerOpen = drawerOpen,
        drawerSessions = drawerSessions,
        drawerRefreshing = drawerRefreshing,
        menuTarget = menuTarget,
        onOpenDrawer = { viewModel.setDrawerOpen(true) },
        onCloseDrawer = { viewModel.setDrawerOpen(false) },
        onRefreshDrawer = { viewModel.refreshDrawerSessions() },
        onNewConversation = {
            if (!viewModel.startNewConversation(state.sessionDrawer.draftTitle)) {
                toast.show("已在新对话中")
            }
        },
        newConversationEnabled = !inDraftMode,
        onSelectSession = { viewModel.selectSession(it) },
        onLongPressSession = { viewModel.openSessionMenu(it) },
        onDismissMenu = { viewModel.dismissSessionMenu() },
        onRenameSession = { id, title -> viewModel.renameSession(id, title) },
        onTogglePin = { id -> viewModel.togglePinSession(id) },
        onDeleteSession = { id -> viewModel.deleteSession(id) },
        onOpenSettings = {
            viewModel.setDrawerOpen(false)
            onOpenSettings()
        },
        composerBlock = preferences.resolveComposerBlock(),
        onOpenLogin = {
            viewModel.setDrawerOpen(false)
            onOpenLogin()
        },
        onLoadDemoFixture = onLoadDemoFixture,
        onOpenReportReader = { title, markdown ->
            workbenchOpen = false
            if (viewModel.coreEngineActive) {
                viewModel.syncWorkbenchOpenFromUi(false)
            }
            onOpenReportReader(title, markdown)
        },
        onOpenArtifactReader = { target ->
            workbenchOpen = false
            if (viewModel.coreEngineActive) {
                viewModel.syncWorkbenchOpenFromUi(false)
            }
            onOpenArtifactReader(target)
        },
        onPreviewAction = viewModel::applyPreviewAction,
        onRefreshWorkbench =
            if (viewModel.coreEngineActive) {
                viewModel::openWorkbenchPanel
            } else {
                viewModel::refreshWorkbench
            },
        onLoadOlderMessages = viewModel::loadOlderMessages,
        onLoadOlderSessionSummaries = viewModel::loadOlderSessionSummaries,
        onRestoreArtifactVersion = { restoreId, expectedId ->
            if (viewModel.coreEngineActive) {
                viewModel.restoreArtifactVersion(restoreId, expectedId)
            } else {
                toast.show("Preview：已确认恢复（未写服务器）")
            }
        },
        onBeginArtifactRevision = { artifactId ->
            workbenchOpen = false
            if (viewModel.coreEngineActive) {
                viewModel.syncWorkbenchOpenFromUi(false)
                viewModel.beginArtifactRevision(artifactId)
            } else {
                toast.show("Preview：已预填修改草稿（未写服务器）")
            }
        },
        onClearComposerRevisionSeed = viewModel::clearComposerRevisionSeed,
        onDownloadDeliverable = { file ->
            if (viewModel.coreEngineActive) {
                scope.launch {
                    viewModel
                        .downloadArtifactTarget(file.toReaderTarget())
                        .onSuccess { payload ->
                            com.harness.agent.util.DeliverableExporter
                                .shareBytes(context, payload.bytes, payload.fileName, payload.contentType)
                                .onFailure { toast.show(it.message ?: "无法分享文件") }
                        }
                        .onFailure { toast.show(it.message ?: "下载失败") }
                }
            }
        },
        useCoreAttachments = viewModel.coreEngineActive,
        onPickImageAttachment = { imagePicker.launch("image/*") },
        onPickDocumentAttachment = { documentPicker.launch(arrayOf("*/*")) },
        modelCatalog = modelCatalog,
        skillPickerNames = skillPickerNames,
        onSkillSheetOpen = viewModel::onComposerSkillSheetOpen,
        coreEngineWorkbench = viewModel.coreEngineActive,
    )
}

/** Gate A 整屏快照：固定初始态（Drawer 关闭；Workbench 可选，无 Replay 进度）。 */
@Composable
fun PreviewChatShellSnapshot(
    state: com.harness.agent.model.ActiveSessionState,
    fixtureFileName: String,
    workbenchOpen: Boolean = false,
    modifier: Modifier = Modifier,
) {
    PreviewChatShellLayout(
        modifier = modifier,
        state = state,
        fixtureFileName = fixtureFileName,
        workbenchOpen = workbenchOpen,
        focusedToolStepId = null,
        onWorkbenchOpenChange = {},
        onOpenWorkbenchFromProcess = {},
        drawerOpen = false,
        drawerSessions = state.sessionDrawer.sessions,
        drawerRefreshing = false,
        menuTarget = null,
        onOpenDrawer = {},
        onCloseDrawer = {},
        onRefreshDrawer = {},
        onNewConversation = {},
        onSelectSession = {},
        onLongPressSession = {},
        onDismissMenu = {},
        onRenameSession = { _, _ -> },
        onTogglePin = {},
        onDeleteSession = {},
        onOpenSettings = {},
        onOpenReportReader = { _, _ -> },
        onOpenArtifactReader = {},
        onRefreshWorkbench = {},
    )
}

@Composable
private fun PreviewChatShellLayout(
    state: com.harness.agent.model.ActiveSessionState,
    fixtureFileName: String,
    modifier: Modifier = Modifier,
    previewReduceMotion: Boolean = false,
    workbenchOpen: Boolean,
    focusedToolStepId: String? = null,
    onWorkbenchOpenChange: (Boolean) -> Unit,
    onOpenWorkbenchFromProcess: (String) -> Unit = {},
    drawerOpen: Boolean,
    drawerSessions: List<com.harness.agent.model.SessionDrawerItem>,
    drawerRefreshing: Boolean,
    menuTarget: com.harness.agent.model.SessionDrawerItem?,
    onOpenDrawer: () -> Unit,
    onCloseDrawer: () -> Unit,
    onRefreshDrawer: () -> Unit,
    onNewConversation: () -> Unit = {},
    newConversationEnabled: Boolean = true,
    onSelectSession: (String) -> Unit,
    onLongPressSession: (com.harness.agent.model.SessionDrawerItem) -> Unit,
    onDismissMenu: () -> Unit,
    onRenameSession: (String, String) -> Unit,
    onTogglePin: (String) -> Unit,
    onDeleteSession: (String) -> Unit,
    onOpenSettings: () -> Unit,
    composerBlock: com.harness.agent.preview.PreviewComposerBlockKind = com.harness.agent.preview.PreviewComposerBlockKind.NONE,
    onOpenLogin: () -> Unit = {},
    onLoadDemoFixture: () -> Unit = {},
    onOpenReportReader: (title: String, markdown: String) -> Unit,
    onOpenArtifactReader: (ReaderTarget) -> Unit,
    onPreviewAction: (PreviewUiAction) -> Unit = {},
    onRefreshWorkbench: () -> Unit = {},
    onLoadOlderMessages: () -> Unit = {},
    onLoadOlderSessionSummaries: () -> Unit = {},
    onRestoreArtifactVersion: (restoreArtifactId: String, expectedCurrentArtifactId: String) -> Unit = { _, _ -> },
    onBeginArtifactRevision: (artifactId: String) -> Unit = {},
    onDownloadDeliverable: (WorkbenchDeliverableFile) -> Unit = {},
    onClearComposerRevisionSeed: () -> Unit = {},
    useCoreAttachments: Boolean = false,
    onPickImageAttachment: () -> Unit = {},
    onPickDocumentAttachment: () -> Unit = {},
    modelCatalog: List<com.harness.agent.model.ComposerModelOption> =
        com.harness.agent.model.PREVIEW_COMPOSER_MODELS,
    skillPickerNames: List<String> = emptyList(),
    onSkillSheetOpen: () -> Unit = {},
    coreEngineWorkbench: Boolean = false,
) {
    val colors = LocalHarnessColors.current
    val dismissKeyboard = rememberDismissKeyboard()
    val isLanding = state.conversation.isEmpty()
    var serviceBannerDismissed by rememberSaveable(state.scenarioId) { mutableStateOf(false) }
    var composerChromeHeightPx by remember { mutableIntStateOf(0) }
    val density = LocalDensity.current
    val conversationListState = rememberConversationListState()
    val conversation = state.conversation
    ConversationScrollOnEnterAndUserSendEffect(
        listState = conversationListState,
        conversation = conversation,
        sessionKey = state.scenarioId,
        hasLoadOlderHeader = state.canLoadOlderMessages,
    )

    LaunchedEffect(drawerOpen, workbenchOpen) {
        if (drawerOpen || workbenchOpen) {
            dismissKeyboard()
        }
    }

    Box(
        modifier =
            modifier
                .fillMaxSize()
                .background(colors.canvas),
    ) {
        // 键盘弹起时 imePadding 已包含底部安全区；再叠加 navigationBarsPadding 会多留一条空白。
        Column(
            Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .imePadding(),
        ) {
            ChatTopBar(
                title = state.title,
                connectionState = state.chrome.connectionState,
                runSummary = state.chrome.runSummary,
                workbenchBadge = state.workbench.workbenchCount,
                onOpenDrawer = {
                    dismissKeyboard()
                    onOpenDrawer()
                },
                onNewConversation = {
                    dismissKeyboard()
                    onNewConversation()
                },
                onOpenWorkbench = {
                    dismissKeyboard()
                    onRefreshWorkbench()
                    onWorkbenchOpenChange(true)
                },
            )
            Box(Modifier.weight(1f).fillMaxWidth()) {
                Column(Modifier.fillMaxSize()) {
                    if (!serviceBannerDismissed && state.chrome.serviceState != "ready") {
                        ServiceBanner(
                            serviceState = state.chrome.serviceState,
                            onRetry = { serviceBannerDismissed = false },
                            onDismiss = { serviceBannerDismissed = true },
                        )
                    }
                    Box(
                        modifier =
                            Modifier
                                .weight(1f)
                                .fillMaxWidth(),
                        contentAlignment = if (isLanding) Alignment.Center else Alignment.TopStart,
                    ) {
                        when {
                            isLanding ->
                                ChatLandingHero(
                                    welcomeText = "欢迎回来，想从哪里开始？",
                                    showDemoEntry =
                                        BuildConfig.USE_PREVIEW_PORT &&
                                            state.scenarioId == "empty-landing",
                                    onOpenDemo = onLoadDemoFixture,
                                )
                            else ->
                                Box(Modifier.fillMaxSize()) {
                                LazyColumn(
                                    state = conversationListState,
                                    modifier =
                                        Modifier
                                            .fillMaxSize()
                                            .padding(start = 12.dp, end = 12.dp, top = 4.dp),
                                    verticalArrangement = Arrangement.spacedBy(HarnessLayout.chatListTurnSpacing),
                                ) {
                                    if (state.canLoadOlderMessages) {
                                        item(key = "load-older") {
                                            LoadOlderMessagesBanner(
                                                loading = state.loadingOlderMessages,
                                                onClick = onLoadOlderMessages,
                                            )
                                        }
                                    }
                                    items(
                                        items = conversation,
                                        key = { item -> item.id },
                                    ) { item ->
                                        ConversationTurnRow(
                                            item = item,
                                            previewReduceMotion = previewReduceMotion,
                                            onOpenWorkbenchStep = onOpenWorkbenchFromProcess,
                                            onOpenArtifact = { artifact -> onOpenArtifactReader(artifact.toReaderTarget()) },
                                        )
                                    }
                                    item(key = "conversation-tail-spacer") {
                                        Spacer(Modifier.height(28.dp))
                                    }
                                }
                                Box(
                                    Modifier
                                        .align(Alignment.TopCenter)
                                        .fillMaxWidth()
                                        .height(18.dp)
                                        .background(
                                            Brush.verticalGradient(listOf(colors.canvas, Color.Transparent)),
                                        ),
                                )
                                Box(
                                    Modifier
                                        .align(Alignment.BottomCenter)
                                        .fillMaxWidth()
                                        .height(18.dp)
                                        .background(
                                            Brush.verticalGradient(listOf(Color.Transparent, colors.canvas)),
                                        ),
                                )
                                }
                        }
                    }
                }
            }
            ComposerStack(
                state = state.composer,
                workbenchOpen = workbenchOpen,
                previewReduceMotion = previewReduceMotion,
                composerBlock = composerBlock,
                onLoginClick = onOpenLogin,
                onPreviewAction = onPreviewAction,
                useCoreAttachments = useCoreAttachments,
                onPickImageAttachment = onPickImageAttachment,
                onPickDocumentAttachment = onPickDocumentAttachment,
                modelCatalog = modelCatalog,
                skillPickerNames = skillPickerNames,
                onSkillSheetOpen = onSkillSheetOpen,
                onClearComposerRevisionSeed = onClearComposerRevisionSeed,
                draftPersistenceKey = state.scenarioId,
                modifier =
                    Modifier.onSizeChanged { size ->
                        composerChromeHeightPx = size.height
                    },
            )
        }

        val composer = state.composer
        val planOverlayEnabled =
            composer.showPlan &&
                !workbenchOpen &&
                composer.mode != "clarification" &&
                composer.mode != "hitl" &&
                (coreEngineWorkbench || PreviewChromeFlags.showPlanOverlay)
        if (planOverlayEnabled) {
            val planBottomInset = with(density) { composerChromeHeightPx.toDp() } + 8.dp
            Box(
                modifier =
                    Modifier
                        .align(Alignment.BottomCenter)
                        .fillMaxWidth()
                        .padding(bottom = planBottomInset),
                contentAlignment = Alignment.BottomCenter,
            ) {
                when {
                    composer.plan != null ->
                        PlanFloatingCard(
                            plan = composer.plan,
                            lockCollapsed = workbenchOpen,
                        )
                    else -> Badge(text = "Plan 执行中")
                }
            }
        }

        WorkbenchSheetOverlay(
            visible = workbenchOpen,
            state = state.workbench,
            previewReduceMotion = previewReduceMotion,
            onDismiss = { onWorkbenchOpenChange(false) },
            onOpenReportReader = {
                val markdown = state.workbench.reportMarkdown.orEmpty()
                onOpenReportReader(state.title, markdown)
            },
            onOpenArtifactReader = { onOpenArtifactReader(it.toReaderTarget()) },
            onRestoreArtifactVersion = onRestoreArtifactVersion,
            onBeginArtifactRevision = onBeginArtifactRevision,
            onDownloadDeliverable = onDownloadDeliverable,
            initialFocusedToolId = focusedToolStepId,
        )

        SessionDrawerOverlay(
            visible = drawerOpen,
            sessions = drawerSessions,
            refreshing = drawerRefreshing,
            menuTarget = menuTarget,
            previewReduceMotion = previewReduceMotion,
            onClose = onCloseDrawer,
            onNewConversation = onNewConversation,
            newConversationEnabled = newConversationEnabled,
            onRefresh = onRefreshDrawer,
            canLoadMore = state.canLoadOlderSessionSummaries || state.loadingOlderSessionSummaries,
            loadingMore = state.loadingOlderSessionSummaries,
            onLoadMore = onLoadOlderSessionSummaries,
            onSelectSession = onSelectSession,
            onLongPressSession = onLongPressSession,
            onDismissMenu = onDismissMenu,
            onRenameSession = onRenameSession,
            onTogglePin = onTogglePin,
            onDeleteSession = onDeleteSession,
            onOpenSettings = onOpenSettings,
        )
    }
}


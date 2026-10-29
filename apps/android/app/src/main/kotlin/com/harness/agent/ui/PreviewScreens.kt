package com.harness.agent.ui

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
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
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
import com.harness.agent.preview.PreviewSessionViewModel
import com.harness.agent.ui.chat.ConversationScrollOnEnterAndUserSendEffect
import com.harness.agent.ui.chat.ProblemDetailsCard
import com.harness.agent.ui.chat.ServiceBanner
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
    onOpenArtifactReader: (title: String, diff: String) -> Unit,
) {
    val state by viewModel.sessionState.collectAsState()
    val drawerOpen by viewModel.drawerOpen.collectAsState()
    val drawerSessions by viewModel.drawerSessions.collectAsState()
    val drawerRefreshing by viewModel.drawerRefreshing.collectAsState()
    val menuTarget by viewModel.sessionMenuTarget.collectAsState()
    var workbenchOpen by rememberSaveable(state.scenarioId) {
        mutableStateOf(state.workbench.initialSheetIndex >= 0 && state.workbench.workbenchCount > 0 || state.workbench.sources.isNotEmpty())
    }
    var focusedToolStepId by rememberSaveable(state.scenarioId) { mutableStateOf<String?>(null) }

    PreviewChatShellLayout(
        state = state,
        fixtureFileName = fixtureFileName,
        previewReduceMotion = preferences.reduceMotion,
        workbenchOpen = workbenchOpen,
        focusedToolStepId = focusedToolStepId,
        onWorkbenchOpenChange = { open ->
            workbenchOpen = open
            if (!open) focusedToolStepId = null
        },
        onOpenWorkbenchFromProcess = { toolId ->
            focusedToolStepId = toolId
            workbenchOpen = true
        },
        drawerOpen = drawerOpen,
        drawerSessions = drawerSessions,
        drawerRefreshing = drawerRefreshing,
        menuTarget = menuTarget,
        onOpenDrawer = { viewModel.setDrawerOpen(true) },
        onCloseDrawer = { viewModel.setDrawerOpen(false) },
        onRefreshDrawer = { viewModel.refreshDrawerSessions() },
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
        onOpenReportReader = onOpenReportReader,
        onOpenArtifactReader = onOpenArtifactReader,
        onPreviewAction = viewModel::applyPreviewAction,
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
        onSelectSession = {},
        onLongPressSession = {},
        onDismissMenu = {},
        onRenameSession = { _, _ -> },
        onTogglePin = {},
        onDeleteSession = {},
        onOpenSettings = {},
        onOpenReportReader = { _, _ -> },
        onOpenArtifactReader = { _, _ -> },
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
    onOpenArtifactReader: (title: String, diff: String) -> Unit,
    onPreviewAction: (PreviewUiAction) -> Unit = {},
) {
    val colors = LocalHarnessColors.current
    val dismissKeyboard = rememberDismissKeyboard()
    val isLanding = state.conversation.isEmpty()
    var serviceBannerDismissed by rememberSaveable(state.scenarioId) { mutableStateOf(false) }
    var composerChromeHeightPx by remember { mutableIntStateOf(0) }
    val density = LocalDensity.current
    val conversationListState = rememberLazyListState()
    val conversation = state.conversation
    ConversationScrollOnEnterAndUserSendEffect(
        listState = conversationListState,
        conversation = conversation,
        sessionKey = state.scenarioId,
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
        Column(
            Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding()
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
                onOpenWorkbench = {
                    dismissKeyboard()
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
                    if (
                        state.chrome.serviceState == "ready" &&
                        (state.problemTitle != null || state.problemDetail != null)
                    ) {
                        ProblemDetailsCard(title = state.problemTitle, detail = state.problemDetail)
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
                                    showDemoEntry = state.scenarioId == "empty-landing",
                                    onOpenDemo = onLoadDemoFixture,
                                )
                            else ->
                                LazyColumn(
                                    state = conversationListState,
                                    modifier =
                                        Modifier
                                            .fillMaxSize()
                                            .padding(start = 12.dp, end = 12.dp, top = 4.dp),
                                    verticalArrangement = Arrangement.spacedBy(HarnessLayout.chatListTurnSpacing),
                                ) {
                                    itemsIndexed(
                                        items = conversation,
                                        key = { index, item ->
                                            when (item) {
                                                is com.harness.agent.model.ConversationItem.User ->
                                                    "u-$index-${item.content.hashCode()}"
                                                is com.harness.agent.model.ConversationItem.Assistant ->
                                                    "a-$index-${item.deliveryStatus}"
                                            }
                                        },
                                    ) { _, item ->
                                        ConversationTurnRow(
                                            item = item,
                                            previewReduceMotion = previewReduceMotion,
                                            onOpenWorkbenchStep = onOpenWorkbenchFromProcess,
                                        )
                                    }
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
                modifier =
                    Modifier.onSizeChanged { size ->
                        composerChromeHeightPx = size.height
                    },
            )
        }

        val composer = state.composer
        if (
            PreviewChromeFlags.showPlanOverlay &&
                !workbenchOpen &&
                composer.showPlan &&
                composer.mode != "clarification" &&
                composer.mode != "hitl"
        ) {
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
                val markdown = state.workbench.reportMarkdown ?: "# Preview Report\n\n（fixture 无 reportMarkdown）"
                onOpenReportReader(state.title, markdown)
            },
            onOpenArtifactReader = {
                val diff = state.workbench.artifactDiffPreview ?: "--- artifact diff preview"
                onOpenArtifactReader("Artifact", diff)
            },
            onOpenFilePreview = { fileName, markdown ->
                onOpenReportReader(fileName, markdown)
            },
            initialFocusedToolId = focusedToolStepId,
        )

        SessionDrawerOverlay(
            visible = drawerOpen,
            draftTitle = state.sessionDrawer.draftTitle,
            searchPlaceholder = state.sessionDrawer.searchPlaceholder,
            sessions = drawerSessions,
            refreshing = drawerRefreshing,
            menuTarget = menuTarget,
            previewReduceMotion = previewReduceMotion,
            onClose = onCloseDrawer,
            onRefresh = onRefreshDrawer,
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


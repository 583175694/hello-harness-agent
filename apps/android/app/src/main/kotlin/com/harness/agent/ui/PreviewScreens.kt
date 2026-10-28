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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
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
import com.harness.agent.coreui.primitives.AppTopBar
import com.harness.agent.coreui.primitives.ListRow
import com.harness.agent.coreui.tokens.LocalHarnessColors
import com.harness.agent.preview.PreviewAppPreferences
import com.harness.agent.preview.PreviewSessionViewModel
import com.harness.agent.ui.chat.ProblemDetailsCard
import com.harness.agent.ui.chat.ServiceBanner
import com.harness.agent.ui.chat.ChatLandingHero
import com.harness.agent.ui.chat.ChatTopBar
import com.harness.agent.ui.chat.ComposerPeekBar
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
    AppScaffold(
        topBar = {
            Row(
                modifier = Modifier.fillMaxWidth().height(48.dp).padding(horizontal = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (onBack != null) {
                    AppText(
                        text = "←",
                        style = AppTextStyle.Title,
                        modifier =
                            Modifier
                                .clickable(onClick = onBack)
                                .padding(horizontal = 12.dp, vertical = 8.dp),
                    )
                }
                AppText(text = "演示场景", style = AppTextStyle.Title, modifier = Modifier.weight(1f))
            }
        },
    ) {
        AppText(
            text = "Gate A 十场景（mobile-contract/fixtures/preview）",
            style = AppTextStyle.Caption,
        )
        Spacer(modifier = Modifier.height(8.dp))
        ListRow(
            title = "设置",
            subtitle = "主题 · 字号 · Reduce Motion · MCP / Memory",
            onClick = onOpenSettings,
            modifier = Modifier.testTag("dev-menu-settings"),
        )
        Spacer(modifier = Modifier.height(8.dp))
        LazyColumn(modifier = Modifier.fillMaxSize()) {
            items(fixtures) { item ->
                ListRow(
                    title = item.title,
                    subtitle = item.fileName,
                    onClick = { onOpenScenario(item.fileName) },
                    modifier = Modifier.testTag("dev-menu-fixture-${item.fileName}"),
                )
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
                    if (state.problemTitle != null || state.problemDetail != null) {
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
                                    modifier =
                                        Modifier
                                            .fillMaxSize()
                                            .padding(start = 12.dp, end = 12.dp, top = 4.dp, bottom = 8.dp),
                                    reverseLayout = true,
                                    verticalArrangement = Arrangement.spacedBy(4.dp),
                                ) {
                                    item {
                                        AppText(
                                            text = "共 ${state.conversation.size} 条对话 · 向下滚动验证长列表",
                                            style = AppTextStyle.Caption,
                                            modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
                                        )
                                    }
                                    itemsIndexed(
                                        items = state.conversation.asReversed(),
                                        key = { index, item ->
                                            val position = state.conversation.lastIndex - index
                                            when (item) {
                                                is com.harness.agent.model.ConversationItem.User ->
                                                    "u-$position-${item.content.hashCode()}"
                                                is com.harness.agent.model.ConversationItem.Assistant ->
                                                    "a-$position-${item.deliveryStatus}"
                                            }
                                        },
                                    ) { _, item ->
                                        ConversationTurnRow(
                                            item = item,
                                            onOpenWorkbenchStep = onOpenWorkbenchFromProcess,
                                        )
                                    }
                                }
                        }
                    }
                }
            }
            if (
                state.composer.submitting &&
                    !state.composer.showPlan &&
                    !state.chrome.peekBarTitle.isNullOrBlank()
            ) {
                ComposerPeekBar(
                    title = state.chrome.peekBarTitle!!,
                    subtitle = state.chrome.peekBarSubtitle,
                    onPress = {
                        dismissKeyboard()
                        onWorkbenchOpenChange(true)
                    },
                )
            }
            ComposerStack(
                state = state.composer,
                workbenchOpen = workbenchOpen,
                previewReduceMotion = previewReduceMotion,
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


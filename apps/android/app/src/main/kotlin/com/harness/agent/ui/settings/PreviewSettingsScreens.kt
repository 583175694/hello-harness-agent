package com.harness.agent.ui.settings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import com.harness.agent.coreui.motion.harnessPressOpacity
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.HorizontalDivider
import androidx.compose.ui.graphics.Color
import androidx.compose.runtime.Composable
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import com.harness.agent.coreui.feedback.AppConfirmDialog
import com.harness.agent.coreui.feedback.AppConfirmRequest
import com.harness.agent.coreui.feedback.LocalAppToast
import com.harness.agent.coreui.primitives.AppScaffold
import com.harness.agent.coreui.primitives.harnessSwitchColors
import com.harness.agent.coreui.primitives.AppText
import com.harness.agent.coreui.primitives.SettingsTextField
import com.harness.agent.coreui.primitives.AppTextStyle
import com.harness.agent.coreui.primitives.AppTopBar
import com.harness.agent.coreui.tokens.HarnessLayout
import com.harness.agent.coreui.tokens.LocalHarnessColors
import com.harness.agent.BuildConfig
import com.harness.agent.preview.PreviewAppPreferences
import com.harness.agent.settings.MemoryEntryUiModel
import com.harness.agent.settings.MemoryHubState
import com.harness.agent.settings.MemorySettingsBackend
import com.harness.agent.settings.McpServerUiModel
import com.harness.agent.settings.McpSettingsBackend
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberCoroutineScope
import androidx.lifecycle.compose.LifecycleResumeEffect
import kotlinx.coroutines.launch
import com.harness.mobile.core.api.ApiProblem
import com.harness.agent.preview.PreviewThemeMode

@Composable
fun PreviewSettingsRootScreen(
    preferences: PreviewAppPreferences,
    onBack: () -> Unit,
    onOpenLogin: () -> Unit = {},
    onOpenMemory: () -> Unit,
    onOpenMcp: () -> Unit,
    onOpenPreviewScenarios: () -> Unit = {},
    onSignOut: () -> Unit = {
        preferences.updateAuthProfile(null)
    },
) {
    val toast = LocalAppToast.current

    AppScaffold(
        topBar = {
            SettingsTopBar(title = "设置", onBack = onBack)
        },
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            Column(
                modifier =
                    Modifier
                        .weight(1f)
                        .verticalScroll(rememberScrollState())
                        .padding(top = 8.dp),
                verticalArrangement = Arrangement.spacedBy(HarnessLayout.settingsGroupGap),
            ) {
            SettingsGroup(sectionLabel = "通用") {
                SettingsNavRow(
                    title = "外观",
                    trailingValue = themeModeLabel(preferences.themeMode),
                    onClick = { preferences.updateThemeMode(nextThemeMode(preferences.themeMode)) },
                    showDivider = true,
                )
                SettingsFontSizeRow(
                    value = preferences.contentFontSize,
                    onDecrement = { preferences.updateContentFontSize(preferences.contentFontSize - 1) },
                    onIncrement = { preferences.updateContentFontSize(preferences.contentFontSize + 1) },
                    showDivider = true,
                )
                if (preferences.isLoggedIn) {
                    SettingsNavRow(
                        title = preferences.authProfile?.displayName ?: "账号",
                        trailingValue = preferences.authProfile?.phone,
                        showChevron = false,
                        interactive = false,
                        onClick = {},
                        showDivider = false,
                    )
                } else {
                    SettingsNavRow(
                        title = "登录",
                        onClick = onOpenLogin,
                        showDivider = false,
                    )
                }
            }

            SettingsGroup(sectionLabel = "Agent") {
                SettingsNavRow(title = "记忆", onClick = onOpenMemory, showDivider = true)
                SettingsNavRow(title = "MCP 服务器", onClick = onOpenMcp, showDivider = true)
                if (BuildConfig.USE_PREVIEW_PORT) {
                    SettingsNavRow(
                        title = "演示场景",
                        onClick = onOpenPreviewScenarios,
                        showDivider = true,
                    )
                }
            }

            }
            SettingsBottomDock {
                if (preferences.isLoggedIn) {
                    SettingsPillButton(
                        text = "退出登录",
                        style = SettingsPillStyle.Subtle,
                        onClick = {
                            onSignOut()
                            toast.show("已退出登录")
                        },
                    )
                }
            }
        }
    }
}

@Composable
fun PreviewMcpListScreen(
    backend: McpSettingsBackend,
    onBack: () -> Unit,
    onEditServer: (String) -> Unit,
    onOpenLogin: () -> Unit = {},
) {
    var servers by remember { mutableStateOf<List<McpServerUiModel>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var unauthorized by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    suspend fun reload() {
        loading = true
        errorMessage = null
        unauthorized = false
        runCatching { backend.listServers() }
            .onSuccess { servers = it }
            .onFailure { error ->
                unauthorized = error.isUnauthorized()
                errorMessage = error.toSettingsMessage("MCP 服务列表加载失败")
            }
        loading = false
    }

    LaunchedEffect(backend) { reload() }
    LifecycleResumeEffect(backend) {
        scope.launch { reload() }
        onPauseOrDispose { }
    }
    AppScaffold(topBar = { SettingsTopBar(title = "MCP 服务器", onBack = onBack) }) {
        Column(modifier = Modifier.fillMaxSize()) {
            SettingsLoadGate(
                loading = loading,
                errorMessage = errorMessage,
                unauthorized = unauthorized,
                onRetry = { scope.launch { reload() } },
                onOpenLogin = onOpenLogin,
                modifier = Modifier.weight(1f),
            ) {
                Column(
                    modifier =
                        Modifier
                            .fillMaxSize()
                            .verticalScroll(rememberScrollState())
                            .padding(top = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(HarnessLayout.settingsGroupGap),
                ) {
                    SettingsGroup(sectionLabel = "已配置") {
                        if (servers.isEmpty()) {
                            AppText(
                                text = "暂无服务器",
                                style = AppTextStyle.Muted,
                                modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp),
                            )
                        } else {
                            servers.forEachIndexed { index, server ->
                                McpServerRow(
                                    server = server,
                                    onClick = { onEditServer(server.id) },
                                    showDivider = index < servers.lastIndex,
                                )
                            }
                        }
                    }
                }
            }
            SettingsBottomDock {
                SettingsPillButton(text = "添加服务器", onClick = { onEditServer("new") })
            }
        }
    }
}

@Composable
fun PreviewMcpFormScreen(
    backend: McpSettingsBackend,
    serverId: String,
    onBack: () -> Unit,
) {
    var existing by remember(serverId) { mutableStateOf<McpServerUiModel?>(null) }
    var name by remember(serverId) { mutableStateOf("") }
    var url by remember(serverId) { mutableStateOf("") }
    var enabled by remember(serverId) { mutableStateOf(true) }
    var testConfirm by remember { mutableStateOf<AppConfirmRequest?>(null) }
    val toast = LocalAppToast.current
    val scope = rememberCoroutineScope()
    LaunchedEffect(backend, serverId) {
        if (serverId == "new") {
            existing = null
            name = ""
            url = ""
            enabled = true
        } else {
            val row = runCatching { backend.listServers().find { it.id == serverId } }.getOrNull()
            existing = row
            name = row?.serverName ?: ""
            url = row?.url ?: ""
            enabled = row?.enabled ?: true
            if (row == null) {
                toast.show("无法加载 MCP 服务器，请稍后重试")
            }
        }
    }

    AppScaffold(topBar = { SettingsTopBar(title = if (existing == null) "新建 MCP" else "编辑 MCP", onBack = onBack) }) {
        Column(modifier = Modifier.fillMaxSize()) {
            Column(
                modifier =
                    Modifier
                        .weight(1f)
                        .verticalScroll(rememberScrollState())
                        .padding(top = 8.dp),
                verticalArrangement = Arrangement.spacedBy(HarnessLayout.settingsGroupGap),
            ) {
                SettingsGroup(sectionLabel = "连接") {
                    Column(
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        SettingsTextField(value = name, onValueChange = { name = it }, label = "名称", placeholder = "服务器名称")
                        SettingsTextField(
                            value = url,
                            onValueChange = { url = it },
                            label = "URL / 命令",
                            placeholder = "stdio://…",
                        )
                        SettingsToggleRow(
                            title = "启用",
                            checked = enabled,
                            onCheckedChange = { enabled = it },
                            showDivider = false,
                        )
                    }
                }
            }
            SettingsBottomDock {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    SettingsPillButton(
                        text = "Test",
                        style = SettingsPillStyle.Subtle,
                        modifier = Modifier.weight(1f),
                        onClick = {
                            val id = existing?.id
                            if (id == null) {
                                toast.show("请先保存服务器")
                                return@SettingsPillButton
                            }
                            scope.launch {
                                backend.testServer(id).fold(
                                    onSuccess = { result ->
                                        testConfirm =
                                            AppConfirmRequest(
                                                title = "MCP Test",
                                                message = result.message,
                                                confirmLabel = "确定",
                                                dismissLabel = "",
                                                onConfirm = {},
                                            )
                                    },
                                    onFailure = { toast.show(it.message ?: "测试失败") },
                                )
                            }
                        },
                    )
                    if (existing != null) {
                        SettingsPillButton(
                            text = "删除",
                            style = SettingsPillStyle.Subtle,
                            modifier = Modifier.weight(1f),
                            onClick = {
                                scope.launch {
                                    backend.deleteServer(existing!!.id).fold(
                                        onSuccess = { onBack() },
                                        onFailure = { toast.show(it.message ?: "删除失败") },
                                    )
                                }
                            },
                        )
                    }
                }
                SettingsPillButton(
                    text = "保存",
                    enabled = name.isNotBlank() && url.isNotBlank(),
                    onClick = {
                        scope.launch {
                            backend.saveServer(
                                id = existing?.id,
                                serverName = name,
                                url = url,
                                enabled = enabled,
                            ).fold(
                                onSuccess = { onBack() },
                                onFailure = { toast.show(it.message ?: "保存失败") },
                            )
                        }
                    },
                )
            }
        }
    }

    AppConfirmDialog(request = testConfirm, onDismiss = { testConfirm = null })
}

@Composable
fun PreviewMemoryHubScreen(
    backend: MemorySettingsBackend,
    onBack: () -> Unit,
    onOpenEntry: (String) -> Unit,
    onOpenLogin: () -> Unit = {},
) {
    var state by remember { mutableStateOf(MemoryHubState(allowAgentWrite = true, entries = emptyList())) }
    var loading by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var unauthorized by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val toast = LocalAppToast.current

    suspend fun reload() {
        loading = true
        errorMessage = null
        unauthorized = false
        runCatching { backend.load() }
            .onSuccess { state = it }
            .onFailure { error ->
                unauthorized = error.isUnauthorized()
                errorMessage = error.toSettingsMessage("记忆加载失败")
            }
        loading = false
    }

    LaunchedEffect(backend) { reload() }
    AppScaffold(topBar = { SettingsTopBar(title = "记忆", onBack = onBack) }) {
        SettingsLoadGate(
            loading = loading,
            errorMessage = errorMessage,
            unauthorized = unauthorized,
            onRetry = { scope.launch { reload() } },
            onOpenLogin = onOpenLogin,
            modifier = Modifier.fillMaxSize(),
        ) {
            Column(
                modifier =
                    Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .padding(top = 8.dp),
                verticalArrangement = Arrangement.spacedBy(HarnessLayout.settingsGroupGap),
            ) {
                SettingsGroup(sectionLabel = "写入") {
                    SettingsToggleRow(
                        title = "允许 Agent 写入记忆",
                        checked = state.allowAgentWrite,
                        onCheckedChange = { enabled ->
                            scope.launch {
                                backend.setAllowAgentWrite(enabled).fold(
                                    onSuccess = { state = state.copy(allowAgentWrite = enabled) },
                                    onFailure = { toast.show(it.message ?: "更新失败") },
                                )
                            }
                        },
                        showDivider = false,
                    )
                }
                SettingsGroup(sectionLabel = "条目") {
                    if (state.entries.isEmpty()) {
                        AppText(
                            text = "暂无记忆",
                            style = AppTextStyle.Muted,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp),
                        )
                    } else {
                        state.entries.forEachIndexed { index, entry ->
                            SettingsMemoryEntryRow(
                                preview = memoryEntryPreviewLine(entry),
                                onClick = { onOpenEntry(entry.id) },
                                showDivider = index < state.entries.lastIndex,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun PreviewMemoryEntryScreen(
    backend: MemorySettingsBackend,
    entryId: String,
    onBack: () -> Unit,
) {
    var loaded by remember(entryId) { mutableStateOf<MemoryEntryUiModel?>(null) }
    var title by remember(entryId) { mutableStateOf("") }
    var content by remember(entryId) { mutableStateOf("") }
    var kind by remember(entryId) { mutableStateOf("preference") }
    var saving by remember { mutableStateOf(false) }
    var deleteConfirm by remember { mutableStateOf<AppConfirmRequest?>(null) }
    val toast = LocalAppToast.current
    val scope = rememberCoroutineScope()

    LaunchedEffect(backend, entryId) {
        val row = runCatching { backend.entry(entryId) }.getOrNull()
        loaded = row
        title = row?.title.orEmpty()
        content = row?.text.orEmpty()
        kind = row?.kind ?: "preference"
        if (row == null) {
            toast.show("无法加载记忆详情，请返回重试")
        }
    }

    fun resolvedTitle(): String =
        title.trim().ifBlank {
            content.lineSequence().firstOrNull()?.trim()?.take(80).orEmpty().ifBlank { "记忆" }
        }

    AppScaffold(topBar = { SettingsTopBar(title = "记忆详情", onBack = onBack) }) {
        Column(modifier = Modifier.fillMaxSize()) {
            Column(
                modifier =
                    Modifier
                        .weight(1f)
                        .verticalScroll(rememberScrollState())
                        .padding(top = 8.dp),
                verticalArrangement = Arrangement.spacedBy(HarnessLayout.settingsGroupGap),
            ) {
                SettingsGroup(sectionLabel = "内容") {
                    Column(
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        SettingsTextField(
                            value = title,
                            onValueChange = { title = it },
                            label = "标题",
                            placeholder = "可选，留空则用正文首句",
                        )
                        MemoryMultilineField(
                            value = content,
                            onValueChange = { content = it },
                            label = "正文",
                            placeholder = "记忆内容",
                        )
                    }
                }
                Row(
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.End,
                ) {
                    Text(
                        text = "删除",
                        color = LocalHarnessColors.current.link,
                        fontSize = 15.sp,
                        modifier =
                            Modifier
                                .clickable {
                                    deleteConfirm =
                                        AppConfirmRequest(
                                            title = "删除记忆",
                                            message = "删除后无法恢复，确定继续？",
                                            confirmLabel = "删除",
                                            destructive = true,
                                            onConfirm = {
                                                scope.launch {
                                                    backend.deleteEntry(entryId).fold(
                                                        onSuccess = { onBack() },
                                                        onFailure = { toast.show(it.message ?: "删除失败") },
                                                    )
                                                }
                                            },
                                        )
                                }
                                .padding(vertical = 8.dp),
                    )
                }
            }
            SettingsBottomDock {
                SettingsPillButton(
                    text = if (saving) "保存中…" else "保存",
                    enabled = !saving && content.isNotBlank() && loaded != null,
                    onClick = {
                        scope.launch {
                            saving = true
                            backend
                                .updateEntry(
                                    id = entryId,
                                    kind = kind,
                                    title = resolvedTitle(),
                                    content = content.trim(),
                                ).fold(
                                    onSuccess = {
                                        toast.show("已保存")
                                        onBack()
                                    },
                                    onFailure = { toast.show(it.message ?: "保存失败") },
                                )
                            saving = false
                        }
                    },
                )
            }
        }
    }

    AppConfirmDialog(request = deleteConfirm, onDismiss = { deleteConfirm = null })
}

private fun Throwable.isUnauthorized(): Boolean =
    (this as? ApiProblem)?.problem?.status == 401 || cause?.let { (it as? ApiProblem)?.problem?.status == 401 } == true

private fun Throwable.toSettingsMessage(fallback: String): String =
    (this as? ApiProblem)?.problem?.let { problem ->
        if (problem.status == 401) "请先登录后再使用此功能。" else problem.detail.ifBlank { problem.title }.ifBlank { fallback }
    } ?: message?.takeIf { it.isNotBlank() } ?: fallback

@Composable
private fun SettingsLoadGate(
    loading: Boolean,
    errorMessage: String?,
    unauthorized: Boolean,
    onRetry: () -> Unit,
    onOpenLogin: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    when {
        loading ->
            Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                com.harness.agent.coreui.primitives.Spinner()
            }
        errorMessage != null ->
            Column(
                modifier = modifier.fillMaxSize().padding(horizontal = 24.dp),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                AppText(text = errorMessage, style = AppTextStyle.Body, modifier = Modifier.fillMaxWidth())
                Spacer(modifier = Modifier.height(16.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    SettingsPillButton(
                        text = "重试",
                        style = SettingsPillStyle.Subtle,
                        modifier = Modifier.weight(1f),
                        onClick = onRetry,
                    )
                    if (unauthorized) {
                        SettingsPillButton(
                            text = "去登录",
                            modifier = Modifier.weight(1f),
                            onClick = onOpenLogin,
                        )
                    }
                }
            }
        else -> content()
    }
}

@Composable
private fun MemoryMultilineField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    placeholder: String,
) {
    val colors = LocalHarnessColors.current
    val shape = RoundedCornerShape(HarnessLayout.controlRadius)
    Column(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = label,
            fontSize = 12.sp,
            color = colors.muted,
            modifier = Modifier.padding(bottom = 6.dp),
        )
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            textStyle = TextStyle(fontSize = 16.sp, color = colors.secondary, lineHeight = 22.sp),
            modifier =
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = 160.dp)
                    .background(colors.subtle, shape)
                    .border(1.dp, colors.composerBorder, shape)
                    .padding(horizontal = 12.dp, vertical = 11.dp),
            decorationBox = { inner ->
                Box {
                    if (value.isEmpty() && placeholder.isNotEmpty()) {
                        Text(text = placeholder, fontSize = 16.sp, color = colors.composerPlaceholder)
                    }
                    inner()
                }
            },
        )
    }
}

private fun memoryEntryPreviewLine(entry: MemoryEntryUiModel): String =
    entry.text.replace('\n', ' ').trim().ifBlank { entry.title.trim() }

@Composable
internal fun SettingsTopBar(
    title: String,
    onBack: () -> Unit,
) {
    val colors = LocalHarnessColors.current
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .height(48.dp)
                .background(colors.canvas)
                .padding(horizontal = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AppText(
            text = "‹",
            style = AppTextStyle.Title,
            modifier =
                Modifier
                    .clickable(onClick = onBack)
                    .padding(horizontal = 12.dp, vertical = 8.dp),
        )
        Text(
            text = title,
            color = colors.secondary,
            fontSize = 17.sp,
            modifier = Modifier.weight(1f),
        )
        Spacer(modifier = Modifier.size(40.dp))
    }
}

@Composable
internal fun SettingsGroup(
    sectionLabel: String? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    val colors = LocalHarnessColors.current
    Column(modifier = Modifier.fillMaxWidth()) {
        if (!sectionLabel.isNullOrBlank()) {
            Text(
                text = sectionLabel,
                color = colors.muted,
                fontSize = 12.sp,
                modifier = Modifier.padding(start = 4.dp, bottom = 6.dp),
            )
        }
        Surface(
            color = colors.surface,
            shape = RoundedCornerShape(HarnessLayout.settingsCardRadius),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(content = content)
        }
    }
}

@Composable
internal fun SettingsSoftDivider() {
    val colors = LocalHarnessColors.current
    HorizontalDivider(
        modifier = Modifier.padding(start = 16.dp),
        thickness = 0.5.dp,
        color = colors.settingsDivider,
    )
}

@Composable
internal fun SettingsRowSlot(
    showDivider: Boolean,
    content: @Composable () -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Box(
            modifier = Modifier.fillMaxWidth(),
            contentAlignment = Alignment.CenterStart,
        ) {
            content()
        }
        if (showDivider) {
            SettingsSoftDivider()
        }
    }
}

@Composable
internal fun SettingsNavRow(
    title: String,
    trailingValue: String? = null,
    onClick: () -> Unit = {},
    showChevron: Boolean = true,
    showDivider: Boolean = false,
    interactive: Boolean = true,
    modifier: Modifier = Modifier,
) {
    val colors = LocalHarnessColors.current
    val interactionSource = remember { MutableInteractionSource() }
    SettingsRowSlot(showDivider = showDivider) {
        Row(
            modifier =
                modifier
                    .fillMaxWidth()
                    .heightIn(min = HarnessLayout.settingsRowMinHeight)
                    .then(
                        if (interactive) {
                            Modifier
                                .harnessPressOpacity(interactionSource = interactionSource)
                                .clickable(
                                    onClick = onClick,
                                    interactionSource = interactionSource,
                                    indication = null,
                                )
                        } else {
                            Modifier
                        },
                    )
                    .padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = title,
                color = colors.secondary,
                fontSize = 16.sp,
                modifier = Modifier.weight(1f),
            )
            if (!trailingValue.isNullOrBlank()) {
                Text(
                    text = trailingValue,
                    color = colors.muted,
                    fontSize = 14.sp,
                    modifier = Modifier.padding(end = 2.dp),
                )
            }
            if (showChevron) {
                Icon(
                    imageVector = Icons.AutoMirrored.Rounded.KeyboardArrowRight,
                    contentDescription = null,
                    tint = colors.composerPlaceholder,
                    modifier = Modifier.size(18.dp),
                )
            }
        }
    }
}

@Composable
private fun SettingsFontSizeRow(
    value: Int,
    onDecrement: () -> Unit,
    onIncrement: () -> Unit,
    showDivider: Boolean = false,
) {
    val colors = LocalHarnessColors.current
    SettingsRowSlot(showDivider = showDivider) {
        Row(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = HarnessLayout.settingsRowMinHeight)
                    .padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(text = "正文字号", color = colors.secondary, fontSize = 16.sp, modifier = Modifier.weight(1f))
            Row(
                modifier =
                    Modifier
                        .background(colors.subtle, RoundedCornerShape(8.dp))
                        .padding(horizontal = 2.dp, vertical = 1.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "−",
                    color = colors.secondary,
                    fontSize = 15.sp,
                    modifier =
                        Modifier
                            .clickable(onClick = onDecrement)
                            .padding(horizontal = 10.dp, vertical = 3.dp),
                )
                Text(
                    text = "$value",
                color = colors.muted,
                fontSize = 14.sp,
                modifier = Modifier.padding(horizontal = 6.dp),
            )
            Text(
                text = "+",
                color = colors.secondary,
                fontSize = 15.sp,
                modifier =
                    Modifier
                        .clickable(onClick = onIncrement)
                        .padding(horizontal = 10.dp, vertical = 3.dp),
            )
        }
    }
}
}

@Composable
private fun SettingsToggleRow(
    title: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    subtitle: String? = null,
    showDivider: Boolean = false,
) {
    val colors = LocalHarnessColors.current
    SettingsRowSlot(showDivider = showDivider) {
        Row(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = HarnessLayout.settingsRowMinHeight)
                    .padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(text = title, color = colors.secondary, fontSize = 16.sp)
                if (!subtitle.isNullOrBlank()) {
                    Text(text = subtitle, color = colors.muted, fontSize = 12.sp)
                }
            }
            Switch(
                checked = checked,
                onCheckedChange = onCheckedChange,
                colors = harnessSwitchColors(),
            )
        }
    }
}

private fun apiConnectionSummary(raw: String): String {
    val trimmed = raw.trim()
    if (trimmed.isEmpty()) return "未配置"
    return if (trimmed.length > 18) trimmed.take(18) + "…" else trimmed
}

private fun themeModeLabel(mode: PreviewThemeMode): String =
    when (mode) {
        PreviewThemeMode.SYSTEM -> "跟随系统"
        PreviewThemeMode.LIGHT -> "浅色"
        PreviewThemeMode.DARK -> "深色"
    }

private fun nextThemeMode(mode: PreviewThemeMode): PreviewThemeMode =
    when (mode) {
        PreviewThemeMode.SYSTEM -> PreviewThemeMode.LIGHT
        PreviewThemeMode.LIGHT -> PreviewThemeMode.DARK
        PreviewThemeMode.DARK -> PreviewThemeMode.SYSTEM
    }

@Composable
private fun McpServerRow(
    server: McpServerUiModel,
    onClick: () -> Unit,
    showDivider: Boolean = false,
) {
    SettingsRowSlot(showDivider = showDivider) {
        Row(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = HarnessLayout.settingsRowMinHeight)
                    .clickable(onClick = onClick)
                    .padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = server.serverName,
                color = LocalHarnessColors.current.secondary,
                fontSize = 16.sp,
                modifier = Modifier.weight(1f),
            )
            val colors = LocalHarnessColors.current
            Text(
                text =
                    server.statusLabel?.takeIf { it.isNotBlank() }
                        ?: if (server.enabled) "已启用" else "未启用",
                color = colors.muted,
                fontSize = 14.sp,
                modifier = Modifier.padding(end = 2.dp),
            )
            Icon(
                imageVector = Icons.AutoMirrored.Rounded.KeyboardArrowRight,
                contentDescription = null,
                tint = colors.composerPlaceholder,
                modifier = Modifier.size(18.dp),
            )
        }
    }
}

@Composable
private fun SettingsMemoryEntryRow(
    preview: String,
    onClick: () -> Unit,
    showDivider: Boolean,
) {
    val colors = LocalHarnessColors.current
    SettingsRowSlot(showDivider = showDivider) {
        Row(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = HarnessLayout.settingsRowMinHeight)
                    .clickable(onClick = onClick)
                    .padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = preview,
                color = colors.secondary,
                fontSize = 15.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Icon(
                imageVector = Icons.AutoMirrored.Rounded.KeyboardArrowRight,
                contentDescription = null,
                tint = colors.composerPlaceholder,
                modifier = Modifier.size(18.dp),
            )
        }
    }
}

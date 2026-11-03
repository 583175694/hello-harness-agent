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
import androidx.compose.runtime.remember
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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
import com.harness.agent.preview.PreviewAppPreferences
import com.harness.agent.preview.PreviewComposerBlockKind
import com.harness.agent.settings.MemoryHubState
import com.harness.agent.settings.MemorySettingsBackend
import com.harness.agent.settings.McpServerUiModel
import com.harness.agent.settings.McpSettingsBackend
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberCoroutineScope
import androidx.lifecycle.compose.LifecycleResumeEffect
import kotlinx.coroutines.launch
import com.harness.agent.preview.PreviewThemeMode

@Composable
fun PreviewSettingsRootScreen(
    preferences: PreviewAppPreferences,
    onBack: () -> Unit,
    onOpenLogin: () -> Unit = {},
    onOpenMemory: () -> Unit,
    onOpenMcp: () -> Unit,
    onOpenConnection: () -> Unit,
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
                SettingsToggleRow(
                    title = "Reduce Motion",
                    checked = preferences.reduceMotion,
                    onCheckedChange = preferences::updateReduceMotion,
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

            SettingsGroup(sectionLabel = "开发") {
                SettingsToggleRow(
                    title = "Composer 阻断",
                    checked = preferences.composerBlockDemo == PreviewComposerBlockKind.TRANSCRIPT_INCOMPATIBLE,
                    onCheckedChange = { on ->
                        preferences.updateComposerBlockDemo(
                            if (on) PreviewComposerBlockKind.TRANSCRIPT_INCOMPATIBLE else PreviewComposerBlockKind.NONE,
                        )
                    },
                    showDivider = false,
                )
            }

            SettingsGroup(sectionLabel = "Agent") {
                SettingsNavRow(title = "记忆", onClick = onOpenMemory, showDivider = true)
                SettingsNavRow(title = "MCP 服务器", onClick = onOpenMcp, showDivider = true)
                SettingsNavRow(
                    title = "演示场景",
                    onClick = onOpenPreviewScenarios,
                    showDivider = true,
                )
            }

            SettingsGroup(sectionLabel = "连接") {
                SettingsNavRow(
                    title = "API Base URL",
                    trailingValue = apiConnectionSummary(preferences.apiBaseUrl),
                    onClick = onOpenConnection,
                    showDivider = false,
                )
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
fun PreviewConnectionScreen(
    preferences: PreviewAppPreferences,
    onBack: () -> Unit,
    onApiUrlChanged: () -> Unit = {},
) {
    AppScaffold(topBar = { SettingsTopBar(title = "连接", onBack = onBack) }) {
        Column(modifier = Modifier.fillMaxSize()) {
            Column(
                modifier =
                    Modifier
                        .weight(1f)
                        .verticalScroll(rememberScrollState())
                        .padding(top = 8.dp),
                verticalArrangement = Arrangement.spacedBy(HarnessLayout.settingsGroupGap),
            ) {
                SettingsGroup {
                    Column(
                        modifier =
                            Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 16.dp, vertical = 16.dp),
                    ) {
                        SettingsTextField(
                            value = preferences.apiBaseUrl,
                            onValueChange = { url ->
                                preferences.updateApiBaseUrl(url)
                                onApiUrlChanged()
                            },
                            label = "API Base URL",
                            placeholder = "http://192.168.x.x:4318",
                        )
                    }
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
) {
    var servers by remember { mutableStateOf<List<McpServerUiModel>>(emptyList()) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(backend) {
        servers = backend.listServers()
    }
    LifecycleResumeEffect(backend) {
        scope.launch { servers = backend.listServers() }
        onPauseOrDispose { }
    }
    AppScaffold(topBar = { SettingsTopBar(title = "MCP 服务器", onBack = onBack) }) {
        Column(modifier = Modifier.fillMaxSize()) {
            Column(
                modifier =
                    Modifier
                        .weight(1f)
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
            val row = backend.listServers().find { it.id == serverId }
            existing = row
            name = row?.serverName ?: ""
            url = row?.url ?: ""
            enabled = row?.enabled ?: true
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
) {
    var state by remember { mutableStateOf(MemoryHubState(allowAgentWrite = true, entries = emptyList())) }
    val scope = rememberCoroutineScope()
    val toast = LocalAppToast.current
    LaunchedEffect(backend) {
        state = backend.load()
    }
    AppScaffold(topBar = { SettingsTopBar(title = "记忆", onBack = onBack) }) {
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
                            text = entry.text,
                            onDelete = {
                                scope.launch {
                                    backend.deleteEntry(entry.id).fold(
                                        onSuccess = {
                                            state =
                                                state.copy(
                                                    entries = state.entries.filterNot { it.id == entry.id },
                                                )
                                        },
                                        onFailure = { toast.show(it.message ?: "删除失败") },
                                    )
                                }
                            },
                            showDivider = index < state.entries.lastIndex,
                        )
                    }
                }
            }
        }
    }
}

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
    text: String,
    onDelete: () -> Unit,
    showDivider: Boolean,
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
            Text(
                text = text,
                color = colors.secondary,
                fontSize = 15.sp,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = "删除",
                color = colors.link,
                fontSize = 14.sp,
                modifier = Modifier.clickable(onClick = onDelete),
            )
        }
    }
}

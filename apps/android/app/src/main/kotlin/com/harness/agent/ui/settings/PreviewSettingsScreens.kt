package com.harness.agent.ui.settings

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.harness.agent.coreui.primitives.AppButton
import com.harness.agent.coreui.primitives.AppDivider
import com.harness.agent.coreui.primitives.AppScaffold
import com.harness.agent.coreui.primitives.AppText
import com.harness.agent.coreui.primitives.AppTextField
import com.harness.agent.coreui.primitives.AppTextStyle
import com.harness.agent.coreui.primitives.AppTopBar
import com.harness.agent.coreui.primitives.Badge
import com.harness.agent.coreui.primitives.SettingsSwitch
import com.harness.agent.coreui.tokens.HarnessLayout
import com.harness.agent.coreui.tokens.LocalHarnessColors
import com.harness.agent.preview.PreviewAppPreferences
import com.harness.agent.preview.PreviewMcpServer
import com.harness.agent.preview.PreviewThemeMode
import java.util.UUID

@Composable
fun PreviewSettingsRootScreen(
    preferences: PreviewAppPreferences,
    onBack: () -> Unit,
    onOpenMemory: () -> Unit,
    onOpenMcp: () -> Unit,
    onOpenPreviewScenarios: () -> Unit = {},
) {
    val colors = LocalHarnessColors.current
    val effectiveApi =
        preferences.apiBaseUrl.trim().ifBlank { "（未填 — Phase B 联调后生效）" }

    AppScaffold(
        topBar = {
            SettingsTopBar(title = "设置", onBack = onBack)
        },
    ) {
        Column(
            modifier =
                Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(vertical = 4.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            SettingsSection(title = "通用") {
                AppText(text = "主题", style = AppTextStyle.Caption)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    themeChip("跟随系统", preferences.themeMode == PreviewThemeMode.SYSTEM) {
                        preferences.updateThemeMode(PreviewThemeMode.SYSTEM)
                    }
                    themeChip("浅色", preferences.themeMode == PreviewThemeMode.LIGHT) {
                        preferences.updateThemeMode(PreviewThemeMode.LIGHT)
                    }
                    themeChip("深色", preferences.themeMode == PreviewThemeMode.DARK) {
                        preferences.updateThemeMode(PreviewThemeMode.DARK)
                    }
                }
                Spacer(Modifier.height(12.dp))
                AppDivider()
                Spacer(Modifier.height(12.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    AppText(text = "正文字号", style = AppTextStyle.Body, modifier = Modifier.weight(1f))
                    SettingsStepperButton(label = "−") {
                        preferences.updateContentFontSize(preferences.contentFontSize - 1)
                    }
                    AppText(text = "${preferences.contentFontSize}px", style = AppTextStyle.Body)
                    SettingsStepperButton(label = "+") {
                        preferences.updateContentFontSize(preferences.contentFontSize + 1)
                    }
                }
                Spacer(Modifier.height(8.dp))
                AppDivider()
                SettingsSwitch(
                    label = "Reduce Motion",
                    checked = preferences.reduceMotion,
                    onCheckedChange = preferences::updateReduceMotion,
                    description = "Drawer / Workbench 减少滑动动画（Preview 假保存）",
                )
            }

            SettingsSection(title = "Agent") {
                SettingsNavRow(
                    title = "记忆",
                    subtitle = "本地假数据 · UI+Local",
                    onClick = onOpenMemory,
                )
                SettingsNavRow(
                    title = "MCP 服务器",
                    subtitle = "CRUD + Test 模拟",
                    onClick = onOpenMcp,
                )
                SettingsNavRow(
                    title = "演示场景",
                    subtitle = "切换 Gate A fixture（开发用）",
                    onClick = onOpenPreviewScenarios,
                    showDivider = false,
                )
            }

            SettingsSection(title = "连接") {
                AppText(text = "API Base URL（仅编辑器 UI）", style = AppTextStyle.Caption)
                Spacer(Modifier.height(8.dp))
                Column(
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .background(colors.canvas, RoundedCornerShape(HarnessLayout.controlRadius))
                            .border(1.dp, colors.composerBorder, RoundedCornerShape(HarnessLayout.controlRadius))
                            .padding(horizontal = 12.dp, vertical = 4.dp),
                ) {
                    AppTextField(
                        value = preferences.apiBaseUrl,
                        onValueChange = preferences::updateApiBaseUrl,
                        label = "http://192.168.x.x:4318",
                    )
                }
                Spacer(Modifier.height(8.dp))
                AppText(text = "当前生效：$effectiveApi", style = AppTextStyle.Muted)
            }

            Surface(
                color = colors.subtle,
                shape = RoundedCornerShape(HarnessLayout.panelRadius),
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .border(1.dp, colors.composerBorder, RoundedCornerShape(HarnessLayout.panelRadius)),
            ) {
                AppText(
                    text = "Phase A：所有保存均为本地 KV，不发起 Harness HTTP。",
                    style = AppTextStyle.Caption,
                    modifier = Modifier.padding(12.dp),
                )
            }
        }
    }
}

@Composable
fun PreviewMcpListScreen(
    preferences: PreviewAppPreferences,
    onBack: () -> Unit,
    onEditServer: (String) -> Unit,
) {
    AppScaffold(topBar = { SettingsTopBar(title = "MCP 服务器", onBack = onBack) }) {
        Column(
            modifier =
                Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            AppText(
                text = "列表与表单为静态 UI；Test 按钮弹出本地 Alert。",
                style = AppTextStyle.Muted,
            )
            SettingsSection(title = "已配置") {
                if (preferences.mcpServers.isEmpty()) {
                    AppText(text = "暂无服务器", style = AppTextStyle.Muted)
                } else {
                    preferences.mcpServers.forEachIndexed { index, server ->
                        McpServerRow(
                            server = server,
                            onClick = { onEditServer(server.id) },
                            showDivider = index < preferences.mcpServers.lastIndex,
                        )
                    }
                }
            }
            AppButton(text = "添加服务器", onClick = { onEditServer("new") })
        }
    }
}

@Composable
fun PreviewMcpFormScreen(
    preferences: PreviewAppPreferences,
    serverId: String,
    onBack: () -> Unit,
) {
    val existing = preferences.mcpServers.find { it.id == serverId }
    var name by remember(serverId) { mutableStateOf(existing?.serverName ?: "") }
    var url by remember(serverId) { mutableStateOf(existing?.url ?: "") }
    var enabled by remember(serverId) { mutableStateOf(existing?.enabled ?: true) }
    var showTestAlert by remember { mutableStateOf(false) }
    val context = LocalContext.current

    val colors = LocalHarnessColors.current
    AppScaffold(topBar = { SettingsTopBar(title = if (existing == null) "新建 MCP" else "编辑 MCP", onBack = onBack) }) {
        Column(
            modifier =
                Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            SettingsSection(title = "连接") {
                SettingsFieldShell {
                    AppTextField(value = name, onValueChange = { name = it }, label = "名称")
                }
                Spacer(Modifier.height(8.dp))
                SettingsFieldShell {
                    AppTextField(value = url, onValueChange = { url = it }, label = "URL / 命令")
                }
                SettingsSwitch(label = "启用", checked = enabled, onCheckedChange = { enabled = it })
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                AppButton(
                    text = "Test",
                    onClick = {
                        showTestAlert = true
                        Toast.makeText(context, "Preview：MCP test 已模拟", Toast.LENGTH_SHORT).show()
                    },
                )
                if (existing != null) {
                    AppButton(
                        text = "删除",
                        onClick = {
                            preferences.deleteMcpServer(existing.id)
                            onBack()
                        },
                    )
                }
            }
            AppButton(
                text = "保存",
                enabled = name.isNotBlank() && url.isNotBlank(),
                onClick = {
                    val id = existing?.id ?: UUID.randomUUID().toString()
                    preferences.upsertMcpServer(
                        PreviewMcpServer(id = id, serverName = name.trim(), url = url.trim(), enabled = enabled),
                    )
                    onBack()
                },
            )
            Surface(
                color = colors.subtle,
                shape = RoundedCornerShape(HarnessLayout.panelRadius),
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .border(1.dp, colors.composerBorder, RoundedCornerShape(HarnessLayout.panelRadius)),
            ) {
                AppText(
                    text = "Test 与保存均为 Preview 本地模拟。",
                    style = AppTextStyle.Caption,
                    modifier = Modifier.padding(12.dp),
                )
            }
        }
    }

    if (showTestAlert) {
        AlertDialog(
            onDismissRequest = { showTestAlert = false },
            title = { AppText(text = "MCP Test（Preview）", style = AppTextStyle.Title) },
            text = { AppText(text = "连接成功（本地模拟）。Phase B 将调用 Host MCP API。", style = AppTextStyle.Body) },
            confirmButton = {
                TextButton(onClick = { showTestAlert = false }) {
                    AppText(text = "确定", style = AppTextStyle.Body)
                }
            },
        )
    }
}

@Composable
fun PreviewMemoryHubScreen(
    preferences: PreviewAppPreferences,
    onBack: () -> Unit,
) {
    var draft by remember { mutableStateOf("") }

    AppScaffold(topBar = { SettingsTopBar(title = "记忆", onBack = onBack) }) {
        Column(
            modifier =
                Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            SettingsSection(title = "写入") {
                SettingsSwitch(
                    label = "允许 Agent 写入记忆",
                    description = "本地开关 · 不调用 API",
                    checked = preferences.allowAgentMemoryWrite,
                    onCheckedChange = preferences::updateAllowAgentMemoryWrite,
                )
            }
            SettingsSection(title = "新增") {
                SettingsFieldShell {
                    AppTextField(value = draft, onValueChange = { draft = it }, label = "记忆条目")
                }
                Spacer(Modifier.height(8.dp))
                AppButton(
                    text = "添加",
                    enabled = draft.isNotBlank(),
                    onClick = {
                        preferences.addMemoryEntry(draft)
                        draft = ""
                    },
                )
            }
            SettingsSection(title = "条目") {
                if (preferences.memoryEntries.isEmpty()) {
                    AppText(text = "暂无记忆", style = AppTextStyle.Muted)
                } else {
                    preferences.memoryEntries.forEachIndexed { index, entry ->
                        Row(
                            modifier =
                                Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            AppText(text = entry.text, style = AppTextStyle.Body, modifier = Modifier.weight(1f))
                            AppText(
                                text = "删除",
                                style = AppTextStyle.Link,
                                modifier = Modifier.clickable { preferences.deleteMemoryEntry(entry.id) },
                            )
                        }
                        if (index < preferences.memoryEntries.lastIndex) {
                            AppDivider()
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SettingsTopBar(
    title: String,
    onBack: () -> Unit,
) {
    AppTopBar(
        title = title,
        trailing = {
            AppText(
                text = "返回",
                style = AppTextStyle.Link,
                modifier = Modifier.clickable(onClick = onBack).padding(end = 8.dp),
            )
        },
    )
}

@Composable
private fun SettingsNavRow(
    title: String,
    subtitle: String? = null,
    onClick: () -> Unit,
    showDivider: Boolean = true,
) {
    val colors = LocalHarnessColors.current
    Column(modifier = Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                AppText(text = title, style = AppTextStyle.Body)
                if (subtitle != null) {
                    AppText(text = subtitle, style = AppTextStyle.Muted)
                }
            }
            Icon(
                imageVector = Icons.AutoMirrored.Filled.KeyboardArrowRight,
                contentDescription = null,
                tint = colors.muted,
            )
        }
        if (showDivider) {
            AppDivider()
        }
    }
}

@Composable
private fun SettingsFieldShell(
    content: @Composable () -> Unit,
) {
    val colors = LocalHarnessColors.current
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .background(colors.canvas, RoundedCornerShape(HarnessLayout.controlRadius))
                .border(1.dp, colors.composerBorder, RoundedCornerShape(HarnessLayout.controlRadius))
                .padding(horizontal = 12.dp, vertical = 4.dp),
    ) {
        content()
    }
}

@Composable
private fun SettingsSection(
    title: String,
    content: @Composable () -> Unit,
) {
    val colors = LocalHarnessColors.current
    Surface(
        color = colors.surface,
        shape = RoundedCornerShape(HarnessLayout.panelRadius),
        modifier =
            Modifier
                .fillMaxWidth()
                .border(1.dp, colors.composerBorder, RoundedCornerShape(HarnessLayout.panelRadius)),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            AppText(text = title, style = AppTextStyle.Title)
            Spacer(Modifier.height(12.dp))
            content()
        }
    }
}

@Composable
private fun SettingsStepperButton(
    label: String,
    onClick: () -> Unit,
) {
    val colors = LocalHarnessColors.current
    Surface(
        onClick = onClick,
        color = colors.surface,
        shape = RoundedCornerShape(HarnessLayout.controlRadius),
        modifier =
            Modifier
                .size(32.dp)
                .border(1.dp, colors.composerBorder, RoundedCornerShape(HarnessLayout.controlRadius)),
    ) {
        Row(
            modifier = Modifier.fillMaxSize(),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            AppText(text = label, style = AppTextStyle.Title)
        }
    }
}

@Composable
private fun themeChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val colors = LocalHarnessColors.current
    val shape = RoundedCornerShape(999.dp)
    Surface(
        color = if (selected) colors.subtle else colors.surface,
        shape = shape,
        modifier =
            Modifier
                .clickable(onClick = onClick)
                .border(
                    width = 1.dp,
                    color = if (selected) colors.primary else colors.composerBorder,
                    shape = shape,
                ),
    ) {
        AppText(text = label, style = AppTextStyle.Caption, modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp))
    }
}

@Composable
private fun McpServerRow(
    server: PreviewMcpServer,
    onClick: () -> Unit,
    showDivider: Boolean = true,
) {
    Column(
        modifier =
            Modifier
                .fillMaxWidth()
                .clickable(onClick = onClick),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    AppText(text = server.serverName, style = AppTextStyle.Body, modifier = Modifier.weight(1f))
                    Badge(text = if (server.enabled) "已启用" else "未启用")
                }
                AppText(text = server.url, style = AppTextStyle.Muted)
            }
            Icon(
                imageVector = Icons.AutoMirrored.Filled.KeyboardArrowRight,
                contentDescription = null,
                tint = LocalHarnessColors.current.muted,
            )
        }
        if (showDivider) {
            AppDivider()
        }
    }
}

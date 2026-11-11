package com.harness.agent.preview

import android.content.Context
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshots.SnapshotStateList
import com.harness.agent.model.ReaderTarget
import com.harness.mobile.core.api.HarnessAgentEndpoints
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

enum class PreviewThemeMode {
    SYSTEM,
    LIGHT,
    DARK,
}

data class PreviewMcpServer(
    val id: String,
    val serverName: String,
    val url: String,
    val enabled: Boolean = true,
)

data class PreviewMemoryEntry(
    val id: String,
    val title: String = "",
    val kind: String = "preference",
    val text: String,
)

class PreviewAppPreferences(
    context: Context,
) {
    private val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    var themeMode by mutableStateOf(loadThemeMode())
        private set
    var contentFontSize by mutableIntStateOf(prefs.getInt(KEY_FONT_SIZE, 15).coerceIn(13, 20))
        private set
    val apiBaseUrl: String
        get() = HarnessAgentEndpoints.API_BASE_URL
    /** Production 注入鉴权 Cookie，供 HTML 预览 WebView 使用。 */
    var sessionCookieHeaderProvider: () -> String? = { null }
    private var sessionTokenPresentProvider: () -> Boolean = { true }
    /** UI reads this state to recompose when token is cleared or expires. */
    var sessionTokenPresent by mutableStateOf(true)
        private set
    var allowAgentMemoryWrite by mutableStateOf(prefs.getBoolean(KEY_MEMORY_WRITE, true))
        private set
    val reduceMotion: Boolean
        get() = false
    var readerTitle by mutableStateOf("Report")
        private set
    var readerMarkdown by mutableStateOf("")
        private set
    var readerIsArtifact by mutableStateOf(false)
        private set
    var readerTarget by mutableStateOf<ReaderTarget?>(null)
        private set

    var authProfile by mutableStateOf(loadAuthProfile())
        private set

    val isLoggedIn: Boolean
        get() = authProfile != null && sessionTokenPresent

    val mcpServers: SnapshotStateList<PreviewMcpServer> = mutableStateListOf<PreviewMcpServer>().apply {
        addAll(loadMcpServers())
    }

    val memoryEntries: SnapshotStateList<PreviewMemoryEntry> = mutableStateListOf<PreviewMemoryEntry>().apply {
        addAll(loadMemoryEntries())
    }

    fun updateThemeMode(mode: PreviewThemeMode) {
        themeMode = mode
        prefs.edit().putString(KEY_THEME, mode.name).apply()
    }

    fun updateContentFontSize(size: Int) {
        contentFontSize = size.coerceIn(13, 20)
        prefs.edit().putInt(KEY_FONT_SIZE, contentFontSize).apply()
    }

    fun updateAllowAgentMemoryWrite(value: Boolean) {
        allowAgentMemoryWrite = value
        prefs.edit().putBoolean(KEY_MEMORY_WRITE, value).apply()
    }

    /** 登录态以持久化 token 为准；资料只用于展示。 */
    fun observeSessionToken(presentProvider: () -> Boolean) {
        sessionTokenPresentProvider = presentProvider
        refreshSessionTokenPresence()
    }

    fun refreshSessionTokenPresence() {
        val present = sessionTokenPresentProvider()
        sessionTokenPresent = present
        if (!present) {
            updateAuthProfile(null)
        } else if (authProfile == null) {
            // Logged in on another screen; reload profile persisted at login time.
            authProfile = loadAuthProfile()
        }
    }

    fun updateAuthProfile(profile: PreviewAuthProfile?) {
        authProfile = profile
        if (profile == null) {
            prefs.edit().remove(KEY_AUTH_PHONE).remove(KEY_AUTH_NAME).apply()
        } else {
            prefs
                .edit()
                .putString(KEY_AUTH_PHONE, profile.phone)
                .putString(KEY_AUTH_NAME, profile.displayName)
                .apply()
        }
    }

    fun resolveComposerBlock(): PreviewComposerBlockKind {
        if (apiBaseUrl.trim().isNotEmpty() && !isLoggedIn) {
            return PreviewComposerBlockKind.LOGIN_REQUIRED
        }
        return PreviewComposerBlockKind.NONE
    }

    fun openReader(
        title: String,
        markdown: String,
        isArtifact: Boolean = false,
    ) {
        readerTitle = title
        readerMarkdown = markdown
        readerIsArtifact = isArtifact
        readerTarget = null
    }

    fun openArtifactReader(target: ReaderTarget) {
        readerTitle = target.fileName.ifBlank { "文件" }
        readerMarkdown = ""
        readerIsArtifact = true
        readerTarget = target
    }

    fun upsertMcpServer(server: PreviewMcpServer) {
        val index = mcpServers.indexOfFirst { it.id == server.id }
        if (index >= 0) {
            mcpServers[index] = server
        } else {
            mcpServers.add(server)
        }
        persistMcpServers()
    }

    fun deleteMcpServer(id: String) {
        mcpServers.removeAll { it.id == id }
        persistMcpServers()
    }

    fun addMemoryEntry(text: String) {
        if (text.isBlank()) return
        memoryEntries.add(0, PreviewMemoryEntry(id = UUID.randomUUID().toString(), text = text.trim()))
        persistMemoryEntries()
    }

    fun deleteMemoryEntry(id: String) {
        memoryEntries.removeAll { it.id == id }
        persistMemoryEntries()
    }

    fun updateMemoryEntry(
        id: String,
        title: String,
        kind: String,
        text: String,
    ) {
        val index = memoryEntries.indexOfFirst { it.id == id }
        if (index < 0) return
        memoryEntries[index] =
            PreviewMemoryEntry(
                id = id,
                title = title.trim(),
                kind = kind,
                text = text.trim(),
            )
        persistMemoryEntries()
    }

    @Composable
    fun resolveDarkTheme(): Boolean =
        when (themeMode) {
            PreviewThemeMode.LIGHT -> false
            PreviewThemeMode.DARK -> true
            PreviewThemeMode.SYSTEM -> isSystemInDarkTheme()
        }

    private fun loadThemeMode(): PreviewThemeMode =
        runCatching { PreviewThemeMode.valueOf(prefs.getString(KEY_THEME, PreviewThemeMode.SYSTEM.name)!!) }
            .getOrDefault(PreviewThemeMode.SYSTEM)

    private fun loadMcpServers(): List<PreviewMcpServer> {
        val raw = prefs.getString(KEY_MCP, null) ?: return defaultMcpServers()
        return runCatching { parseMcpJson(raw) }.getOrElse { defaultMcpServers() }
    }

    private fun loadMemoryEntries(): List<PreviewMemoryEntry> {
        val raw = prefs.getString(KEY_MEMORY, null) ?: return defaultMemoryEntries()
        return runCatching { parseMemoryJson(raw) }.getOrElse { defaultMemoryEntries() }
    }

    private fun persistMcpServers() {
        val array = JSONArray()
        mcpServers.forEach { server ->
            array.put(
                JSONObject()
                    .put("id", server.id)
                    .put("serverName", server.serverName)
                    .put("url", server.url)
                    .put("enabled", server.enabled),
            )
        }
        prefs.edit().putString(KEY_MCP, array.toString()).apply()
    }

    private fun persistMemoryEntries() {
        val array = JSONArray()
        memoryEntries.forEach { entry ->
            array.put(
                JSONObject()
                    .put("id", entry.id)
                    .put("title", entry.title)
                    .put("kind", entry.kind)
                    .put("text", entry.text),
            )
        }
        prefs.edit().putString(KEY_MEMORY, array.toString()).apply()
    }

    private fun parseMcpJson(raw: String): List<PreviewMcpServer> {
        val array = JSONArray(raw)
        return buildList {
            for (i in 0 until array.length()) {
                val row = array.getJSONObject(i)
                add(
                    PreviewMcpServer(
                        id = row.getString("id"),
                        serverName = row.getString("serverName"),
                        url = row.getString("url"),
                        enabled = row.optBoolean("enabled", true),
                    ),
                )
            }
        }
    }

    private fun parseMemoryJson(raw: String): List<PreviewMemoryEntry> {
        val array = JSONArray(raw)
        return buildList {
            for (i in 0 until array.length()) {
                val row = array.getJSONObject(i)
                add(
                    PreviewMemoryEntry(
                        id = row.getString("id"),
                        title = row.optString("title", ""),
                        kind = row.optString("kind", "preference"),
                        text = row.getString("text"),
                    ),
                )
            }
        }
    }

    private fun defaultMcpServers(): List<PreviewMcpServer> =
        listOf(
            PreviewMcpServer(
                id = "local-files",
                serverName = "本地文件（Preview）",
                url = "stdio://preview-files",
                enabled = true,
            ),
            PreviewMcpServer(
                id = "local-search",
                serverName = "检索（Preview）",
                url = "https://example.com/mcp",
                enabled = false,
            ),
        )

    private fun defaultMemoryEntries(): List<PreviewMemoryEntry> =
        listOf(
            PreviewMemoryEntry(id = "mem-1", text = "用户偏好：简洁回答"),
            PreviewMemoryEntry(id = "mem-2", text = "常用项目：hello-harness-agent"),
        )

    private fun loadAuthProfile(): PreviewAuthProfile? {
        val phone = prefs.getString(KEY_AUTH_PHONE, null)?.trim().orEmpty()
        if (phone.isEmpty()) return null
        val name = prefs.getString(KEY_AUTH_NAME, null)?.trim().orEmpty().ifBlank { phone }
        return PreviewAuthProfile(displayName = name, phone = phone)
    }

    companion object {
        private const val PREFS_NAME = "preview_app_preferences"
        private const val KEY_THEME = "themeMode"
        private const val KEY_FONT_SIZE = "contentFontSize"
        private const val KEY_API_URL = "apiBaseUrl"
        private const val KEY_MEMORY_WRITE = "allowAgentMemoryWrite"
        private const val KEY_MCP = "mcpServersJson"
        private const val KEY_MEMORY = "memoryEntriesJson"
        private const val KEY_AUTH_PHONE = "authPhone"
        private const val KEY_AUTH_NAME = "authDisplayName"
    }
}

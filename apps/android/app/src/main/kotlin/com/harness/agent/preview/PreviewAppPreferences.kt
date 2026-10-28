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
    var apiBaseUrl by mutableStateOf(prefs.getString(KEY_API_URL, "") ?: "")
        private set
    var allowAgentMemoryWrite by mutableStateOf(prefs.getBoolean(KEY_MEMORY_WRITE, true))
        private set
    var reduceMotion by mutableStateOf(prefs.getBoolean(KEY_REDUCE_MOTION, false))
        private set
    var readerTitle by mutableStateOf("Report")
        private set
    var readerMarkdown by mutableStateOf("")
        private set
    var readerIsArtifact by mutableStateOf(false)
        private set

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

    fun updateApiBaseUrl(url: String) {
        apiBaseUrl = url
        prefs.edit().putString(KEY_API_URL, url).apply()
    }

    fun updateAllowAgentMemoryWrite(value: Boolean) {
        allowAgentMemoryWrite = value
        prefs.edit().putBoolean(KEY_MEMORY_WRITE, value).apply()
    }

    fun updateReduceMotion(value: Boolean) {
        reduceMotion = value
        prefs.edit().putBoolean(KEY_REDUCE_MOTION, value).apply()
    }

    fun openReader(
        title: String,
        markdown: String,
        isArtifact: Boolean = false,
    ) {
        readerTitle = title
        readerMarkdown = markdown
        readerIsArtifact = isArtifact
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
                add(PreviewMemoryEntry(id = row.getString("id"), text = row.getString("text")))
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

    companion object {
        private const val PREFS_NAME = "preview_app_preferences"
        private const val KEY_THEME = "themeMode"
        private const val KEY_FONT_SIZE = "contentFontSize"
        private const val KEY_API_URL = "apiBaseUrl"
        private const val KEY_MEMORY_WRITE = "allowAgentMemoryWrite"
        private const val KEY_REDUCE_MOTION = "reduceMotion"
        private const val KEY_MCP = "mcpServersJson"
        private const val KEY_MEMORY = "memoryEntriesJson"
    }
}

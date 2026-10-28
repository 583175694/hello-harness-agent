package com.harness.agent

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.harness.agent.coreui.tokens.HarnessTheme
import com.harness.agent.preview.MobileContractPreviewLoader
import com.harness.agent.preview.PreviewAgentSessionPort
import com.harness.agent.preview.PreviewAppPreferences
import com.harness.agent.preview.PreviewSessionViewModel
import com.harness.agent.ui.PreviewChatShellScreen
import com.harness.agent.ui.PreviewDevMenuScreen
import com.harness.agent.ui.reader.PreviewReportReaderScreen
import com.harness.agent.ui.settings.PreviewMcpFormScreen
import com.harness.agent.ui.settings.PreviewMcpListScreen
import com.harness.agent.ui.settings.PreviewMemoryHubScreen
import com.harness.agent.ui.settings.PreviewSettingsRootScreen

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val loader = MobileContractPreviewLoader(applicationContext)
        val port = PreviewAgentSessionPort(loader)
        val viewModel = PreviewSessionViewModel(port)
        val initialFixture = intent?.getStringExtra(EXTRA_PREVIEW_FIXTURE) ?: DEFAULT_PREVIEW_FIXTURE
        viewModel.selectFixture(initialFixture)

        setContent {
            val preferences = remember { PreviewAppPreferences(applicationContext) }
            HarnessTheme(
                darkTheme = preferences.resolveDarkTheme(),
                contentFontSizeSp = preferences.contentFontSize,
            ) {
                val navController = rememberNavController()
                var selectedFixture by remember { mutableStateOf(initialFixture) }

                NavHost(navController = navController, startDestination = "chat") {
                    composable("dev-menu") {
                        PreviewDevMenuScreen(
                            viewModel = viewModel,
                            onBack = { navController.popBackStack() },
                            onOpenScenario = { fileName ->
                                selectedFixture = fileName
                                viewModel.selectFixture(fileName)
                                navController.navigate("chat") {
                                    popUpTo("chat") { inclusive = true }
                                    launchSingleTop = true
                                }
                            },
                            onOpenSettings = { navController.navigate("settings") },
                        )
                    }
                    composable("chat") {
                        PreviewChatShellScreen(
                            viewModel = viewModel,
                            preferences = preferences,
                            fixtureFileName = selectedFixture,
                            onLoadDemoFixture = {
                                selectedFixture = PREVIEW_DEMO_FIXTURE
                                viewModel.selectFixture(PREVIEW_DEMO_FIXTURE)
                            },
                            onOpenSettings = { navController.navigate("settings") },
                            onOpenReportReader = { title, markdown ->
                                preferences.openReader(title, markdown, isArtifact = false)
                                navController.navigate("reader/report")
                            },
                            onOpenArtifactReader = { title, diff ->
                                preferences.openReader(title, diff, isArtifact = true)
                                navController.navigate("reader/report")
                            },
                        )
                    }
                    composable("settings") {
                        PreviewSettingsRootScreen(
                            preferences = preferences,
                            onBack = { navController.popBackStack() },
                            onOpenMemory = { navController.navigate("settings/memory") },
                            onOpenMcp = { navController.navigate("settings/mcp") },
                            onOpenPreviewScenarios = { navController.navigate("dev-menu") },
                        )
                    }
                    composable("settings/memory") {
                        PreviewMemoryHubScreen(
                            preferences = preferences,
                            onBack = { navController.popBackStack() },
                        )
                    }
                    composable("settings/mcp") {
                        PreviewMcpListScreen(
                            preferences = preferences,
                            onBack = { navController.popBackStack() },
                            onEditServer = { id -> navController.navigate("settings/mcp/edit/$id") },
                        )
                    }
                    composable(
                        route = "settings/mcp/edit/{serverId}",
                        arguments = listOf(navArgument("serverId") { type = NavType.StringType }),
                    ) { entry ->
                        val serverId = entry.arguments?.getString("serverId") ?: "new"
                        PreviewMcpFormScreen(
                            preferences = preferences,
                            serverId = serverId,
                            onBack = { navController.popBackStack() },
                        )
                    }
                    composable("reader/report") {
                        PreviewReportReaderScreen(
                            preferences = preferences,
                            onBack = { navController.popBackStack() },
                        )
                    }
                }
            }
        }
    }

    companion object {
        const val DEFAULT_PREVIEW_FIXTURE = "empty-landing.json"
        /** Gate A 综合 Mock：对话 + Activity / 来源 / 报告 / Artifact */
        const val PREVIEW_DEMO_FIXTURE = "rich-session-showcase.json"

        /** Dev Menu 置顶演示 fixture（越靠前越靠上） */
        val PREVIEW_DEMO_FIXTURE_ORDER =
            listOf(
                "rich-session-showcase.json",
                "stock-market-review.json",
            )

        fun demoFixtureSortRank(fileName: String): Int {
            val index = PREVIEW_DEMO_FIXTURE_ORDER.indexOf(fileName)
            return if (index >= 0) index else Int.MAX_VALUE
        }

        const val EXTRA_PREVIEW_FIXTURE = "preview_fixture"
    }
}

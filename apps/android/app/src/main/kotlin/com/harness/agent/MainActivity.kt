package com.harness.agent

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.harness.agent.coreui.motion.rememberHarnessReduceMotion
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.harness.agent.coreui.feedback.AppToastHost
import com.harness.agent.media.ProvideHarnessImageAuth
import com.harness.agent.coreui.tokens.HarnessTheme
import com.harness.agent.ui.settings.PreviewLoginScreen
import com.harness.agent.di.AgentSessionPortModule
import com.harness.agent.preview.PreviewAppPreferences
import com.harness.agent.preview.PreviewSessionViewModel
import com.harness.agent.ui.PreviewChatShellScreen
import com.harness.agent.ui.PreviewDevMenuScreen
import com.harness.agent.ui.reader.PreviewReportReaderScreen
import com.harness.agent.ui.settings.PreviewMcpFormScreen
import com.harness.agent.ui.settings.PreviewMcpListScreen
import com.harness.agent.ui.settings.PreviewMemoryEntryScreen
import com.harness.agent.ui.settings.PreviewMemoryHubScreen
import com.harness.agent.ui.navigation.harnessNavEnterTransition
import com.harness.agent.ui.navigation.harnessNavExitTransition
import com.harness.agent.ui.navigation.harnessNavPopEnterTransition
import com.harness.agent.ui.navigation.harnessNavPopExitTransition
import com.harness.agent.ui.settings.PreviewSettingsRootScreen
import com.harness.agent.BuildConfig

class MainActivity : ComponentActivity() {
    private lateinit var sessionViewModel: PreviewSessionViewModel

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val preferencesHolder = PreviewAppPreferences(applicationContext)
        val port = AgentSessionPortModule.create(applicationContext, preferencesHolder)
        MainActivityFlavor.wirePreviewAuth(preferencesHolder)
        sessionViewModel = PreviewSessionViewModel(port)
        val viewModel = sessionViewModel
        val mcpBackend = MainActivityFlavor.mcpSettingsBackend(preferencesHolder)
        val memoryBackend = MainActivityFlavor.memorySettingsBackend(preferencesHolder)
        val initialFixture = intent?.getStringExtra(EXTRA_PREVIEW_FIXTURE) ?: DEFAULT_PREVIEW_FIXTURE
        if (BuildConfig.USE_PREVIEW_PORT) {
            viewModel.selectFixture(initialFixture)
        } else {
            viewModel.bootstrapCoreConnection()
        }

        setContent {
            val preferences = remember { preferencesHolder }
            HarnessTheme(
                darkTheme = preferences.resolveDarkTheme(),
                contentFontSizeSp = preferences.contentFontSize,
            ) {
                AppToastHost {
                ProvideHarnessImageAuth(MainActivityFlavor.imageAuth(preferences)) {
                val navController = rememberNavController()
                var selectedFixture by remember { mutableStateOf(initialFixture) }
                val reduceMotion = rememberHarnessReduceMotion(preferences.reduceMotion)

                NavHost(
                    navController = navController,
                    startDestination = "chat",
                    enterTransition = {
                        if (reduceMotion) EnterTransition.None else harnessNavEnterTransition()
                    },
                    exitTransition = {
                        if (reduceMotion) ExitTransition.None else harnessNavExitTransition()
                    },
                    popEnterTransition = {
                        if (reduceMotion) EnterTransition.None else harnessNavPopEnterTransition()
                    },
                    popExitTransition = {
                        if (reduceMotion) ExitTransition.None else harnessNavPopExitTransition()
                    },
                ) {
                    if (BuildConfig.USE_PREVIEW_PORT) {
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
                            onOpenLogin = { navController.navigate("settings/login") },
                            onOpenReportReader = { title, markdown ->
                                preferences.openReader(title, markdown, isArtifact = false)
                                navController.navigate("reader/report")
                            },
                            onOpenArtifactReader = { target ->
                                preferences.openArtifactReader(target)
                                navController.navigate("reader/report")
                            },
                        )
                    }
                    composable("settings") {
                        PreviewSettingsRootScreen(
                            preferences = preferences,
                            onBack = { navController.popBackStack() },
                            onOpenLogin = { navController.navigate("settings/login") },
                            onOpenMemory = { navController.navigate("settings/memory") },
                            onOpenMcp = { navController.navigate("settings/mcp") },
                            onOpenPreviewScenarios =
                                if (BuildConfig.USE_PREVIEW_PORT) {
                                    { navController.navigate("dev-menu") }
                                } else {
                                    {}
                                },
                            onSignOut = {
                                MainActivityFlavor.signOut(this@MainActivity, preferences, port) {}
                            },
                        )
                    }
                    composable("settings/login") {
                        PreviewLoginScreen(
                            preferences = preferences,
                            onBack = { navController.popBackStack() },
                            onLoggedIn = {
                                viewModel.resetForAuthChange()
                                navController.popBackStack()
                            },
                            loginCoordinator = MainActivityFlavor.loginCoordinator(),
                        )
                    }
                    composable("settings/memory") {
                        PreviewMemoryHubScreen(
                            backend = memoryBackend,
                            onBack = { navController.popBackStack() },
                            onOpenEntry = { id -> navController.navigate("settings/memory/$id") },
                            onOpenLogin = { navController.navigate("settings/login") },
                        )
                    }
                    composable("settings/memory/{entryId}") { backStackEntry ->
                        val entryId = backStackEntry.arguments?.getString("entryId").orEmpty()
                        PreviewMemoryEntryScreen(
                            backend = memoryBackend,
                            entryId = entryId,
                            onBack = { navController.popBackStack() },
                        )
                    }
                    composable("settings/mcp") {
                        PreviewMcpListScreen(
                            backend = mcpBackend,
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
                            backend = mcpBackend,
                            serverId = serverId,
                            onBack = { navController.popBackStack() },
                        )
                    }
                    composable("reader/report") {
                        PreviewReportReaderScreen(
                            preferences = preferences,
                            onBack = { navController.popBackStack() },
                            loadPreview = viewModel::previewArtifactTarget,
                            loadDownload = viewModel::downloadArtifactTarget,
                        )
                    }
                }
                }
                }
            }
        }
    }

    override fun onStart() {
        super.onStart()
        if (!BuildConfig.USE_PREVIEW_PORT) {
            sessionViewModel.onAppForeground()
        }
    }

    override fun onStop() {
        if (!BuildConfig.USE_PREVIEW_PORT) {
            sessionViewModel.onAppBackground()
        }
        super.onStop()
    }

    companion object {
        const val DEFAULT_PREVIEW_FIXTURE = "empty-landing.json"
        /** Gate A 综合 Mock：对话 + Activity / 来源 / 报告 / Artifact */
        const val PREVIEW_DEMO_FIXTURE = "rich-session-showcase.json"

        /** Dev Menu 置顶演示 fixture（越靠前越靠上） */
        val PREVIEW_DEMO_FIXTURE_ORDER =
            listOf(
                "chat-markdown-gallery.json",
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

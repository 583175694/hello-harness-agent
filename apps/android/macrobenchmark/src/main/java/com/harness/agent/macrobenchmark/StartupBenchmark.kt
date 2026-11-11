package com.harness.agent.macrobenchmark

import android.content.Intent
import androidx.benchmark.macro.CompilationMode
import androidx.benchmark.macro.StartupMode
import androidx.benchmark.macro.StartupTimingMetric
import androidx.benchmark.macro.junit4.MacrobenchmarkRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.uiautomator.By
import androidx.test.uiautomator.Until
import org.junit.Ignore
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * 冷/温启动回归。measureRepeated 的 startupMode 控制每次迭代前的进程清理；
 * 首帧等待用 UiAutomator 而非 am start -W（1 核模拟器上后者的 gfxinfo 首帧确认不稳定）。
 *
 * 现状：API 36 模拟器（1 core）上 macrobenchmark 1.3.3 的 amStartAndWait 会因
 * `dumpsys gfxinfo framestats` 未返回新窗口而误判，故默认 @Ignore；
 * 真机执行时移除 @Ignore：
 *   ./gradlew :macrobenchmark:connectedPreviewBenchmarkAndroidTest \
 *     -Pandroid.testInstrumentationRunnerArguments.class=com.harness.agent.macrobenchmark.StartupBenchmark
 */
@Ignore("Requires physical device: emulator gfxinfo framestats cannot confirm first frame")
@RunWith(AndroidJUnit4::class)
class StartupBenchmark {
    @get:Rule
    val benchmarkRule = MacrobenchmarkRule()

    @Test
    fun coldStartup() =
        benchmarkRule.measureRepeated(
            packageName = "com.harness.agent",
            metrics = listOf(StartupTimingMetric()),
            compilationMode = CompilationMode.None(),
            iterations = 3,
            startupMode = StartupMode.COLD,
            setupBlock = {
                pressHome()
            },
        ) {
            startActivityAndWait(
                Intent(Intent.ACTION_MAIN).apply {
                    setClassName(packageName, "com.harness.agent.MainActivity")
                    addCategory(Intent.CATEGORY_LAUNCHER)
                },
            )
            device.wait(Until.hasObject(By.pkg(packageName).depth(0)), 20_000)
        }

    @Test
    fun warmStartup() =
        benchmarkRule.measureRepeated(
            packageName = "com.harness.agent",
            metrics = listOf(StartupTimingMetric()),
            compilationMode = CompilationMode.None(),
            iterations = 3,
            startupMode = StartupMode.WARM,
            setupBlock = {
                pressHome()
            },
        ) {
            startActivityAndWait(
                Intent(Intent.ACTION_MAIN).apply {
                    setClassName(packageName, "com.harness.agent.MainActivity")
                    addCategory(Intent.CATEGORY_LAUNCHER)
                },
            )
            device.wait(Until.hasObject(By.pkg(packageName).depth(0)), 20_000)
        }
}

package com.harness.agent.macrobenchmark

import androidx.benchmark.macro.CompilationMode
import androidx.benchmark.macro.FrameTimingMetric
import androidx.benchmark.macro.StartupMode
import androidx.benchmark.macro.junit4.MacrobenchmarkRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.uiautomator.By
import androidx.test.uiautomator.Direction
import androidx.test.uiautomator.Until
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Gate A 长列表场景：`long-thread-scroll.json`。
 * 运行：./gradlew :macrobenchmark:connectedPreviewBenchmarkAndroidTest
 * 目标（44 §8.2）：中位 ≥55fps、严重掉帧 <5%（在 CI/真机 Runbook 中记录 trace）。
 */
@RunWith(AndroidJUnit4::class)
class LongThreadScrollBenchmark {
    @get:Rule
    val benchmarkRule = MacrobenchmarkRule()

    @Test
    fun scrollConversationList() =
        benchmarkRule.measureRepeated(
            packageName = "com.harness.agent",
            metrics = listOf(FrameTimingMetric()),
            compilationMode = CompilationMode.None(),
            iterations = 5,
            startupMode = StartupMode.WARM,
            setupBlock = {
                pressHome()
                device.executeShellCommand(
                    "am start -W -n $packageName/com.harness.agent.MainActivity " +
                        "--es preview_fixture long-thread-scroll.json",
                )
                device.wait(Until.hasObject(By.scrollable(true)), 15_000)
            },
        ) {
            val scrollable = device.findObject(By.scrollable(true))
            repeat(3) {
                scrollable.fling(Direction.DOWN)
                device.waitForIdle()
            }
        }
}

package com.harness.agent.port

import com.harness.agent.model.ComposerModelOption
import kotlinx.coroutines.flow.StateFlow

/** Core 联调：public config 模型表与 `/api/skills` 列表（production 实现）。 */
interface ComposerCatalogPort {
    val composerModelOptions: StateFlow<List<ComposerModelOption>>
    val skillPickerNames: StateFlow<List<String>>
    suspend fun refreshSkillPicker()
}

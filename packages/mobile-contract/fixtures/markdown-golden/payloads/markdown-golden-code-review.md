## Code Review：`SessionEngineController`

整体方向正确；下面 2 处建议在合并前处理。

### 1. 重复订阅

`observeRuns()` 在 `init` 与 `resumeSession` 各注册一次，可能导致 **双份 SSE 事件**。

```kotlin
// 建议：单例 Job + 会话切换时 cancelAndJoin
private var runsJob: Job? = null

fun bindSession(sessionId: String) {
    runsJob?.cancel()
    runsJob = scope.launch { engine.observeRuns(sessionId).collect { … } }
}
```

### 2. 错误映射

`ProblemDetails` 的 `type` 未透传时，UI 只能显示泛化文案。

```typescript
export function mapProblem(details: ProblemDetails): UiProblem {
  return {
    title: details.title ?? '请求失败',
    type: details.type ?? 'unknown',
  };
}
```

行内引用：`RunControlModels.kt` 第 42 行附近。

**Verdict**：~~阻塞发布~~ → **批准合并**（修完 #1 即可）。

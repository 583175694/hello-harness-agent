package com.harness.agent.ui.chat

import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import com.harness.agent.model.ConversationItem
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.first

fun conversationUserTurnCount(conversation: List<ConversationItem>): Int =
    conversation.count { it is ConversationItem.User }

fun conversationLazyIndex(
    conversationIndex: Int,
    hasLoadOlderHeader: Boolean,
): Int = conversationIndex + if (hasLoadOlderHeader) 1 else 0

/** 旋转/进程内配置变化后恢复会话滚动位置。 */
@Composable
fun rememberConversationListState(): LazyListState =
    rememberSaveable(saver = LazyListState.Saver) { LazyListState() }

/**
 * 对话列表滚底：仅 (1) 进入/切换会话 (2) 用户发送新消息。
 * 流式输出、尾条变高、assistant 回复均不吸底。
 */
@Composable
fun ConversationScrollOnEnterAndUserSendEffect(
    listState: LazyListState,
    conversation: List<ConversationItem>,
    sessionKey: Any,
    hasLoadOlderHeader: Boolean,
) {
    var trackedUserTurns by remember(sessionKey) { mutableIntStateOf(conversationUserTurnCount(conversation)) }
    var restoredAfterConfigChange by rememberSaveable(sessionKey) { mutableStateOf(false) }
    LaunchedEffect(sessionKey) {
        if (restoredAfterConfigChange && listState.firstVisibleItemIndex > 0) {
            trackedUserTurns = conversationUserTurnCount(conversation)
            return@LaunchedEffect
        }
        restoredAfterConfigChange = true
        scrollToLastUserTurn(listState, conversation, hasLoadOlderHeader, animated = false)
    }

    val userTurns = conversationUserTurnCount(conversation)
    // 注意：不要用 conversation.size 作为 key。发送后 assistant 占位消息会立刻追加，
    // size 变化会取消正在进行的滚底动画，导致动画停在半路再被下面的逻辑二次定位（可见跳动）。
    LaunchedEffect(userTurns) {
        if (userTurns <= trackedUserTurns) return@LaunchedEffect
        trackedUserTurns = userTurns
        scrollToLastUserTurn(listState, conversation, hasLoadOlderHeader, animated = true)
    }
}

private suspend fun scrollToLastUserTurn(
    listState: LazyListState,
    conversation: List<ConversationItem>,
    hasLoadOlderHeader: Boolean,
    animated: Boolean,
): Unit {
    if (conversation.isEmpty()) return
    val lazyIndex = conversationLazyIndex(conversation.lastIndex, hasLoadOlderHeader)
    snapshotFlow { listState.layoutInfo.totalItemsCount }
        .filter { it > lazyIndex }
        .first()
    // 表格行高已在 HarnessMarkdownTextView 首次 onMeasure 内定型，滚动途中不会有 item 变高；
    // 因此只滚一次，不再用“动画 + delay(120) 补滚”的二次定位（那会产生可见回弹）。
    if (animated) listState.animateScrollToItem(lazyIndex) else listState.scrollToItem(lazyIndex)
}

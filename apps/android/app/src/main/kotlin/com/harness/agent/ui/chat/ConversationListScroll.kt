package com.harness.agent.ui.chat

import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import com.harness.agent.model.ConversationItem
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.first

fun conversationUserTurnCount(conversation: List<ConversationItem>): Int =
    conversation.count { it is ConversationItem.User }

fun conversationLazyIndex(
    conversationIndex: Int,
    hasLoadOlderHeader: Boolean,
): Int = conversationIndex + if (hasLoadOlderHeader) 1 else 0

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
    var trackedUserTurns by remember(sessionKey) { mutableIntStateOf(0) }

    LaunchedEffect(sessionKey, hasLoadOlderHeader) {
        trackedUserTurns = conversationUserTurnCount(conversation)
        scrollToLastUserTurn(listState, conversation, hasLoadOlderHeader, animated = false)
    }

    val userTurns = conversationUserTurnCount(conversation)
    LaunchedEffect(userTurns, hasLoadOlderHeader, conversation.size) {
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
) {
    val userIndex = conversation.indexOfLast { it is ConversationItem.User }
    if (userIndex < 0) return
    val lazyIndex = conversationLazyIndex(userIndex, hasLoadOlderHeader)
    snapshotFlow { listState.layoutInfo.totalItemsCount }
        .filter { it > lazyIndex }
        .first()
    if (animated) {
        listState.animateScrollToItem(lazyIndex)
    } else {
        listState.scrollToItem(lazyIndex)
    }
    // 键盘收起 / IME padding 变化后列表高度会变，补滚一次定位到刚发的用户消息。
    delay(120)
    if (animated) {
        listState.animateScrollToItem(lazyIndex)
    } else {
        listState.scrollToItem(lazyIndex)
    }
}

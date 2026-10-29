package com.harness.agent.ui.chat

import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import com.harness.agent.model.ConversationItem

fun conversationUserTurnCount(conversation: List<ConversationItem>): Int =
    conversation.count { it is ConversationItem.User }

/**
 * 对话列表滚底：仅 (1) 进入/切换会话 (2) 用户发送新消息。
 * 流式输出、尾条变高、assistant 回复均不吸底。
 */
@Composable
fun ConversationScrollOnEnterAndUserSendEffect(
    listState: LazyListState,
    conversation: List<ConversationItem>,
    sessionKey: Any,
) {
    var trackedUserTurns by remember(sessionKey) { mutableIntStateOf(0) }

    LaunchedEffect(sessionKey) {
        trackedUserTurns = conversationUserTurnCount(conversation)
        val last = conversation.lastIndex
        if (last >= 0) listState.scrollToItem(last)
    }

    val userTurns = conversationUserTurnCount(conversation)
    LaunchedEffect(userTurns) {
        if (userTurns <= trackedUserTurns) return@LaunchedEffect
        trackedUserTurns = userTurns
        if (conversation.lastOrNull() is ConversationItem.User) {
            val last = conversation.lastIndex
            if (last >= 0) listState.scrollToItem(last)
        }
    }
}

package com.harness.agent.coreui.feedback

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Snackbar
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.harness.agent.coreui.tokens.LocalHarnessColors
import kotlinx.coroutines.launch

/** 轻提示（对齐 Web toast / RN 短反馈）。 */
fun interface AppToastState {
    fun show(message: String)
}

val LocalAppToast =
    compositionLocalOf<AppToastState> {
        error("AppToastHost 未包裹当前界面")
    }

@Composable
fun AppToastHost(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val toastState =
        remember(snackbarHostState, scope) {
            AppToastState { message ->
                scope.launch {
                    snackbarHostState.showSnackbar(message = message, withDismissAction = false)
                }
            }
        }
    CompositionLocalProvider(LocalAppToast provides toastState) {
        Box(modifier = modifier.fillMaxSize()) {
            content()
            SnackbarHost(
                hostState = snackbarHostState,
                modifier =
                    Modifier
                        .align(Alignment.BottomCenter)
                        .padding(bottom = 88.dp, start = 16.dp, end = 16.dp),
            ) { data ->
                Snackbar(snackbarData = data)
            }
        }
    }
}

data class AppConfirmRequest(
    val title: String,
    val message: String,
    val confirmLabel: String = "确认",
    val dismissLabel: String = "取消",
    val destructive: Boolean = false,
    val onConfirm: () -> Unit,
)

@Composable
fun AppConfirmDialog(
    request: AppConfirmRequest?,
    onDismiss: () -> Unit,
) {
    if (request == null) return
    val colors = LocalHarnessColors.current
    HarnessModalDialog(onDismiss = onDismiss) {
        Text(
            text = request.title,
            color = colors.secondary,
            fontWeight = FontWeight.SemiBold,
            fontSize = 15.sp,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            text = request.message,
            color = colors.secondary,
            fontSize = 14.sp,
            lineHeight = 20.sp,
        )
        if (request.dismissLabel.isNotBlank()) {
            HarnessModalActionRow(
                dismissLabel = request.dismissLabel,
                onDismiss = onDismiss,
                confirmLabel = request.confirmLabel,
                onConfirm = {
                    request.onConfirm()
                    onDismiss()
                },
                destructive = request.destructive,
            )
        } else {
            HarnessModalPrimaryButton(
                label = request.confirmLabel,
                destructive = request.destructive,
                onClick = {
                    request.onConfirm()
                    onDismiss()
                },
            )
        }
    }
}

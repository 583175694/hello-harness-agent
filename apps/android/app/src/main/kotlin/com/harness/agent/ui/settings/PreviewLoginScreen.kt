package com.harness.agent.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.harness.agent.coreui.feedback.LocalAppToast
import com.harness.agent.coreui.primitives.AppScaffold
import com.harness.agent.coreui.primitives.AppText
import com.harness.agent.coreui.primitives.SettingsTextField
import com.harness.agent.coreui.tokens.HarnessLayout
import com.harness.agent.coreui.primitives.AppTextStyle
import com.harness.agent.preview.PreviewAppPreferences
import com.harness.agent.preview.PreviewAuthProfile

private const val RESEND_SECONDS = 60

@Composable
fun PreviewLoginScreen(
    preferences: PreviewAppPreferences,
    onBack: () -> Unit,
    onLoggedIn: () -> Unit,
) {
    val toast = LocalAppToast.current
    var phone by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var codeSent by remember { mutableStateOf(false) }
    var resendIn by remember { mutableIntStateOf(0) }

    val primaryLabel =
        when {
            !codeSent -> "发送验证码"
            code.trim().length >= 4 -> "登录"
            else -> "请输入验证码"
        }

    AppScaffold(topBar = { SettingsTopBar(title = "登录", onBack = onBack) }) {
        Column(modifier = Modifier.fillMaxSize()) {
            Column(
                modifier =
                    Modifier
                        .weight(1f)
                        .verticalScroll(rememberScrollState())
                        .padding(top = 8.dp),
                verticalArrangement = Arrangement.spacedBy(HarnessLayout.settingsGroupGap),
            ) {
                SettingsTextField(
                    value = phone,
                    onValueChange = { phone = it },
                    label = "手机号",
                    placeholder = "11 位手机号",
                )
                if (codeSent) {
                    SettingsTextField(
                        value = code,
                        onValueChange = { code = it },
                        label = "验证码",
                        placeholder = "6 位验证码",
                    )
                    AppText(
                        text = if (resendIn > 0) "${resendIn}s 后可重新发送" else "验证码已发送至 ${maskPhone(phone)}",
                        style = AppTextStyle.Caption,
                    )
                }
            }
            Column(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .padding(top = 12.dp, bottom = 8.dp),
            ) {
                SettingsPillButton(
                    text = primaryLabel,
                    enabled = phone.trim().length >= 6 && (!codeSent || code.trim().isNotEmpty()),
                    onClick = {
                        when {
                            phone.trim().length < 6 -> {
                                toast.show("请输入有效手机号")
                            }
                            !codeSent -> {
                                codeSent = true
                                resendIn = RESEND_SECONDS
                                toast.show("验证码已发送")
                            }
                            code.trim().length < 4 -> {
                                toast.show("请输入验证码")
                            }
                            else -> {
                                val trimmed = phone.trim()
                                preferences.updateAuthProfile(
                                    PreviewAuthProfile(
                                        displayName = maskPhone(trimmed),
                                        phone = trimmed,
                                    ),
                                )
                                toast.show("登录成功")
                                onLoggedIn()
                            }
                        }
                    },
                )
            }
        }
    }
}

private fun maskPhone(phone: String): String {
    val digits = phone.filter { it.isDigit() }
    if (digits.length < 7) return phone
    return "${digits.take(3)}****${digits.takeLast(4)}"
}

package com.harness.agent.ui.settings

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.outlined.PhoneIphone
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.lerp
import androidx.compose.ui.unit.sp
import com.harness.agent.R
import com.harness.agent.coreui.feedback.LocalAppToast
import androidx.compose.runtime.rememberCoroutineScope
import com.harness.agent.preview.PreviewAppPreferences
import com.harness.agent.preview.PreviewAuthProfile
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private const val RESEND_SECONDS = 60
private const val HERO_COMPACT_RATIO = 0.62f
private val ReferenceKeyboardHeight = 280.dp

private val LoginBackground = Color.White
private val LoginTitleColor = Color(0xFF000000)
private val LoginSubtitleColor = Color(0xFF999999)
private val LoginFieldBorder = Color(0xFFE5E5E5)
private val LoginPlaceholder = Color(0xFFBBBBBB)
private val LoginFieldText = Color(0xFF333333)
private val LoginButtonBlack = Color(0xFF1A1A1A)
private val LoginButtonDisabled = Color(0xFF1A1A1A).copy(alpha = 0.35f)
private val LoginIconMuted = Color(0xFFAAAAAA)

private val LoginFieldShape = RoundedCornerShape(14.dp)
private val LoginHorizontalPadding = 24.dp

@Composable
fun PreviewLoginScreen(
    preferences: PreviewAppPreferences,
    onBack: () -> Unit,
    onLoggedIn: () -> Unit,
    loginCoordinator: LoginCoordinator,
) {
    val toast = LocalAppToast.current
    val scope = rememberCoroutineScope()
    val density = LocalDensity.current
    val scrollState = rememberScrollState()

    var phone by rememberSaveable { mutableStateOf("") }
    var code by rememberSaveable { mutableStateOf("") }
    var codeSent by rememberSaveable { mutableStateOf(false) }
    var resendIn by rememberSaveable { mutableIntStateOf(0) }
    var submitting by remember { mutableStateOf(false) }
    var inlineError by rememberSaveable { mutableStateOf<String?>(null) }

    val imeBottomPx = WindowInsets.ime.getBottom(density)
    val imeBottomDp = with(density) { imeBottomPx.toDp() }
    val keyboardProgress =
        (imeBottomDp / ReferenceKeyboardHeight)
            .coerceIn(0f, 1f)

    val phoneReady = phone.trim().length >= 6
    val codeReady = !codeSent || code.trim().length >= 4
    val canSubmit = !submitting && phoneReady && codeReady
    val buttonLabel =
        when {
            submitting -> if (codeSent) "登录中…" else "发送中…"
            !codeSent -> "获取验证码"
            else -> "登录"
        }

    LaunchedEffect(resendIn) {
        if (resendIn > 0) {
            delay(1_000)
            resendIn -= 1
        }
    }

    BoxWithConstraints(
        modifier =
            Modifier
                .fillMaxSize()
                .background(LoginBackground)
                .imePadding(),
    ) {
        val viewportHeight = maxHeight
        val verticalInset = (viewportHeight * 0.06f).coerceIn(24.dp, 40.dp)
        val expandedHeroHeight = (viewportHeight * 0.34f).coerceIn(220.dp, 252.dp)
        val compactHeroHeight = (expandedHeroHeight * HERO_COMPACT_RATIO).coerceAtLeast(140.dp)

        val heroHeight = lerp(expandedHeroHeight, compactHeroHeight, keyboardProgress)
        val heroToTitleGap = lerp(24.dp, 12.dp, keyboardProgress)
        val formTopGap = lerp(32.dp, 20.dp, keyboardProgress)
        val contentVerticalInset = lerp(verticalInset, 12.dp, keyboardProgress)

        Column(
            modifier =
                Modifier
                    .fillMaxSize()
                    .verticalScroll(scrollState),
        ) {
            Row(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier =
                        Modifier
                            .size(44.dp)
                            .clip(RoundedCornerShape(22.dp))
                            .semantics {
                                role = Role.Button
                                contentDescription = "返回"
                            }
                            .clickable(onClick = onBack),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Rounded.ArrowBack,
                        contentDescription = "返回",
                        tint = LoginButtonBlack,
                        modifier = Modifier.size(22.dp),
                    )
                }
            }
            Column(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = viewportHeight)
                        .padding(horizontal = LoginHorizontalPadding)
                        .padding(top = contentVerticalInset, bottom = verticalInset),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                LoginHeroIllustration(
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .height(heroHeight),
                )
                Spacer(modifier = Modifier.height(heroToTitleGap))
                Text(
                    text = "良朋在侧，虚席以待",
                    color = LoginTitleColor,
                    fontSize = 28.sp,
                    fontWeight = FontWeight.Bold,
                    lineHeight = 34.sp,
                    textAlign = TextAlign.Center,
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "言未尽而可续，事未已而随形",
                    color = LoginSubtitleColor,
                    fontSize = 15.sp,
                    lineHeight = 22.sp,
                    textAlign = TextAlign.Center,
                )
                Spacer(modifier = Modifier.height(formTopGap))
                LoginPhoneField(
                    value = phone,
                    onValueChange = {
                        phone = it
                        inlineError = null
                    },
                    placeholder = "请输入手机号",
                    showPhoneIcon = true,
                )
                if (codeSent) {
                    Spacer(modifier = Modifier.height(12.dp))
                    LoginPhoneField(
                        value = code,
                        onValueChange = {
                            code = it
                            inlineError = null
                        },
                        placeholder = "请输入验证码",
                        showPhoneIcon = false,
                        keyboardType = KeyboardType.Number,
                    )
                    if (resendIn > 0) {
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = "${resendIn}s 后可重新获取",
                            color = LoginSubtitleColor,
                            fontSize = 12.sp,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
                inlineError?.let { message ->
                    Spacer(modifier = Modifier.height(10.dp))
                    Text(
                        text = message,
                        color = Color(0xFFC0392B),
                        fontSize = 13.sp,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                Spacer(modifier = Modifier.height(16.dp))
                LoginPrimaryButton(
                    text = buttonLabel,
                    enabled = canSubmit,
                    loading = submitting,
                    onClick = {
                        when {
                            phone.trim().length < 6 -> inlineError = "请输入有效手机号"
                            !codeSent -> {
                                scope.launch {
                                    submitting = true
                                    inlineError = null
                                    loginCoordinator.sendVerificationCode(phone.trim()).fold(
                                        onSuccess = {
                                            codeSent = true
                                            resendIn = RESEND_SECONDS
                                            toast.show("验证码已发送")
                                        },
                                        onFailure = { error ->
                                            val message = error.toLoginMessage("验证码发送失败，请稍后重试")
                                            inlineError = message
                                            toast.show(message)
                                        },
                                    )
                                    submitting = false
                                }
                            }
                            code.trim().length < 4 -> inlineError = "请输入验证码"
                            else -> {
                                scope.launch {
                                    submitting = true
                                    inlineError = null
                                    loginCoordinator.verifyAndLogin(phone.trim(), code.trim()).fold(
                                        onSuccess = { profile ->
                                            preferences.updateAuthProfile(profile)
                                            // Token is now persisted; update the shared login-state tick.
                                            preferences.refreshSessionTokenPresence()
                                            toast.show("登录成功")
                                            onLoggedIn()
                                        },
                                        onFailure = { error ->
                                            val message = error.toLoginMessage("登录失败，请检查验证码后重试")
                                            inlineError = message
                                            toast.show(message)
                                        },
                                    )
                                    submitting = false
                                }
                            }
                        }
                    },
                )
            }
        }
    }
}

@Composable
private fun LoginHeroIllustration(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier,
        contentAlignment = Alignment.Center,
    ) {
        Image(
            painter = painterResource(id = R.drawable.login_hero_illustration),
            contentDescription = null,
            modifier = Modifier.fillMaxWidth(0.95f),
            contentScale = ContentScale.Fit,
        )
    }
}

@Composable
private fun LoginPhoneField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    showPhoneIcon: Boolean,
    keyboardType: KeyboardType = KeyboardType.Phone,
) {
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .height(52.dp)
                .clip(LoginFieldShape)
                .border(width = 1.dp, color = LoginFieldBorder, shape = LoginFieldShape)
                .background(Color.White)
                .padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (showPhoneIcon) {
            Icon(
                imageVector = Icons.Outlined.PhoneIphone,
                contentDescription = null,
                tint = LoginIconMuted,
                modifier = Modifier.size(20.dp),
            )
            Spacer(modifier = Modifier.size(10.dp))
        }
        Box(modifier = Modifier.weight(1f)) {
            if (value.isEmpty()) {
                Text(
                    text = placeholder,
                    color = LoginPlaceholder,
                    fontSize = 16.sp,
                )
            }
            BasicTextField(
                value = value,
                onValueChange = onValueChange,
                singleLine = true,
                textStyle = TextStyle(color = LoginFieldText, fontSize = 16.sp),
                keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
                cursorBrush = SolidColor(LoginButtonBlack),
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

@Composable
private fun LoginPrimaryButton(
    text: String,
    enabled: Boolean,
    onClick: () -> Unit,
    loading: Boolean = false,
) {
    Box(
        modifier =
            Modifier
                .fillMaxWidth()
                .height(52.dp)
                .clip(LoginFieldShape)
                .background(if (enabled || loading) LoginButtonBlack else LoginButtonDisabled)
                .semantics { role = Role.Button }
                .clickable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (loading) {
                CircularProgressIndicator(
                    modifier = Modifier.size(16.dp),
                    color = Color.White,
                    strokeWidth = 2.dp,
                )
            }
            Text(
                text = text,
                color = Color.White,
                fontSize = 16.sp,
                fontWeight = FontWeight.Medium,
            )
        }
    }
}

private fun Throwable.toLoginMessage(fallback: String): String {
    val problem = this as? com.harness.mobile.core.api.ApiProblem
    return problem?.problem?.detail?.takeIf { it.isNotBlank() }
        ?: problem?.problem?.title?.takeIf { it.isNotBlank() }
        ?: message?.takeIf { it.isNotBlank() }
        ?: fallback
}

private fun maskPhone(phone: String): String {
    val digits = phone.filter { it.isDigit() }
    if (digits.length < 7) return phone
    return "${digits.take(3)}****${digits.takeLast(4)}"
}

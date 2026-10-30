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
import androidx.compose.material.icons.outlined.PhoneIphone
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.lerp
import androidx.compose.ui.unit.sp
import com.harness.agent.R
import com.harness.agent.coreui.feedback.LocalAppToast
import com.harness.agent.preview.PreviewAppPreferences
import com.harness.agent.preview.PreviewAuthProfile

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
) {
    val toast = LocalAppToast.current
    val density = LocalDensity.current
    val scrollState = rememberScrollState()

    var phone by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var codeSent by remember { mutableStateOf(false) }
    var resendIn by remember { mutableIntStateOf(0) }

    val imeBottomPx = WindowInsets.ime.getBottom(density)
    val imeBottomDp = with(density) { imeBottomPx.toDp() }
    val keyboardProgress =
        (imeBottomDp / ReferenceKeyboardHeight)
            .coerceIn(0f, 1f)

    val phoneReady = phone.trim().length >= 6
    val codeReady = !codeSent || code.trim().length >= 4
    val canSubmit = phoneReady && codeReady
    val buttonLabel = if (!codeSent) "Get Verification Code" else "Log in"

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
                    text = "Your AI Assistant\nIs Here",
                    color = LoginTitleColor,
                    fontSize = 28.sp,
                    fontWeight = FontWeight.Bold,
                    lineHeight = 34.sp,
                    textAlign = TextAlign.Center,
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "Always ready to help",
                    color = LoginSubtitleColor,
                    fontSize = 15.sp,
                    lineHeight = 22.sp,
                    textAlign = TextAlign.Center,
                )
                Spacer(modifier = Modifier.height(formTopGap))
                LoginPhoneField(
                    value = phone,
                    onValueChange = { phone = it },
                    placeholder = "Enter your phone number",
                    showPhoneIcon = true,
                )
                if (codeSent) {
                    Spacer(modifier = Modifier.height(12.dp))
                    LoginPhoneField(
                        value = code,
                        onValueChange = { code = it },
                        placeholder = "Enter verification code",
                        showPhoneIcon = false,
                        keyboardType = KeyboardType.Number,
                    )
                    if (resendIn > 0) {
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = "Resend in ${resendIn}s",
                            color = LoginSubtitleColor,
                            fontSize = 12.sp,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
                Spacer(modifier = Modifier.height(16.dp))
                LoginPrimaryButton(
                    text = buttonLabel,
                    enabled = canSubmit,
                    onClick = {
                        when {
                            phone.trim().length < 6 -> toast.show("Please enter a valid phone number")
                            !codeSent -> {
                                codeSent = true
                                resendIn = RESEND_SECONDS
                                toast.show("Verification code sent")
                            }
                            code.trim().length < 4 -> toast.show("Please enter the verification code")
                            else -> {
                                val trimmed = phone.trim()
                                preferences.updateAuthProfile(
                                    PreviewAuthProfile(
                                        displayName = maskPhone(trimmed),
                                        phone = trimmed,
                                    ),
                                )
                                toast.show("Logged in")
                                onLoggedIn()
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
) {
    Box(
        modifier =
            Modifier
                .fillMaxWidth()
                .height(52.dp)
                .clip(LoginFieldShape)
                .background(if (enabled) LoginButtonBlack else LoginButtonDisabled)
                .clickable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = text,
            color = Color.White,
            fontSize = 16.sp,
            fontWeight = FontWeight.Medium,
        )
    }
}

private fun maskPhone(phone: String): String {
    val digits = phone.filter { it.isDigit() }
    if (digits.length < 7) return phone
    return "${digits.take(3)}****${digits.takeLast(4)}"
}

package com.harness.agent.ui.reader

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.Image
import androidx.compose.foundation.shape.RoundedCornerShape
import com.harness.agent.coreui.markdown.ChatMarkdown
import com.harness.agent.coreui.feedback.LocalAppToast
import com.harness.agent.coreui.primitives.AppButton
import com.harness.agent.coreui.primitives.AppScaffold
import com.harness.agent.coreui.primitives.AppText
import com.harness.agent.coreui.primitives.AppTextStyle
import com.harness.agent.coreui.tokens.HarnessLayout
import com.harness.agent.coreui.tokens.LocalHarnessColors
import com.harness.agent.model.ArtifactDownloadPayload
import com.harness.agent.model.ArtifactPreviewPayload
import com.harness.agent.model.ReaderTarget
import com.harness.agent.media.resolveArtifactPreviewUrl
import com.harness.agent.media.resolveAgentFilePreviewUrl
import com.harness.agent.preview.PreviewAppPreferences
import com.harness.mobile.core.api.ArtifactPreviewCapability
import com.harness.mobile.core.api.ArtifactPreviewMode
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.ui.viewinterop.AndroidView
import com.harness.agent.ui.settings.SettingsTopBar
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

sealed interface ReaderContentState {
    data object Loading : ReaderContentState
    data object Empty : ReaderContentState
    data class Error(val message: String) : ReaderContentState
    data class Text(val markdown: String) : ReaderContentState
    data class Image(val bytes: ByteArray, val contentType: String) : ReaderContentState
    data class Unsupported(val reason: String) : ReaderContentState
    data class AuthenticatedUrl(val url: String) : ReaderContentState
}

/** Workbench 文件 / 报告全屏阅读：canvas 底、无内容卡片，顶栏与设置页一致（左上返回）。 */
@Composable
fun PreviewReportReaderScreen(
    preferences: PreviewAppPreferences,
    onBack: () -> Unit,
    loadPreview: (suspend (ReaderTarget) -> Result<ArtifactPreviewPayload>)? = null,
    loadDownload: (suspend (ReaderTarget) -> Result<ArtifactDownloadPayload>)? = null,
) {
    val context = LocalContext.current
    val toast = LocalAppToast.current
    val scope = rememberCoroutineScope()
    val target = preferences.readerTarget
    var state by remember(target) {
        mutableStateOf<ReaderContentState>(
            if (target == null) {
                preferences.readerMarkdown
                    .takeIf { it.isNotBlank() }
                    ?.let(ReaderContentState::Text)
                    ?: ReaderContentState.Empty
            } else {
                ReaderContentState.Loading
            },
        )
    }

    LaunchedEffect(target, preferences.apiBaseUrl) {
        val artifactTarget = target ?: return@LaunchedEffect
        when (
            ArtifactPreviewCapability.resolve(
                artifactTarget.fileKind,
                artifactTarget.mediaType,
                artifactTarget.fileName,
            )
        ) {
            ArtifactPreviewMode.RemoteAuthenticatedUrl -> {
                val url =
                    artifactTarget.artifactId?.let { resolveArtifactPreviewUrl(preferences.apiBaseUrl, it) }
                        ?: artifactTarget.fileId?.let { resolveAgentFilePreviewUrl(preferences.apiBaseUrl, it) }
                state =
                    if (url.isNullOrBlank()) {
                        ReaderContentState.Unsupported("无法构造预览地址，请下载后查看。")
                    } else {
                        ReaderContentState.AuthenticatedUrl(url)
                    }
                return@LaunchedEffect
            }
            else -> Unit
        }
        if (loadPreview == null) {
            state = ReaderContentState.Error("当前构建未连接预览服务")
            return@LaunchedEffect
        }
        val result = loadPreview(artifactTarget)
        state =
            result.fold(
                onSuccess = { content -> content.toReaderState(artifactTarget) },
                onFailure = { failure -> ReaderContentState.Error(failure.readerMessage()) },
            )
    }

    fun downloadAndOpen() {
        val artifactTarget = target ?: return
        if (loadDownload == null) return
        scope.launch {
            loadDownload(artifactTarget)
                .onSuccess { download ->
                    if (!shareBytes(context, download.fileName, download.contentType, download.bytes)) {
                        toast.show("未找到可打开该文件的应用，请安装后再试。")
                    }
                }
                .onFailure { state = ReaderContentState.Error(it.readerMessage()) }
        }
    }

    AppScaffold(
        topBar = {
            SettingsTopBar(title = preferences.readerTitle, onBack = onBack)
        },
    ) {
        Box(Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
            when (val current = state) {
                ReaderContentState.Loading ->
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                ReaderContentState.Empty ->
                    ReaderStatePanel(title = "内容为空", detail = "该文件暂无可用内容。")
                is ReaderContentState.Error ->
                    ReaderStatePanel(
                        title = "无法预览",
                        detail = current.message,
                        actionLabel = if (target != null && loadDownload != null) "下载文件" else null,
                        onAction = ::downloadAndOpen,
                    )
                is ReaderContentState.Unsupported ->
                    ReaderStatePanel(
                        title = "暂不支持内联预览",
                        detail = current.reason,
                        actionLabel = if (target != null && loadDownload != null) "下载并打开" else null,
                        onAction = ::downloadAndOpen,
                    )
                is ReaderContentState.Text ->
                    Column(
                        modifier =
                            Modifier
                                .fillMaxSize()
                                .verticalScroll(rememberScrollState())
                                .padding(top = 8.dp, bottom = 16.dp),
                    ) {
                        ChatMarkdown(markdown = current.markdown, modifier = Modifier.fillMaxWidth())
                    }
                is ReaderContentState.Image ->
                    ZoomableImageState(bytes = current.bytes, modifier = Modifier.fillMaxSize().padding(vertical = 12.dp))
                is ReaderContentState.AuthenticatedUrl ->
                    AuthenticatedHtmlWebView(
                        url = current.url,
                        cookieHeader = preferences.sessionCookieHeaderProvider(),
                        modifier = Modifier.fillMaxSize().padding(vertical = 8.dp),
                    )
            }
        }
    }
}

@Composable
private fun AuthenticatedHtmlWebView(
    url: String,
    cookieHeader: String?,
    modifier: Modifier = Modifier,
) {
    val canvasColor = LocalHarnessColors.current.canvas
    AndroidView(
        modifier = modifier,
        factory = { context ->
            WebView(context).apply {
                setBackgroundColor(canvasColor.toArgb())
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = false
                settings.allowFileAccess = false
                settings.allowContentAccess = false
                settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
                settings.setSupportMultipleWindows(false)
                webViewClient =
                    object : WebViewClient() {
                        override fun shouldOverrideUrlLoading(
                            view: WebView?,
                            request: android.webkit.WebResourceRequest?,
                        ): Boolean {
                            val target = request?.url ?: return true
                            return target.host != Uri.parse(url).host || target.scheme != "https"
                        }
                    }
            }
        },
        update = { webView ->
            webView.setBackgroundColor(canvasColor.toArgb())
            val headers =
                cookieHeader?.trim()?.takeIf { it.isNotEmpty() }?.let { mapOf("Cookie" to it) }
            if (headers != null) {
                webView.loadUrl(url, headers)
            } else {
                webView.loadUrl(url)
            }
        },
    )
}

internal fun ArtifactPreviewPayload.toReaderState(target: ReaderTarget): ReaderContentState {
    val resolvedType = contentType.ifBlank { target.mediaType }
    val resolvedKind = target.fileKind.lowercase()
    if (bytes.isEmpty()) return ReaderContentState.Empty
    return when (ArtifactPreviewCapability.resolve(resolvedKind, resolvedType, target.fileName)) {
        ArtifactPreviewMode.InlineImage -> ReaderContentState.Image(bytes, resolvedType)
        ArtifactPreviewMode.InlineText -> ReaderContentState.Text(bytes.decodeToString())
        ArtifactPreviewMode.ExternalOpen,
        ArtifactPreviewMode.DownloadOnly,
        ->
            ReaderContentState.Unsupported("${target.fileKind.ifBlank { resolvedType }} 需下载后用系统应用打开。")
        ArtifactPreviewMode.RemoteAuthenticatedUrl ->
            ReaderContentState.Unsupported("HTML 预览需在联网环境下打开。")
    }
}

internal fun Throwable.readerMessage(): String {
    val raw = message?.trim().orEmpty()
    return when {
        raw.isEmpty() -> "请求失败，请检查网络后重试。"
        raw.contains("401") || raw.contains("AUTH_REQUIRED", ignoreCase = true) -> "登录已失效，请重新登录。"
        raw.contains("404") || raw.contains("NOT_FOUND", ignoreCase = true) ||
            raw.contains("ARTIFACT_DELETED", ignoreCase = true) -> "文件不存在或已被删除。"
        raw.contains("connect", ignoreCase = true) || raw.contains("timeout", ignoreCase = true) -> "网络连接失败，请重试。"
        else -> raw
    }
}

@Composable
private fun ReaderStatePanel(
    title: String,
    detail: String,
    actionLabel: String? = null,
    onAction: () -> Unit = {},
) {
    val colors = LocalHarnessColors.current
    Column(
        modifier = Modifier.fillMaxSize().padding(top = 48.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        AppText(text = title, style = AppTextStyle.Title)
        AppText(text = detail, style = AppTextStyle.Muted)
        if (actionLabel != null) {
            AppButton(text = actionLabel, onClick = onAction, modifier = Modifier.padding(top = 8.dp))
        }
        Box(Modifier.size(1.dp).background(colors.canvas))
    }
}

@Composable
private fun ZoomableImageState(
    bytes: ByteArray,
    modifier: Modifier = Modifier,
) {
    var bitmap by remember(bytes) { mutableStateOf<ImageBitmap?>(null) }
    var decodeFailed by remember(bytes) { mutableStateOf(false) }
    LaunchedEffect(bytes) {
        decodeFailed = false
        bitmap =
            withContext(Dispatchers.Default) {
                runCatching { android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap() }
                    .getOrNull()
            }
        if (bitmap == null) decodeFailed = true
    }
    var scale by remember(bytes) { mutableFloatStateOf(1f) }
    var offset by remember(bytes) { mutableStateOf(Offset.Zero) }
    val ready = bitmap
    if (ready == null) {
        if (decodeFailed) {
            ReaderStatePanel(title = "无法显示图片", detail = "图片数据不完整。")
        } else {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        }
        return
    }
    Box(modifier = modifier.clipToBounds(), contentAlignment = Alignment.Center) {
        Image(
            bitmap = ready,
            contentDescription = "图片预览",
            contentScale = ContentScale.Fit,
            modifier =
                Modifier
                    .fillMaxSize()
                    .graphicsLayer {
                        scaleX = scale
                        scaleY = scale
                        translationX = offset.x
                        translationY = offset.y
                    }
                    .pointerInput(bytes) {
                        detectTransformGestures { _, pan, zoom, _ ->
                            scale = (scale * zoom).coerceIn(1f, 5f)
                            offset = if (scale <= 1f) Offset.Zero else offset + pan
                        }
                    }
                    .pointerInput(bytes) {
                        detectTapGestures(
                            onDoubleTap = {
                                scale = 1f
                                offset = Offset.Zero
                            },
                        )
                    },
        )
    }
}

private fun shareBytes(
    context: Context,
    fileName: String,
    contentType: String,
    bytes: ByteArray,
): Boolean {
    if (bytes.isEmpty()) return false
    val safeName = fileName.ifBlank { "artifact" }
    val dir = File(context.cacheDir, "reader").apply { mkdirs() }
    val file = File(dir, safeName.replace('/', '_'))
    file.writeBytes(bytes)
    val uri: Uri =
        FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            file,
        )
    val intent =
        Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, contentType.ifBlank { "*/*" })
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
    return runCatching { context.startActivity(intent) }.isSuccess
}

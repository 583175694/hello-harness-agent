package com.harness.agent.media

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import coil.compose.AsyncImage
import coil.request.ImageRequest

data class HarnessImageAuth(
    val apiBaseUrl: () -> String = { "" },
    val sessionCookieHeader: () -> String? = { null },
)

val LocalHarnessImageAuth =
    compositionLocalOf { HarnessImageAuth() }

@Composable
fun ProvideHarnessImageAuth(
    auth: HarnessImageAuth,
    content: @Composable () -> Unit,
) {
    CompositionLocalProvider(LocalHarnessImageAuth provides auth) {
        content()
    }
}

fun buildHarnessImageRequest(
    context: Context,
    auth: HarnessImageAuth,
    fileId: String,
    serverPreviewUrl: String?,
    localPreviewUri: String?,
): ImageRequest? {
    val uri =
        resolveAttachmentPreviewUri(
            apiBaseUrl = auth.apiBaseUrl(),
            fileId = fileId,
            serverPreviewUrl = serverPreviewUrl,
            localPreviewUri = localPreviewUri,
        ) ?: return null
    val builder =
        ImageRequest.Builder(context)
            .data(uri)
            .crossfade(true)
    if (needsSessionCookieForPreview(uri)) {
        auth.sessionCookieHeader()?.trim()?.takeIf { it.isNotEmpty() }?.let { cookie ->
            builder.addHeader("Cookie", cookie)
        }
    }
    return builder.build()
}

@Composable
fun HarnessAuthedAsyncImage(
    fileId: String,
    serverPreviewUrl: String?,
    localPreviewUri: String?,
    contentDescription: String?,
    modifier: Modifier = Modifier,
    contentScale: ContentScale = ContentScale.Crop,
) {
    val context = LocalContext.current
    val auth = LocalHarnessImageAuth.current
    val model =
        remember(fileId, serverPreviewUrl, localPreviewUri, auth) {
            buildHarnessImageRequest(
                context = context,
                auth = auth,
                fileId = fileId,
                serverPreviewUrl = serverPreviewUrl,
                localPreviewUri = localPreviewUri,
            )
        }
    if (model == null) return
    AsyncImage(
        model = model,
        contentDescription = contentDescription,
        modifier = modifier,
        contentScale = contentScale,
    )
}

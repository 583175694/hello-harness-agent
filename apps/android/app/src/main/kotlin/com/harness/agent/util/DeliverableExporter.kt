package com.harness.agent.util

import android.content.Context
import android.content.Intent
import androidx.core.content.FileProvider
import java.io.File

object DeliverableExporter {
    fun shareBytes(
        context: Context,
        bytes: ByteArray,
        fileName: String,
        contentType: String,
    ): Result<Unit> =
        runCatching {
            val safeName = fileName.ifBlank { "download" }.replace('/', '_')
            val cacheDir = File(context.cacheDir, "exports").apply { mkdirs() }
            val out = File(cacheDir, safeName)
            out.writeBytes(bytes)
            val uri =
                FileProvider.getUriForFile(
                    context,
                    "${context.packageName}.fileprovider",
                    out,
                )
            val intent =
                Intent(Intent.ACTION_SEND).apply {
                    type = contentType.ifBlank { "application/octet-stream" }
                    putExtra(Intent.EXTRA_STREAM, uri)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
            val chooser = Intent.createChooser(intent, "保存或分享")
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(chooser)
        }
}

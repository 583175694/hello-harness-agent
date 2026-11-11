package com.harness.mobile.core.auth

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

actual class PlatformSessionTokenStore actual constructor(platformContext: Any) {
    private val appContext: Context =
        (platformContext as Context).applicationContext
    private val prefs =
        appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    actual fun getToken(): String? = readToken()

    actual fun setToken(token: String?) {
        val normalized = token?.trim()?.ifEmpty { null }
        if (normalized == null) {
            prefs.edit().remove(KEY_TOKEN).remove(KEY_IV).apply()
        } else {
            val encrypted = encrypt(normalized)
            prefs.edit()
                .putString(KEY_TOKEN, encrypted.ciphertext)
                .putString(KEY_IV, encrypted.iv)
                .apply()
        }
    }

    actual fun clearToken() {
        prefs.edit().remove(KEY_TOKEN).remove(KEY_IV).apply()
    }

    private fun readToken(): String? {
        val ciphertext = prefs.getString(KEY_TOKEN, null)?.takeIf { it.isNotBlank() } ?: return null
        val iv = prefs.getString(KEY_IV, null)?.takeIf { it.isNotBlank() }
        if (iv == null) {
            migratePlaintext(ciphertext)
            return null
        }
        return runCatching { decrypt(ciphertext, iv) }
            .onFailure {
                prefs.edit().remove(KEY_TOKEN).remove(KEY_IV).apply()
            }
            .getOrNull()
            ?.trim()
            ?.ifEmpty { null }
    }

    /** 旧版本直接把 token 写进 SharedPreferences；首次读取时迁移并删除明文。 */
    private fun migratePlaintext(legacyToken: String) {
        runCatching {
            setToken(legacyToken)
        }.onFailure {
            prefs.edit().remove(KEY_TOKEN).apply()
        }
    }

    private fun encrypt(value: String): EncryptedValue {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, secretKey())
        val ciphertext = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
        return EncryptedValue(
            ciphertext = Base64.encodeToString(ciphertext, Base64.NO_WRAP),
            iv = Base64.encodeToString(cipher.iv, Base64.NO_WRAP),
        )
    }

    private fun decrypt(ciphertext: String, iv: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(
            Cipher.DECRYPT_MODE,
            secretKey(),
            GCMParameterSpec(GCM_TAG_LENGTH_BITS, Base64.decode(iv, Base64.NO_WRAP)),
        )
        return cipher.doFinal(Base64.decode(ciphertext, Base64.NO_WRAP)).toString(Charsets.UTF_8)
    }

    private fun secretKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        val generator =
            KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build(),
        )
        return generator.generateKey()
    }

    private data class EncryptedValue(
        val ciphertext: String,
        val iv: String,
    )

    private companion object {
        const val ANDROID_KEYSTORE = "AndroidKeyStore"
        const val KEY_ALIAS = "harness_session_token_key_v1"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val GCM_TAG_LENGTH_BITS = 128
        const val PREFS_NAME = "harness_core_auth"
        const val KEY_TOKEN = "session_token_v1"
        const val KEY_IV = "session_token_v1_iv"
    }
}

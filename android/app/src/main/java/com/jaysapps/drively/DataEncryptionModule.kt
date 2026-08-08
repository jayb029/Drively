package com.jaysapps.drively

import android.util.Base64
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.security.GeneralSecurityException
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

class DataEncryptionModule(
  reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "DataEncryption"

  @ReactMethod
  fun derivePbkdf2Sha256(
    passcode: String,
    saltBase64: String,
    iterations: Double,
    promise: Promise
  ) {
    if (iterations < 1 || iterations > Int.MAX_VALUE) {
      promise.reject("INVALID_ITERATIONS", "PBKDF2 iterations must be a positive integer")
      return
    }

    val spec = try {
      PBEKeySpec(
        passcode.toCharArray(),
        Base64.decode(saltBase64, Base64.NO_WRAP),
        iterations.toInt(),
        256
      )
    } catch (error: IllegalArgumentException) {
      promise.reject("INVALID_SALT", "PBKDF2 salt is not valid base64", error)
      return
    }

    try {
      val key = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
        .generateSecret(spec)
        .encoded
      promise.resolve(Base64.encodeToString(key, Base64.NO_WRAP))
      key.fill(0)
    } catch (error: GeneralSecurityException) {
      promise.reject("PBKDF2_FAILED", "Android could not derive the encryption key", error)
    } finally {
      spec.clearPassword()
    }
  }
}

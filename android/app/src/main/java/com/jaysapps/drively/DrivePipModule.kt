package com.jaysapps.drively

import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap

class DrivePipModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "DrivePip"

  @ReactMethod
  fun isPictureInPictureSupported(promise: Promise) {
    promise.resolve(Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
  }

  @ReactMethod
  fun setTrackingActive(active: Boolean) {
    currentMainActivity()?.setDriveTrackingActive(active)
  }

  @ReactMethod
  fun updateStats(stats: ReadableMap) {
    val title = if (stats.hasKey("title")) stats.getString("title") else null
    val subtitle = if (stats.hasKey("subtitle")) stats.getString("subtitle") else null
    currentMainActivity()?.updateDrivePipStats(
      DrivePipStats(
        title = title ?: "Drively",
        subtitle = subtitle ?: "Drive tracking active",
      )
    )
  }

  @ReactMethod
  fun enterPictureInPicture(promise: Promise) {
    val didEnter = currentMainActivity()?.enterDrivePictureInPicture() ?: false
    promise.resolve(didEnter)
  }

  @ReactMethod
  fun isInPictureInPictureMode(promise: Promise) {
    val activity = currentMainActivity()
    val isInPip = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
      activity?.isInPictureInPictureMode == true
    promise.resolve(isInPip)
  }

  @ReactMethod
  fun addListener(eventName: String) {
    // Required by React Native's NativeEventEmitter.
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    // Required by React Native's NativeEventEmitter.
  }

  private fun currentMainActivity(): MainActivity? {
    return reactContext.currentActivity as? MainActivity
  }
}

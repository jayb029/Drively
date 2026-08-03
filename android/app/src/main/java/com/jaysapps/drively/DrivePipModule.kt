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
    val activity = currentMainActivity() ?: return
    activity.runOnUiThread {
      activity.setDriveTrackingActive(active)
    }
  }

  @ReactMethod
  fun updateStats(stats: ReadableMap) {
    val title = if (stats.hasKey("title")) stats.getString("title") else null
    val subtitle = if (stats.hasKey("subtitle")) stats.getString("subtitle") else null
    val startTimestampMs = if (stats.hasKey("startTimestamp")) stats.getDouble("startTimestamp").toLong() else 0L
    val distanceText = if (stats.hasKey("distanceText")) stats.getString("distanceText") else null
    val speedText = if (stats.hasKey("speedText")) stats.getString("speedText") else null
    val activity = currentMainActivity() ?: return
    activity.runOnUiThread {
      activity.updateDrivePipStats(
        DrivePipStats(
          title = title ?: "Drively",
          subtitle = subtitle ?: "Drive tracking active",
          startTimestampMs = startTimestampMs,
          distanceText = distanceText ?: "--",
          speedText = speedText ?: "--",
        )
      )
    }
  }

  @ReactMethod
  fun enterPictureInPicture(promise: Promise) {
    val activity = currentMainActivity()
    if (activity == null) {
      promise.resolve(false)
      return
    }

    activity.runOnUiThread {
      promise.resolve(activity.enterDrivePictureInPicture())
    }
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

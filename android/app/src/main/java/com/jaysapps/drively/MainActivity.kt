package com.jaysapps.drively

import android.app.PictureInPictureParams
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.Typeface
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.util.Rational
import android.view.Gravity
import android.view.View
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView

import com.facebook.react.bridge.Arguments
import com.facebook.react.ReactApplication
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.bridge.ReactContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import androidx.appcompat.app.AppCompatDelegate
import expo.modules.ReactActivityDelegateWrapper
import java.util.Locale

class MainActivity : ReactActivity() {
  companion object {
    private const val TAG = "DrivePip"
  }

  private var driveTrackingActive = false
  private var latestDriveStats: DrivePipStats = DrivePipStats()
  private val pipUiHandler = Handler(Looper.getMainLooper())
  private var pipOverlay: LinearLayout? = null
  private var pipElapsedText: TextView? = null
  private var pipDistanceText: TextView? = null
  private var pipSpeedText: TextView? = null
  private val pipTicker = object : Runnable {
    override fun run() {
      updatePipOverlayText()
      if (pipOverlay?.visibility == View.VISIBLE) {
        pipUiHandler.postDelayed(this, 1000)
      }
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM)

    // Set the theme to AppTheme BEFORE onCreate to support
    // coloring the background, status bar, and navigation bar.
    // This is required for expo-splash-screen.
    setTheme(R.style.AppTheme);
    super.onCreate(null)
    installPipOverlay()
  }

  fun setDriveTrackingActive(active: Boolean) {
    driveTrackingActive = active
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      // Always refresh the params so Android 12+ does not retain auto-enter
      // after the drive has ended.
      updatePictureInPictureParams()
      if (!active) {
        setPipOverlayVisible(false)
        if (isInPictureInPictureMode) {
          moveTaskToBack(false)
        }
      }
    }
  }

  fun updateDrivePipStats(stats: DrivePipStats) {
    latestDriveStats = stats
    updatePipOverlayText()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && (driveTrackingActive || isInPictureInPictureMode)) {
      updatePictureInPictureParams()
    }
  }

  fun enterDrivePictureInPicture(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || !driveTrackingActive || isInPictureInPictureMode) {
      return false
    }

    // Put the compact native UI in place before Android snapshots the activity
    // for the PiP transition. Waiting for the mode-changed callback causes the
    // first PiP frame to contain the full React Native screen.
    setPipOverlayVisible(true)
    return try {
      val didEnter = enterPictureInPictureMode(buildPictureInPictureParams())
      if (!didEnter) {
        setPipOverlayVisible(false)
      }
      didEnter
    } catch (error: IllegalStateException) {
      setPipOverlayVisible(false)
      Log.w(TAG, "Unable to enter Picture-in-Picture.", error)
      false
    }
  }

  override fun onUserLeaveHint() {
    if (driveTrackingActive) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        // Android 12+ performs the gesture transition using auto-enter. The
        // overlay still needs to be visible before that transition begins.
        setPipOverlayVisible(true)
      } else {
        enterDrivePictureInPicture()
      }
    }
    super.onUserLeaveHint()
  }

  override fun onResume() {
    super.onResume()
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || !isInPictureInPictureMode) {
      setPipOverlayVisible(false)
    }
  }

  override fun onPictureInPictureModeChanged(isInPictureInPictureMode: Boolean, newConfig: Configuration) {
    super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
    setPipOverlayVisible(isInPictureInPictureMode && driveTrackingActive)

    val params = Arguments.createMap().apply {
      putBoolean("isInPictureInPictureMode", isInPictureInPictureMode)
    }

    currentReactContext()
      ?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      ?.emit("DrivePipModeChanged", params)
  }

  private fun currentReactContext(): ReactContext? {
    return try {
      (application as? ReactApplication)?.reactHost?.currentReactContext
        ?: reactInstanceManager.currentReactContext
    } catch (error: IllegalStateException) {
      Log.w(TAG, "React context was unavailable during Picture-in-Picture mode change.", error)
      null
    }
  }

  private fun installPipOverlay() {
    val root = window.decorView.findViewById<FrameLayout>(android.R.id.content)
    val overlay = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setBackgroundColor(Color.rgb(21, 24, 21))
      gravity = Gravity.CENTER_VERTICAL
      setPadding(28, 14, 28, 14)
      visibility = View.GONE
    }

    val statusText = TextView(this).apply {
      text = "TRACKING"
      setTextColor(Color.rgb(233, 199, 159))
      textSize = 12f
      typeface = Typeface.DEFAULT_BOLD
      includeFontPadding = false
    }

    pipElapsedText = TextView(this).apply {
      setTextColor(Color.rgb(242, 243, 238))
      textSize = 38f
      typeface = Typeface.DEFAULT_BOLD
      includeFontPadding = false
    }

    val statsRow = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
    }

    pipDistanceText = createPipStatText()
    pipSpeedText = createPipStatText()
    statsRow.addView(pipDistanceText, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
    statsRow.addView(pipSpeedText, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))

    overlay.addView(statusText)
    overlay.addView(pipElapsedText, LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.MATCH_PARENT,
      LinearLayout.LayoutParams.WRAP_CONTENT
    ).apply {
      topMargin = 8
      bottomMargin = 8
    })
    overlay.addView(statsRow)

    root.addView(overlay, FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.MATCH_PARENT,
      FrameLayout.LayoutParams.MATCH_PARENT
    ))
    pipOverlay = overlay
    updatePipOverlayText()
  }

  private fun createPipStatText(): TextView {
    return TextView(this).apply {
      setTextColor(Color.rgb(242, 243, 238))
      textSize = 17f
      typeface = Typeface.DEFAULT_BOLD
      includeFontPadding = false
    }
  }

  private fun setPipOverlayVisible(visible: Boolean) {
    pipOverlay?.visibility = if (visible) View.VISIBLE else View.GONE
    pipUiHandler.removeCallbacks(pipTicker)
    if (visible) {
      updatePipOverlayText()
      pipUiHandler.postDelayed(pipTicker, 1000)
    }
  }

  private fun updatePipOverlayText() {
    pipElapsedText?.text = latestDriveStats.elapsedText()
    pipDistanceText?.text = "Distance\n${latestDriveStats.distanceText}"
    pipSpeedText?.text = "Speed\n${latestDriveStats.speedText}"
  }

  private fun buildPictureInPictureParams(): PictureInPictureParams {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      throw IllegalStateException("Picture-in-Picture requires Android Oreo or newer.")
    }

    val builder = PictureInPictureParams.Builder()
      .setAspectRatio(Rational(16, 9))

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      builder.setAutoEnterEnabled(driveTrackingActive)
      builder.setSeamlessResizeEnabled(false)
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      val title = latestDriveStats.title.ifBlank { "Drively" }
      val subtitle = latestDriveStats.subtitle.ifBlank { "Drive tracking active" }
      builder.setTitle(title)
      builder.setSubtitle(subtitle)
    }

    return builder.build()
  }

  private fun updatePictureInPictureParams() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

    try {
      setPictureInPictureParams(buildPictureInPictureParams())
    } catch (error: IllegalStateException) {
      Log.w(TAG, "Unable to update Picture-in-Picture params.", error)
    }
  }

  override fun onDestroy() {
    pipUiHandler.removeCallbacks(pipTicker)
    super.onDestroy()
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "main"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
          this,
          BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
          object : DefaultReactActivityDelegate(
              this,
              mainComponentName,
              fabricEnabled
          ){})
  }

  /**
    * Align the back button behavior with Android S
    * where moving root activities to background instead of finishing activities.
    * @see <a href="https://developer.android.com/reference/android/app/Activity#onBackPressed()">onBackPressed</a>
    */
  override fun invokeDefaultOnBackPressed() {
      if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
          if (!moveTaskToBack(false)) {
              // For non-root activities, use the default implementation to finish them.
              super.invokeDefaultOnBackPressed()
          }
          return
      }

      // Use the default back button implementation on Android S
      // because it's doing more than [Activity.moveTaskToBack] in fact.
      super.invokeDefaultOnBackPressed()
  }
}

data class DrivePipStats(
  val title: String = "Drively",
  val subtitle: String = "Drive tracking active",
  val startTimestampMs: Long = 0L,
  val distanceText: String = "--",
  val speedText: String = "--",
) {
  fun elapsedText(): String {
    return if (startTimestampMs > 0L) {
      val elapsedMs = System.currentTimeMillis() - startTimestampMs
      val totalSeconds = (elapsedMs / 1000).coerceAtLeast(0)
      val hours = totalSeconds / 3600
      val minutes = (totalSeconds % 3600) / 60
      val seconds = totalSeconds % 60
      String.format(Locale.US, "%d:%02d:%02d", hours, minutes, seconds)
    } else {
      title
    }
  }
}

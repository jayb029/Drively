package com.jaysapps.drively

import android.app.PictureInPictureParams
import android.os.Build
import android.os.Bundle
import android.util.Rational

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import androidx.appcompat.app.AppCompatDelegate
import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {
  private var driveTrackingActive = false
  private var latestDriveStats: DrivePipStats = DrivePipStats()

  override fun onCreate(savedInstanceState: Bundle?) {
    AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM)

    // Set the theme to AppTheme BEFORE onCreate to support
    // coloring the background, status bar, and navigation bar.
    // This is required for expo-splash-screen.
    setTheme(R.style.AppTheme);
    super.onCreate(null)
  }

  fun setDriveTrackingActive(active: Boolean) {
    driveTrackingActive = active
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !active && isInPictureInPictureMode) {
      moveTaskToBack(false)
    }
  }

  fun updateDrivePipStats(stats: DrivePipStats) {
    latestDriveStats = stats
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && isInPictureInPictureMode) {
      setPictureInPictureParams(buildPictureInPictureParams())
    }
  }

  fun enterDrivePictureInPicture(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || !driveTrackingActive) {
      return false
    }

    return enterPictureInPictureMode(buildPictureInPictureParams())
  }

  override fun onUserLeaveHint() {
    if (driveTrackingActive) {
      enterDrivePictureInPicture()
    }
    super.onUserLeaveHint()
  }

  private fun buildPictureInPictureParams(): PictureInPictureParams {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      throw IllegalStateException("Picture-in-Picture requires Android Oreo or newer.")
    }

    val builder = PictureInPictureParams.Builder()
      .setAspectRatio(Rational(16, 9))

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      builder.setAutoEnterEnabled(driveTrackingActive)
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      val title = latestDriveStats.title.ifBlank { "Drively" }
      val subtitle = latestDriveStats.subtitle.ifBlank { "Drive tracking active" }
      builder.setTitle(title)
      builder.setSubtitle(subtitle)
    }

    return builder.build()
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
)

package com.jaysapps.drively

import android.app.PictureInPictureParams
import android.content.Context
import android.content.res.Configuration
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.Rect
import android.graphics.Typeface
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.util.Rational
import android.view.SurfaceHolder
import android.view.SurfaceView
import android.widget.FrameLayout

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
    private const val DORMANT_PIP_SURFACE_ALPHA = 0.001f
  }

  private var driveTrackingActive = false
  private var latestDriveStats: DrivePipStats = DrivePipStats()
  private val pipUiHandler = Handler(Looper.getMainLooper())
  private var pipOverlay: DrivePipSurfaceView? = null
  private val pipTicker = object : Runnable {
    override fun run() {
      pipOverlay?.render(latestDriveStats)
      if (pipOverlay?.alpha == 1f) {
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
    // React Native may replace the activity content children after onCreate in
    // optimized builds. Install after that attachment work has been queued.
    window.decorView.post { installPipOverlay() }
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
        updatePictureInPictureParams()
      } else {
        enterDrivePictureInPicture()
      }
    }
    super.onUserLeaveHint()
  }

  override fun onPictureInPictureRequested(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R || !driveTrackingActive) {
      return super.onPictureInPictureRequested()
    }

    // This callback runs before Android captures the activity for the PiP
    // transition. Release builds can skip or delay onUserLeaveHint, so prepare
    // the native compact view here as well.
    setPipOverlayVisible(true)
    return enterDrivePictureInPicture()
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
    val existingOverlay = pipOverlay
    if (existingOverlay?.isAttachedToWindow == true && existingOverlay.parent === root) {
      return
    }

    (existingOverlay?.parent as? android.view.ViewGroup)?.removeView(existingOverlay)
    val overlay = DrivePipSurfaceView(this).apply {
      // Keep the SurfaceView alive and transparent before PiP so Android can
      // transition to an already-created live buffer instead of a JS snapshot.
      // Alpha 0 lets Android 17 prune the SurfaceView altogether, so there is
      // no live producer for PiP to composite until a bounds change. A tiny
      // non-zero alpha keeps the surface allocated without visibly affecting
      // the full-screen React UI.
      alpha = DORMANT_PIP_SURFACE_ALPHA
    }

    root.addView(overlay, FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.MATCH_PARENT,
      FrameLayout.LayoutParams.MATCH_PARENT
    ))
    pipOverlay = overlay
    overlay.render(latestDriveStats)
  }

  private fun setPipOverlayVisible(visible: Boolean) {
    if (visible && pipOverlay?.isAttachedToWindow != true) {
      installPipOverlay()
    }
    pipOverlay?.alpha = if (visible) 1f else DORMANT_PIP_SURFACE_ALPHA
    if (visible) {
      // React Native can attach or reorder its root after Activity.onCreate in
      // release builds. Keep the native live-stat overlay above that surface.
      pipOverlay?.bringToFront()
      pipOverlay?.elevation = 1000f
    }
    pipUiHandler.removeCallbacks(pipTicker)
    if (visible) {
      updatePipOverlayText()
      pipUiHandler.postDelayed(pipTicker, 1000)
    }
  }

  private fun updatePipOverlayText() {
    pipOverlay?.render(latestDriveStats)
  }

  private fun buildPictureInPictureParams(): PictureInPictureParams {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      throw IllegalStateException("Picture-in-Picture requires Android Oreo or newer.")
    }

    val builder = PictureInPictureParams.Builder()
      .setAspectRatio(Rational(16, 9))

    buildPipSourceRectHint()?.let(builder::setSourceRectHint)

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

  private fun buildPipSourceRectHint(): Rect? {
    val content = window.decorView
    if (!content.isLaidOut || content.width <= 0 || content.height <= 0) return null

    val location = IntArray(2)
    content.getLocationInWindow(location)
    val sourceWidth = content.width
    val sourceHeight = minOf(content.height, sourceWidth * 9 / 16)
    val sourceTop = location[1] + (content.height - sourceHeight) / 2

    return Rect(
      location[0],
      sourceTop,
      location[0] + sourceWidth,
      sourceTop + sourceHeight,
    )
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

private class DrivePipSurfaceView(context: Context) : SurfaceView(context), SurfaceHolder.Callback {
  private val backgroundColor = Color.rgb(21, 24, 21)
  private val foregroundColor = Color.rgb(242, 243, 238)
  private val accentColor = Color.rgb(233, 199, 159)
  private var latestStats = DrivePipStats()

  private val statusPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = accentColor
    typeface = Typeface.DEFAULT_BOLD
  }
  private val elapsedPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = foregroundColor
    typeface = Typeface.DEFAULT_BOLD
  }
  private val valuePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = foregroundColor
    typeface = Typeface.DEFAULT_BOLD
  }
  private val labelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    color = Color.rgb(180, 184, 176)
    typeface = Typeface.DEFAULT
  }

  init {
    holder.setFormat(PixelFormat.OPAQUE)
    holder.addCallback(this)
    setZOrderOnTop(true)
  }

  fun render(stats: DrivePipStats) {
    latestStats = stats
    if (!holder.surface.isValid) return

    var canvas: Canvas? = null
    try {
      canvas = holder.lockCanvas()
      canvas?.let(::drawStats)
    } catch (error: IllegalArgumentException) {
      Log.w("DrivePip", "PiP surface was unavailable while drawing.", error)
    } finally {
      if (canvas != null) {
        holder.unlockCanvasAndPost(canvas)
      }
    }
  }

  private fun drawStats(canvas: Canvas) {
    val width = canvas.width.toFloat()
    val height = canvas.height.toFloat()
    val left = width * 0.055f
    val secondColumn = width * 0.55f

    canvas.drawColor(backgroundColor)

    statusPaint.textSize = height * 0.09f
    elapsedPaint.textSize = height * 0.27f
    valuePaint.textSize = height * 0.13f
    labelPaint.textSize = height * 0.085f

    canvas.drawText("TRACKING", left, height * 0.18f, statusPaint)
    canvas.drawText(latestStats.elapsedText(), left, height * 0.53f, elapsedPaint)
    canvas.drawText(latestStats.distanceText, left, height * 0.79f, valuePaint)
    canvas.drawText("Distance", left, height * 0.92f, labelPaint)
    canvas.drawText(latestStats.speedText, secondColumn, height * 0.79f, valuePaint)
    canvas.drawText("Speed", secondColumn, height * 0.92f, labelPaint)
  }

  override fun surfaceCreated(holder: SurfaceHolder) {
    Log.d("DrivePip", "PiP surface created (${width}x${height}).")
    render(latestStats)
  }

  override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {
    Log.d("DrivePip", "PiP surface changed (${width}x${height}).")
    render(latestStats)
  }

  override fun surfaceDestroyed(holder: SurfaceHolder) {
    Log.d("DrivePip", "PiP surface destroyed.")
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

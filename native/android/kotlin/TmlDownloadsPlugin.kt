package __APP_ID__

import android.content.Intent
import androidx.core.content.ContextCompat
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Keeps chapter downloads alive while the screen is off or another app is in front.
 *
 * The downloading itself stays in the web app (src/features/downloads). This plugin only runs a foreground service
 * with a progress notification, so Android does not freeze the app's WebView in the middle of a download.
 * The web app calls start() when the queue begins, update() as it progresses, and stop() when it ends.
 */
@CapacitorPlugin(name = "TmlDownloads")
class TmlDownloadsPlugin : Plugin() {

    @PluginMethod
    fun start(call: PluginCall) = show(call)

    @PluginMethod
    fun update(call: PluginCall) = show(call)

    @PluginMethod
    fun stop(call: PluginCall) {
        try {
            context.stopService(Intent(context, DownloadKeepAliveService::class.java))
            call.resolve()
        } catch (e: Exception) {
            call.reject("Could not stop the download service.")
        }
    }

    private fun show(call: PluginCall) {
        val intent = Intent(context, DownloadKeepAliveService::class.java)
            .putExtra("title", call.getString("title") ?: "Downloading chapters")
            .putExtra("text", call.getString("text") ?: "")
            .putExtra("done", call.getInt("done") ?: 0)
            .putExtra("total", call.getInt("total") ?: 0)
        try {
            ContextCompat.startForegroundService(context, intent)
            call.resolve()
        } catch (e: Exception) {
            // Android refuses to start a foreground service from the background on some versions. Downloads still
            // run while the app is on screen, so this is reported and otherwise harmless.
            call.reject("Could not start the download service.")
        }
    }
}

package __APP_ID__

import android.Manifest
import android.os.Build
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.Constraints
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Lets the web app check for new chapters while it is closed.
 *
 * The web app (src/features/updates) stays in charge: it hands over the titles to watch and a schedule with configure(),
 * and collects what was found with pending() and ack(). The periodic job itself is UpdateCheckWorker.
 */
@CapacitorPlugin(
    name = "TmlUpdates",
    permissions = [Permission(strings = [Manifest.permission.POST_NOTIFICATIONS], alias = "notifications")]
)
class TmlUpdatesPlugin : Plugin() {

    @PluginMethod
    fun configure(call: PluginCall) {
        val prefs = UpdateStore.prefs(context)
        val enabled = call.getBoolean("enabled", false) ?: false
        val minutes = (call.getInt("intervalMinutes") ?: 60).coerceAtLeast(15)
        val titles = call.getArray("titles") ?: JSArray()
        prefs.edit()
            .putString("apiBase", call.getString("apiBase") ?: "")
            .putBoolean("adult", call.getBoolean("adult", false) ?: false)
            .putString("language", call.getString("language") ?: "en")
            .putString("titles", titles.toString())
            .apply()
        val manager = WorkManager.getInstance(context)
        if (enabled && titles.length() > 0) {
            val request = PeriodicWorkRequestBuilder<UpdateCheckWorker>(minutes.toLong(), TimeUnit.MINUTES)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
            manager.enqueueUniquePeriodicWork(UpdateStore.WORK_NAME, ExistingPeriodicWorkPolicy.UPDATE, request)
        } else {
            manager.cancelUniqueWork(UpdateStore.WORK_NAME)
        }
        val result = JSObject()
        result.put("scheduled", enabled && titles.length() > 0)
        call.resolve(result)
    }

    /** Chapters found while the app was closed, plus the starting points the checker moved forward. */
    @PluginMethod
    fun pending(call: PluginCall) {
        val prefs = UpdateStore.prefs(context)
        val items = try { JSONArray(prefs.getString("pending", "[]")) } catch (e: Exception) { JSONArray() }
        val watchMap = try { JSONObject(prefs.getString("watch", "{}")) } catch (e: Exception) { JSONObject() }
        val watch = JSONArray()
        val keys = watchMap.keys()
        while (keys.hasNext()) {
            val state = watchMap.optJSONObject(keys.next())
            if (state != null) watch.put(state)
        }
        val result = JSObject()
        result.put("items", items)
        result.put("watch", watch)
        call.resolve(result)
    }

    /** The web app has stored these: forget them here. */
    @PluginMethod
    fun ack(call: PluginCall) {
        val prefs = UpdateStore.prefs(context)
        val ids = HashSet<String>()
        val idArray = call.getArray("ids")
        if (idArray != null) for (i in 0 until idArray.length()) ids.add(idArray.optString(i))
        val watchIds = HashSet<String>()
        val watchArray = call.getArray("watchIds")
        if (watchArray != null) for (i in 0 until watchArray.length()) watchIds.add(watchArray.optString(i))
        val items = try { JSONArray(prefs.getString("pending", "[]")) } catch (e: Exception) { JSONArray() }
        val kept = JSONArray()
        for (i in 0 until items.length()) {
            val row = items.optJSONObject(i)
            if (row != null && !ids.contains(row.optString("id"))) kept.put(row)
        }
        val watchMap = try { JSONObject(prefs.getString("watch", "{}")) } catch (e: Exception) { JSONObject() }
        for (id in watchIds) watchMap.remove(id)
        prefs.edit().putString("pending", kept.toString()).putString("watch", watchMap.toString()).apply()
        call.resolve()
    }

    @PluginMethod
    fun permission(call: PluginCall) {
        val result = JSObject()
        result.put("state", currentPermission())
        call.resolve(result)
    }

    @PluginMethod
    fun requestPermission(call: PluginCall) {
        if (Build.VERSION.SDK_INT < 33 || currentPermission() == "granted") {
            permission(call)
        } else {
            requestPermissionForAlias("notifications", call, "permissionDone")
        }
    }

    @PermissionCallback
    fun permissionDone(call: PluginCall) {
        permission(call)
    }

    private fun currentPermission(): String {
        if (Build.VERSION.SDK_INT < 33) return "granted"
        return getPermissionState("notifications").toString()
    }
}

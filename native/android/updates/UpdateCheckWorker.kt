package __APP_ID__

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.Worker
import androidx.work.WorkerParameters
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * The periodic job: the same steps as src/features/updates/update-checker.js.
 *
 *  1. One request asks the Worker for the newest chapter id of up to 50 titles.
 *  2. A title whose newest chapter id changed gets its chapter list read; chapters published after its `since` time and
 *     not seen before are new.
 *  3. New chapters are stored for the web app to pick up, and one notification is shown.
 */
class UpdateCheckWorker(context: Context, params: WorkerParameters) : Worker(context, params) {

    override fun doWork(): Result {
        val prefs = UpdateStore.prefs(applicationContext)
        val base = (prefs.getString("apiBase", "") ?: "").trimEnd('/')
        if (base.isEmpty()) return Result.success()
        val titles = try { JSONArray(prefs.getString("titles", "[]")) } catch (e: Exception) { JSONArray() }
        if (titles.length() == 0) return Result.success()
        val adult = prefs.getBoolean("adult", false)
        val language = prefs.getString("language", "en") ?: "en"
        val watchMap = try { JSONObject(prefs.getString("watch", "{}")) } catch (e: Exception) { JSONObject() }
        val pending = try { JSONArray(prefs.getString("pending", "[]")) } catch (e: Exception) { JSONArray() }
        val found = ArrayList<JSONObject>()

        try {
            val latest = latestIds(base, titles, adult)
            var lookups = 0
            for (i in 0 until titles.length()) {
                if (lookups >= MAX_LOOKUPS) break
                val title = titles.optJSONObject(i) ?: continue
                val id = title.optString("contentItemId")
                val externalId = title.optString("externalId")
                val state = watchMap.optJSONObject(id) ?: title
                val since = state.optString("since")
                if (since.isEmpty() || !latest.containsKey(externalId)) continue
                val newest = latest[externalId] ?: ""
                if (newest.isEmpty() || newest == state.optString("latestChapterId")) continue
                if (lookups > 0) Thread.sleep(1100)
                lookups += 1
                val seen = HashSet<String>()
                val seenArray = state.optJSONArray("seenIds")
                if (seenArray != null) for (k in 0 until seenArray.length()) seen.add(seenArray.optString(k))
                val fresh = freshChapters(base, externalId, language, adult, since, seen)
                val nowIso = isoNow()
                val ids = ArrayList<String>()
                for (chapter in fresh) {
                    ids.add(chapter.optString("externalId"))
                    found.add(rowFor(title, chapter, nowIso))
                }
                val seenOut = JSONArray()
                for (value in ids) seenOut.put(value)
                for (value in seen) if (seenOut.length() < MAX_SEEN) seenOut.put(value)
                val next = JSONObject()
                next.put("id", id)
                next.put("externalId", externalId)
                next.put("latestChapterId", newest)
                next.put("since", nowIso)
                next.put("checkedAt", nowIso)
                next.put("seenIds", seenOut)
                watchMap.put(id, next)
            }
        } catch (e: Exception) {
            // The network or MangaDex was not available, or an answer was not what we expected: what was found so far
            // is kept and the next scheduled run tries again.
        }

        if (found.isNotEmpty()) {
            for (row in found) pending.put(row)
            prefs.edit().putString("pending", pending.toString()).putString("watch", watchMap.toString()).apply()
            notifyFound(found)
        } else {
            prefs.edit().putString("watch", watchMap.toString()).apply()
        }
        return Result.success()
    }

    private fun latestIds(base: String, titles: JSONArray, adult: Boolean): Map<String, String?> {
        val out = HashMap<String, String?>()
        val ids = ArrayList<String>()
        for (i in 0 until titles.length()) {
            val external = titles.optJSONObject(i)?.optString("externalId") ?: ""
            if (external.isNotEmpty()) ids.add(external)
        }
        var start = 0
        while (start < ids.size) {
            val group = ids.subList(start, minOf(start + 50, ids.size))
            val url = base + "/api/v1/updates?ids=" + group.joinToString(",") + (if (adult) "&adult=1" else "")
            val body = get(url) ?: return out // older Worker without this route: nothing to do here
            val data = JSONObject(body).optJSONArray("data") ?: JSONArray()
            for (i in 0 until data.length()) {
                val row = data.optJSONObject(i) ?: continue
                out[row.optString("externalId")] = if (row.isNull("latestChapterId")) null else row.optString("latestChapterId")
            }
            start += 50
        }
        return out
    }

    private fun freshChapters(base: String, externalId: String, language: String, adult: Boolean, since: String, seen: Set<String>): List<JSONObject> {
        val url = base + "/api/v1/manga/" + externalId + "/chapters?limit=20&language=" + language + (if (adult) "&adult=1" else "")
        val body = get(url) ?: return emptyList()
        val data = JSONObject(body).optJSONArray("data") ?: return emptyList()
        val limit = parseTime(since) - GRACE_MS
        val out = ArrayList<JSONObject>()
        for (i in 0 until data.length()) {
            val chapter = data.optJSONObject(i) ?: continue
            val id = chapter.optString("externalId")
            if (id.isEmpty() || seen.contains(id)) continue
            val published = parseTime(chapter.optString("publishedAt"))
            if (published > limit) out.add(chapter)
        }
        out.sortBy { parseTime(it.optString("publishedAt")) }
        return out
    }

    /** The same shape the web app builds in update-plan.js (updateRow). */
    private fun rowFor(title: JSONObject, chapter: JSONObject, foundAt: String): JSONObject {
        val row = JSONObject()
        row.put("id", chapter.optString("externalId"))
        row.put("contentItemId", title.optString("contentItemId"))
        row.put("externalId", title.optString("externalId"))
        row.put("title", title.optString("title"))
        row.put("coverUrl", title.optString("coverUrl"))
        row.put("chapterNumber", if (chapter.isNull("chapterNumber")) JSONObject.NULL else chapter.optString("chapterNumber"))
        row.put("volumeNumber", if (chapter.isNull("volumeNumber")) JSONObject.NULL else chapter.optString("volumeNumber"))
        row.put("chapterTitle", chapter.optString("title"))
        row.put("language", chapter.optString("language"))
        row.put("publishedAt", chapter.optString("publishedAt"))
        row.put("foundAt", foundAt)
        row.put("read", false)
        val inner = JSONObject()
        inner.put("externalId", chapter.optString("externalId"))
        inner.put("chapterNumber", if (chapter.isNull("chapterNumber")) JSONObject.NULL else chapter.optString("chapterNumber"))
        inner.put("volumeNumber", if (chapter.isNull("volumeNumber")) JSONObject.NULL else chapter.optString("volumeNumber"))
        inner.put("title", chapter.optString("title"))
        inner.put("language", chapter.optString("language"))
        inner.put("pages", chapter.optInt("pages", 0))
        inner.put("scanlationGroups", chapter.optJSONArray("scanlationGroups") ?: JSONArray())
        row.put("chapter", inner)
        return row
    }

    private fun notifyFound(found: List<JSONObject>) {
        val context = applicationContext
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        if (Build.VERSION.SDK_INT >= 26) {
            val manager = context.getSystemService(NotificationManager::class.java)
            if (manager != null && manager.getNotificationChannel(UpdateStore.CHANNEL_ID) == null) {
                manager.createNotificationChannel(NotificationChannel(UpdateStore.CHANNEL_ID, "New chapters", NotificationManager.IMPORTANCE_DEFAULT))
            }
        }
        val names = LinkedHashMap<String, Int>()
        for (row in found) {
            val name = row.optString("title")
            names[name] = (names[name] ?: 0) + 1
        }
        val title: String
        val text: String
        if (names.size == 1) {
            val only = names.keys.first()
            val count = names[only] ?: 1
            val newest = found.last().let { if (it.isNull("chapterNumber")) "New chapter" else "Ch. " + it.optString("chapterNumber") }
            title = only
            text = if (count > 1) "$count new chapters, up to $newest" else newest
        } else {
            title = "${found.size} new chapters"
            val shown = names.keys.take(3).joinToString(", ")
            text = if (names.size > 3) "$shown and ${names.size - 3} more" else shown
        }
        val builder = NotificationCompat.Builder(context, UpdateStore.CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_notify_chat)
            .setContentTitle(title)
            .setContentText(text)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_RECOMMENDATION)
        val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
        if (launch != null) {
            builder.setContentIntent(PendingIntent.getActivity(context, 0, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
        }
        try {
            NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, builder.build())
        } catch (e: SecurityException) {
            // Permission was withdrawn between the check and the call: nothing to show.
        }
    }

    /** The body for a 2xx answer, null for 404, an IOException for anything else. */
    private fun get(address: String): String? {
        val connection = URL(address).openConnection() as HttpURLConnection
        connection.connectTimeout = 15000
        connection.readTimeout = 20000
        connection.requestMethod = "GET"
        connection.setRequestProperty("Accept", "application/json")
        try {
            val code = connection.responseCode
            if (code == 404) return null
            if (code !in 200..299) throw IOException("HTTP $code")
            return connection.inputStream.bufferedReader().use { it.readText() }
        } finally {
            connection.disconnect()
        }
    }

    private fun isoNow(): String {
        val format = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        format.timeZone = TimeZone.getTimeZone("UTC")
        return format.format(Date())
    }

    /** MangaDex and the web app both write UTC times; only the first 19 characters are read. */
    private fun parseTime(value: String): Long {
        if (value.length < 19) return 0L
        return try {
            val format = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US)
            format.timeZone = TimeZone.getTimeZone("UTC")
            format.parse(value.substring(0, 19))?.time ?: 0L
        } catch (e: Exception) {
            0L
        }
    }

    companion object {
        private const val NOTIFICATION_ID = 7102
        private const val MAX_LOOKUPS = 20
        private const val MAX_SEEN = 40
        private const val GRACE_MS = 10L * 60L * 1000L
    }
}

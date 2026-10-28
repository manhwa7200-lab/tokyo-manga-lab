package __APP_ID__

import android.content.Context
import android.content.SharedPreferences

/** Where the update checker keeps what the web app hands it, and what it found while the app was closed. */
object UpdateStore {
    const val WORK_NAME = "tml-update-check"
    const val CHANNEL_ID = "tml-updates"

    fun prefs(context: Context): SharedPreferences =
        context.getSharedPreferences("tml_updates", Context.MODE_PRIVATE)
}

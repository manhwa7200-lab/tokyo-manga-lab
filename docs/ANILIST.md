# AniList sync

Tokyo Manga Lab can sign in to your AniList account, bring your manga list into your library, and save status changes back to AniList.

## Signing in
AniList is **optional**. The app works fully without it, and nothing waits for a sign-in.

In the Android app: **Profile → Connect AniList → Log in with AniList**. AniList opens in the browser, you approve, and you are returned to the app signed in. **Register** opens anilist.co/signup for people without an account, and **Not now** tucks the card away (it stays one tap away on Profile). Check that the address says anilist.co before you type your password. In a web browser one-tap return is not available, so use **Paste a token** in Settings → Account and sync.

Afterwards the app asks whether to also save your status changes on AniList (say yes for two-way sync), then tap **Sync now**.

## One-time setup for the developer (the app ID)
Like other AniList apps, Tokyo Manga Lab can ship with its own app ID built in, so nobody has to create one. The ID is a public number, not a secret. Until you set it, the app falls back to asking each person for their own.
1. On anilist.co open **Settings → Developer → Create New Application**.
2. Name: `Tokyo Manga Lab`. Redirect URL: `tokyomangalab://anilist-auth` (exactly; it must not be another app's redirect such as `whatnext://auth`).
3. Save and copy the **Client ID** (a number). You do not need the client secret. Never share it.
4. In GitHub edit `src/features/anilist/anilist-config.js` and put the number in `DEFAULT_ANILIST_CLIENT_ID = '12345';`. Commit, then build the APK again.

Anyone who wants to use their own app can still paste an ID in Settings → Account and sync (advanced). A typed ID wins over the built-in one.

If you are not sent back to the app, use **Paste a token instead** and paste an AniList access token.

## What sync does
- **Brings in** every manga on your AniList list. Statuses map like this: Reading and Repeating → Reading, Planning → Planned, Completed → Completed, Paused → Paused, Dropped → Dropped.
- **Sends back** status changes you make in this app, when "Send changes to AniList" is on.
- **Matches titles by exact IDs only.** AniList lists many MangaDex links, and MangaDex lists AniList ids. A title with no exact match stays separate. There is no guessing from titles.
- **Never deletes anything.** Removing a title here does not remove it from AniList, and the other way round.
- **Conflicts:** if the same title changed on both sides since the last sync, the newer change wins and the sync summary says so.
- **Asks first:** if a sync would add or update titles on your AniList, you see how many and can cancel.
- **Adult titles** on your AniList are skipped while the adult-content preference is off.
- Chapter progress from AniList is shown on library cards ("AniList · ch. 12"). Progress and scores are not sent back yet.

## Privacy
- The sign-in token is stored only on this device, in the app's local database. It is not included in backups.
- The app talks to AniList directly. Nothing goes through the Cloudflare Worker.
- **Sign out** removes the token from this device. To revoke access completely, remove the app at anilist.co/settings/apps.
- AniList tokens last one year. After that, sign in again.

## Limits
- AniList allows about 30 to 90 requests per minute. A sync sends at most 60 changes per run and spaces them out. Run it again to continue.
- Brand-new titles you save here can only be sent to AniList when MangaDex knows their AniList id. That needs the updated Worker (below). Titles that come from AniList, or that AniList links to MangaDex, work without it.
- Not tested against the live AniList service from the build environment. The first real sync on your phone is the real test.

## Worker update (optional, needs your approval to deploy)
`worker/src/index.js` now passes `anilistId` and `malId` through from MangaDex. To use it, update the deployed Worker. The Worker is named `tokyo-manga-lab-api2` (the app uses `tokyo-manga-lab-api2.haribp720.workers.dev`), and `worker/wrangler.toml` now says the same. Paste the new file into that Worker's code editor and deploy.

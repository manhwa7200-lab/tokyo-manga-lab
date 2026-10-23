# AniList sync

Tokyo Manga Lab can sign in to your AniList account, bring your manga list into your library, and save status changes back to AniList.

## One-time setup (about 3 minutes)
1. On anilist.co open **Settings → Developer → Create New Application**.
2. Name: `Tokyo Manga Lab`. Redirect URL: `tokyomangalab://anilist-auth` (exactly).
3. Save. Copy the **Client ID** (a number). You do not need the client secret. Never share it.
4. In the app: **Profile → AniList** (or Settings → Account and sync). Paste the Client ID, then tap **Sign in**.
5. AniList opens. Tap Approve. You return to the app and see "Connected as your-name".
6. The app asks whether to also save your changes on AniList. Say yes for two-way sync.
7. Tap **Sync now**.

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

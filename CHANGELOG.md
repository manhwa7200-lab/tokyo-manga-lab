# Changelog

## 0.4.0-preview — Claude Starter Kit
- Combined the code foundation with the full product blueprint and Claude master prompt.
- Added detailed data-schema and release roadmap documents.
- Added Termux bootstrap/verification and ZIP packaging scripts.
- Added GitHub Actions workflow for syntax checks, tests and downloadable ZIP artifact.
- Included the approved generated UI concept image for Claude as visual reference.
- Existing tests: 17 passing in the packaging environment.

## 0.5.0 - Android APK wrapper
- Capacitor Android wrapper (config, www bundle script, icon generation).
- `Build Android APK` and `Unzip and apply ZIP` GitHub Actions workflows.
- See BUILD-APK.md.

## 0.5.1 - UI refresh
- New design: cover-first poster cards, shelves on Home, floating bottom navigation with icons.
- Profile is now a hub of sections, with planned-feature slots.
- Settings are organised as categories and sub-categories, driven by `settings-schema.js`.
- New settings: cover size, sort library by, chapter language (now used when opening a title).
- Fixed: the chapter language menu in the title sheet did nothing.
- See docs/EXTENDING-UI.md.

## 0.6.0 - AniList sync
- Sign in with AniList (one-tap app link, or paste a token), import your manga list, and save status changes back.
- Exact-ID matching only, never deletes, asks before adding titles to AniList, skips adult titles while that preference is off.
- Android build registers the `tokyomangalab://anilist-auth` link and bundles the Capacitor App and Browser plugins.
- Local database upgraded to version 2 (new `accountLinks` and `syncLinks` stores; existing data is kept).
- Worker passes `anilistId` and `malId` through (not deployed by this change).
- See docs/ANILIST.md.

## 0.7.0 - Reader
- In-app manga reader for MangaDex chapters: tap **Read** in a title's chapter list. Vertical scroll, right-to-left and left-to-right modes, page slider, tap zones and arrow keys, previous/next chapter, data-saver quality.
- Resumes where you stopped and records finished chapters (`chapterProgress`) and reading sessions (`readingSessions`), so the statistics screen starts counting real reading. No database version change.
- Pages load directly from MangaDex nodes; the app does not download, store or re-host them. Expired or failing addresses are refreshed automatically (rate-limited and capped), with a manual retry.
- Sends MangaDex's requested image-load reports (URL, result and timing only; no account data).
- Worker: new `GET /api/v1/chapters/{id}/pages` (not deployed by this change). The reader needs this Worker update; until it is deployed the Read screen explains that and links to MangaDex.
- Adult MangaDex ratings (erotica, pornographic) are available only in the Android app, behind the off-by-default preference with a confirmation. The web demo never receives them. Loli/shota-tagged titles are blocked in every mode.
- New settings: reading mode, page fit, image quality.
- No third-party adult sites were added; see docs/ADULT-SOURCES.md.

## 0.7.1 - Reader image recovery
- If the WebView will not show a page image, the reader now fetches the same address through the app's own network layer (Capacitor native HTTP) and shows that copy. It also reports the real size and X-Cache result to MangaDex in that case.
- When a page still fails, the message says why (refused 403, not found 404, rate limited, could not connect, not an image) and names the image server host and port, so a blocked network can be told apart from an expired address.
- Fix: a failed page no longer needs an automatic address refresh before the app-network fallback is tried.

## 0.8.0 - Reader options
- New **Reader options** sheet (sliders button in the reader's top bar): reading mode (left to right, right to left, vertical), image quality, **auto read** with five speeds, **screen rotation** (auto, portrait, landscape), **show status bar**, **time and battery**, **volume keys turn pages**, **chapter reminder**, **skip extras**, share the chapter link, the operation tips, and a shortcut to more settings. Every option is also in Settings > Reading and is saved on the device.
- Auto read scrolls by itself in vertical mode and turns pages on a timer in the page modes. Touching the page while it scrolls pauses it, and the on-screen pill resumes or stops it.
- Operation tips appear the first time you open the reader and can be shown again from the sheet or from Settings.
- Fix: a chapter MangaDex has no readable pages for (for example some One Piece chapters) now says so, using the Worker's own message, instead of claiming the reader is not available yet.
- Android build: adds the Capacitor Status Bar and Screen Orientation plugins and a small `MainActivity` hook that passes the volume keys to the page only while the reader is open and the volume option is on (the reader address carries `?vol=1`). Everywhere else the volume keys work normally.
- Status bar, rotation and volume keys only work in the Android app. In a browser they say so instead of failing.
- The Worker did not change in this version.

## 0.9.0 - AniList to MangaDex linking
- AniList-only titles can now list and read chapters: the title sheet matches the AniList numeric ID against MangaDex's `anilistId`, and otherwise offers a candidate picker. Titles are never linked by name similarity.
- The link is a separate `sourceEntries` row (no schema change). AniList description and artwork are kept; MangaDex only fills blanks. Chapter availability comes from the linked MangaDex record.
- Change or unlink from the title sheet. New `docs/LINKING.md`, 14 unit tests and an end-to-end test.
- Service worker cache bumped to `v8`.
- `worker/wrangler.toml` name corrected from `tokyo-manga-lab-api` to `tokyo-manga-lab-api2` so it matches the live Worker. Nothing was deployed.

## 0.9.1 - Bug-fix round
- Search: typing no longer loses focus. Only the results area redraws.
- Title sheet: it now has its own history entry, so the Android Back button and Esc close it instead of changing the page behind it. Back from the reader returns to the page the sheet was opened from.
- Adult-rated titles are hidden from the Library and Home while the preference is off (or in the web build). They stay saved on this device, and the Library says how many are hidden.
- Chapter lists skip chapters hosted on other sites and chapters with no pages (Worker change: `includeExternalUrl=0`, `includeEmptyPages=0`). Redeploy the Worker to get this.
- Export backup works in the Android app: the file goes to the share sheet (needs `@capacitor/filesystem` and `@capacitor/share`).
- APK signing: the build can use one saved key (`ANDROID_DEBUG_KEYSTORE_BASE64`) so updates install over older builds. See `docs/SIGNING.md`; the workflow file is in `docs/workflows/` and must be pasted into `.github/workflows/` by hand.
- Smaller: bigger tap targets, higher contrast for faint text, collections chosen in an in-app sheet instead of a prompt box, `npm run check` finds every file itself (and fails if the offline cache misses a module), `DELETE-FILES.txt` support in the import script, `mangadex-live.js` queued for removal, Worker User-Agent version.
- Service worker cache bumped to `v9`.


## 0.9.2 - Covers, logo, hardening
- **New logo** used as the Android app icon, header mark, browser favicon and home-screen icons (192, 512 and Apple touch PNGs, plus a maskable entry in the manifest).
- **Covers:** MangaDex covers load a sharper 512 version on high-density screens, show a loading shimmer (still when reduced motion is on), retry once if the network blinks, fall back to the other known cover for linked titles, and then to the local placeholder. Covers are cached in a separate cache that survives app updates and is trimmed to 400 images. The cover-size setting now also applies to the Home rails and the Library list.
- **Security:** a Content-Security-Policy limits scripts, connections and objects to what the app uses. Cover addresses are only accepted from `uploads.mangadex.org` and `*.anilist.co` over https, so an imported backup cannot make the app load images from elsewhere.
- **Offline cache:** the shell cache is named after the app version (`sw.js?v=<version>`), so a release can no longer leave an old cache behind by forgetting to bump a number.
- **Backups merge instead of overwrite:** importing keeps whichever copy is newer, includes AniList sync links, and says how many items were kept because they are newer on this device.
- Chapter progress: a one-page chapter is finished only when you reach its end card. A saved title no longer loses its description or cover when a later catalogue response comes back with blanks.
- Errors: a catalogue outage that returns a web page instead of JSON now gives the friendly "temporarily unavailable" message. A blocked database upgrade (another tab still open) no longer hangs the app.
- Worker: best-effort per-IP rate limit (120 requests per minute per Worker instance, `/health` exempt). Redeploy the Worker to get it.
- Text that described an older build (cloud sync, "after the reader is connected", Downloads) was rewritten to match what the app does now.
- Build: `docs/workflows/build-apk.yml` uses `npm ci` when a `package-lock.json` exists and uploads the generated lockfile as an artifact when it does not. `docs/workflows/ci.yml` gains a browser-test job.
- Tests: the browser suites now live in `tests/e2e/` (`python3 tests/e2e/run.py`) and also fail on any Content-Security-Policy violation. 116 unit tests.
- **Comick** was reviewed as a second manga source and **not added**; see `docs/SOURCE-REVIEW.md`.

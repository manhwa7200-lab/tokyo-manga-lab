# Offline chapters (downloads)

Added in 0.11.0. Open a title, tap **Download** above its chapters, pick what you want, and read it later with no connection.

## Using it
- **Add to Download** (full screen): a round checkbox per chapter, **jump to** a chapter number, a sort arrow (highest or lowest first), **Select All / Select None**, a live "N Selected" count and a **Download** button that stays disabled until something is picked. The icon at the top right opens the queue.
- A chapter's row on a title shows when it is downloaded or waiting, and its ⋯ menu has **Download** or **Delete download**.
- **Downloads** tab: storage used (against your limit), the queue with progress, Pause / Resume / Retry / Cancel, and everything saved, grouped by title. Tap a saved chapter to read it. Delete one chapter, one title, or everything.
- The reader opens a saved chapter from the phone with no network at all. If a saved chapter is damaged or incomplete it quietly falls back to reading online.

## Settings > Downloads
| Setting | Default | Notes |
|---|---|---|
| Download quality | Data saver | Data saver files are about half the size. If a chapter has no file in that quality the other one is used. |
| Download on Wi-Fi only | On | The queue waits on mobile data. It relies on the phone telling the app its connection type (`navigator.connection.type`, available in Android's Chrome WebView). If the phone does not say, the app cannot tell and treats the connection as not metered. |
| Storage limit | 2 GB | New chapters wait once this much is used. A chapter already in progress finishes. |

## How it behaves (and why)
- **One chapter at a time**, three images at a time, with at least 2.5 seconds between chapter page-list requests. MangaDex allows 40 page-list (`/at-home/server`) requests a minute and warns it will throttle or block bulk clients, so the app stays far below it. A big pick simply takes longer.
- Pages come **straight from MangaDex's image servers**. The Worker still only returns page *addresses* (through the existing `/api/v1/chapters/{id}/pages` route, which already applies the rating and tag rules) and never relays image bytes.
- Image requests are anonymous: no cookies and no sign-in headers, as MangaDex requires. Every fetch from a node outside mangadex.org is reported to `api.mangadex.network/report`, the same as when reading.
- Addresses last about 15 minutes. If one is refused (403/404/410) the app asks for fresh addresses (at most twice per chapter) and retries; each page is tried three times; a chapter that still fails shows the reason and a Retry button. Pages that did save are kept, so Retry only fetches what is missing.
- A rate limit or a dropped connection while asking for page addresses is retried after 4 and then 12 seconds before the chapter is marked failed.
- A restart is safe: a chapter that was mid-download goes back to the queue and carries on.

## Where it is stored
- Page images: their own IndexedDB database `tokyo-manga-lab-pages` (a storage adapter, `page-store.js`), never in the metadata stores.
- One record per chapter in `downloadJobs` (title, chapter label, quality, page count, bytes, status). `downloadedAssets` and `chapterAssets` are not used.
- Downloads are **never** part of a backup and never uploaded or shared. The app asks the phone to treat its storage as persistent (`navigator.storage.persist()`) so saved chapters are not evicted, but a phone can still clear app data.

## Limits and honesty
- Downloads are for your own reading on your own phone. There is no export, share or copy feature, and the app does not host anything.
- Only MangaDex chapters hosted on MangaDex's network can be downloaded; chapters that link out to another site have no pages to save.
- The app has to be open (or kept alive) to download. In the web version a browser may pause a background tab. The Android app can keep going with the screen off if built with the optional Kotlin plugin (`docs/ANDROID-NATIVE-DOWNLOADS.md`).
- Nothing here has been run on a real phone or against live MangaDex yet. It is covered by 33 unit tests and the browser suite `downloads_e2e.py` against a mocked Worker and image servers.

## Code map
`src/features/downloads/`: `download-plan.js` (pure helpers), `download-manager.js` (queue), `page-store.js` (storage adapter), `download-repository.js` (records), `download-fetch.js` (image fetch and connection type), `download-ui.js` (markup), `download-controller.js` (picker and Downloads screen), `keep-alive.js` (optional native notification). Offline pages reach the reader through `openChapter()`, which returns a pages object with `offline: true`; the reader treats it like any page list.

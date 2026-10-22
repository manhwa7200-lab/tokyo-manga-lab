# Reader

Open a title, then tap **Read** on a chapter (the ↗ button opens it on MangaDex instead). The reader is route `#read/<chapterId>` and hides the normal app chrome.

## How it works
1. The app asks the Worker for the chapter's page list (`GET /api/v1/chapters/{id}/pages`). The Worker returns a base URL, a hash and filenames, never images.
2. The app builds `baseUrl/{data|data-saver}/hash/filename` and shows the images straight from MangaDex's network. Nothing is downloaded, stored or re-hosted.
3. Node addresses expire. The app asks for fresh ones after 14 minutes or when an image fails (at most 4 automatic refreshes per visit, 3 seconds apart). A failed page shows a retry button.
4. MangaDex asks every client to report image loads from its network nodes, so the app sends `{ url, success, cached, bytes, duration }` to `api.mangadex.network/report`. Nothing about you, your library or what you read is included. `bytes` comes from the browser's resource timing and is 0 when the browser hides cross-origin sizes; `cached` is always false because the app cannot see the `X-Cache` header from an `<img>` element.

## Modes and controls
- **Vertical scroll**: all pages in a column, loaded shortly before they scroll into view.
- **Right to left / left to right**: one page at a time. Tap the left or right 30% of the screen (swapped for right to left), use the arrow keys or Space, or drag the slider. Tap the middle to hide or show the bars.
- The mode button cycles modes and HD/Saver switches quality; both choices are saved as settings. Page fit is in Settings > Reading.
- Closing the reader returns to the screen you came from and reopens the title sheet.

## Progress
Stored in `chapterProgress` (`mangadex-chapter:<uuid>`): last page, total pages, `readingState` (`not-started`, `in-progress`, `completed`). A finished chapter stays finished if you reopen it and reopens at page one. Each visit longer than 5 seconds adds a `readingSessions` row (active seconds only while the app is visible).

## Known limits
- Next/previous chapter uses the chapter list you opened it from (one page of 24), so the first or last entry of that page has no neighbour until you go back and change page.
- Chapters hosted on another site cannot be shown and link out instead.
- Keep-screen-on and offline downloads are not built.
- Needs the updated Worker deployed (see CHANGELOG 0.7.0).
- Verified with mocked network in Chromium and unit tests. Not yet tried against live MangaDex or on a device.

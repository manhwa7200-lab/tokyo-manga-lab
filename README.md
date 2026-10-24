# Tokyo Manga Lab — V1.1 Manga Details & Chapter Metadata (preview 0.4)

A modular static-web foundation for Tokyo Manga Lab, built around the approved planning blueprint. This package is intended for review and testing before it is pushed or deployed. It does not modify the live repository by itself.

## What's included

- Responsive Sakura Night / Midnight Blue UI with Home, Discover, Library, Downloads, Profile, and Settings sections.
- Existing Cloudflare Worker routes `/health` and `/manga` remain backward-compatible. The included Worker source adds normalized `/api/v1` search, source registry, title details and chapter-metadata routes.
- Modular MangaDex source adapter and normalized content records.
- IndexedDB database with versioned schema and stores for catalogue items, sources, chapters/assets, library, collections, progress, bookmarks, downloads, settings, cache, statistics, and future sync.
- Local library: add titles, set status, favourites, custom collections, and remove library entries without deleting cached catalogue metadata.
- JSON metadata backup export/import. A one-time migration imports the previous `tokyo-manga-lab-v1` localStorage saved/reading lists into IndexedDB and retains the old key as a safety copy.
- Basic library statistics; reading-session charts remain an honest empty state until in-app chapter reading is implemented.
- Title-details dialog can display paginated chapter metadata with English, Japanese or all-language filters; chapter links open the original MangaDex page.
- A service worker that caches the same-origin app shell only. It does not cache or proxy external catalogue responses or cover artwork.
- Adult-content preference is off by default. No explicit-content source is connected in this build.

## Run locally

ES modules and service workers should be tested through HTTP rather than opening `index.html` as a `file://` URL.

With Python available:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000` from the project directory. On Android/Termux, run that command in the directory containing `index.html`, then open the local URL in a browser that can access the same device.

## Deploying to GitHub Pages

1. Back up your current repository files first.
2. Extract this ZIP into your existing `tokyo-manga-lab` repository root, preserving the `src`, `css`, `assets`, and `worker` folder structure.
3. Commit/push using your normal workflow only after the local preview is checked. The Worker source is a separate deployment; review `DEPLOY-ON-ANDROID.md` and verify the configured Worker name before running Wrangler.
4. Wait for the GitHub Pages action/deployment to finish before testing the live site.

The old `mangadex-live.js` prototype is no longer used and is removed by the import that carries `DELETE-FILES.txt`.

## API notes

- API base: `https://tokyo-manga-lab-api2.haribp720.workers.dev`
- Existing routes used for live search: `GET /health` and `GET /manga?q=...&page=...`.
- New Worker source adds `GET /api/v1/sources`, `/api/v1/search`, `/api/v1/manga/{uuid}`, and `/api/v1/manga/{uuid}/chapters`. The deployed Worker stays unchanged until you deploy `worker/src/index.js` yourself.
- `worker/wrangler.toml` is intentionally not included or overwritten, because the configured Worker name must be checked against your actual deployed Worker URL before deployment.
- Source adapter capabilities report title details and chapter metadata support in the patch; chapter content and offline chapter downloads remain unimplemented.

## Current limits

This is the first implementation slice, not the entire long-term roadmap. In particular, it does not yet provide an in-app chapter reader or chapter-content endpoints, novel imports, online novel connectors, login/cloud sync, author submissions, payments/donations, or an Android APK. These remain staged features in the approved plan. Chapter content is not fetched or mirrored by the Worker.

Local data is stored in IndexedDB for this browser origin. JSON backup contains metadata and reading records; it does not package imported book files, cover binaries, or downloaded chapter assets. Always export a backup before clearing browser storage.

GitHub Pages is a static frontend host and should remain a neutral, non-explicit demo. Do not host explicit content or build an explicit-content service on GitHub Pages; assess host/provider terms and local law before future distribution.

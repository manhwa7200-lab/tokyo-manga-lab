# API contracts — Tokyo Manga Lab

## Current compatibility routes

### `GET /health`
Returns `{ ok, service, contentRatings, apiVersion }`.

### `GET /manga?q={query}&page={page}[&genre=…&status=…&sort=…]`
Legacy MangaDex search response retained for existing frontend compatibility (the app still uses it for search). `page` is clamped to 1–20 and each page contains up to 24 results. Only `safe` and `suggestive` ratings are requested. Accepts the same `genre`, `status` and `sort` filters as `/api/v1/search` below and returns `lastChapter`.

## Versioned metadata API

All v1 success responses include `meta.apiVersion = "1"` and a `requestId`. Errors use `{ error: { code, message }, meta }`.

### `GET /api/v1/sources`
Returns source IDs and capability flags. For the current connector, `search`, `titleDetails`, `chapters` and `chapterContent` are supported; the Worker's `offlineDownloads` flag is false because the Worker never downloads or stores anything; the app saves chapters itself (`docs/DOWNLOADS.md`). `chapterContent` means the Worker can return the *addresses* of chapter pages; it never relays image bytes.

### `GET /api/v1/search?query={query}&type=manga&page={page}`
Returns `{ data: ContentItem[], pagination, meta }`. The normalized ContentItem includes `sourceId`, `externalId`, `contentType`, `title`, `alternateTitles`, `description`, `coverUrl`, `authors`, `artists`, `genres`, `tags`, `publicationStatus`, `releaseYear`, `language`, `sourceUrl`, and `contentRating`.

Optional filters (0.12.0): `genre` (comma-separated tag ids, at most 6, all must match), `status` (`ongoing|completed|hiatus|cancelled`) and `sort` (`popular` = most followed, `new` = newest title, `updated` = newest chapter). Unknown values are ignored; the loli and shota tag ids are dropped from `genre`. With no query and no sort the order is newest chapter first. While a filter is on, the extra safe-rated tagged-title lookup is skipped.

### `GET /api/v1/tags`
Returns `{ data: [{ id, name, group }], meta }` for the Genre sheet, from MangaDex's tag list (kept in the Worker for six hours). loli and shota are never listed; tags about sexual content are listed only in the adult-gated case (app, no Origin header, `adult=1`).

### `GET /api/v1/latest?page={page}`
Newest English chapters, one entry per title: `{ data: ContentItem[] (each with latestChapter: { number, publishedAt }), pagination, meta }`. One page reads the newest 100 chapters (so a page can hold up to 100 titles); pages are clamped to 1–20. Titles go through the same content policy as search.

### `GET /api/v1/manga/{mangaDexUuid}`
Returns `{ data: ContentItem, meta }`. Only MangaDex UUIDs and supported content ratings are accepted.

### `GET /api/v1/manga/{mangaDexUuid}/chapters?page=1&language=en`
Returns `{ data: ChapterMetadata[], pagination, meta }`. Chapter metadata includes a provider-scoped `externalId`, chapter/volume number, title, language, page count, publication timestamp, scanlation group names, and canonical source URL. Use `language=all` for all available translation languages. This endpoint does not return page addresses; use the pages endpoint below.

### `GET /api/v1/chapters/{chapterUuid}/pages`
Returns `{ data: { chapterId, mangaExternalId, baseUrl, hash, data[], dataSaver[], validForSeconds }, meta }`. The reader builds each image address as `baseUrl/{data|data-saver}/hash/filename` and loads it straight from the MangaDex network node. Notes:
- Fixed upstream paths only (`/chapter/{id}` and `/at-home/server/{id}`), a validated UUID, and filenames/hash/base URL are validated. This is not a general proxy, and no image bytes pass through the Worker.
- Responses are `Cache-Control: no-store` because node addresses expire (MangaDex guarantees 15 minutes). The app refreshes after 14 minutes or on a failed image.
- The parent title's rating is checked first and the endpoint fails closed if it cannot be read.
- Chapters hosted on another site return `422 CHAPTER_EXTERNAL`.

## Adult ratings (Android app only)
By default every endpoint serves `safe` and `suggestive` titles only. Adding `adult=1` also allows `erotica` and `pornographic`, but **only when the request has no `Origin` header**, which is the case for the Android app's native HTTP layer and never for a browser. Browser requests (including the public GitHub Pages demo) always get the neutral catalogue. This is a product policy that keeps the demo neutral. It is not authentication or age verification.
Titles tagged `loli` or `shota` are excluded in every mode (request filter by tag id plus a response check by tag name).

## Stable identity

A catalogue entry is keyed in the app by an internal `contentItemId`, while provider identifiers remain in `sourceEntries` (`sourceId` + `externalId`). Matching across different providers should be conservative. Do not merge solely because chapter numbers or similar titles match.

## Error codes

- `UNSUPPORTED_CONTENT_TYPE` — not yet supported by the source registry.
- `INVALID_MANGA_ID` — ID is not a valid MangaDex UUID.
- `INVALID_CHAPTER_ID` — chapter ID is not a valid UUID.
- `CHAPTER_UNAVAILABLE` — chapter missing, or its title is filtered by the rating policy.
- `CHAPTER_EXTERNAL` — chapter is hosted off MangaDex; open the source link.
- `INVALID_LANGUAGE` — invalid language filter.
- `TITLE_UNAVAILABLE` — missing or filtered by the connector's content-rating policy.
- `RATE_LIMITED` — upstream rate limit.
- `UPSTREAM_UNAVAILABLE` — upstream timeout or failure.
- `NOT_FOUND` — unknown API route.

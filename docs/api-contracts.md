# API contracts — Tokyo Manga Lab

## Current compatibility routes

### `GET /health`
Returns `{ ok, service, contentRatings, apiVersion }`.

### `GET /manga?q={query}&page={page}`
Legacy MangaDex search response retained for existing frontend compatibility. `page` is clamped to 1–20 and each page contains up to 24 results. Only `safe` and `suggestive` ratings are requested.

## Versioned metadata API

All v1 success responses include `meta.apiVersion = "1"` and a `requestId`. Errors use `{ error: { code, message }, meta }`.

### `GET /api/v1/sources`
Returns source IDs and capability flags. For the current connector, `search`, `titleDetails`, `chapters` and `chapterContent` are supported; `offlineDownloads` is false. `chapterContent` means the Worker can return the *addresses* of chapter pages; it never relays image bytes.

### `GET /api/v1/search?query={query}&type=manga&page={page}`
Returns `{ data: ContentItem[], pagination, meta }`. The normalized ContentItem includes `sourceId`, `externalId`, `contentType`, `title`, `alternateTitles`, `description`, `coverUrl`, `authors`, `artists`, `genres`, `tags`, `publicationStatus`, `releaseYear`, `language`, `sourceUrl`, and `contentRating`.

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

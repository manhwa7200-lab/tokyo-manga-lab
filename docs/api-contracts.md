# API contracts — Tokyo Manga Lab

## Current compatibility routes

### `GET /health`
Returns `{ ok, service, contentRatings, apiVersion }`.

### `GET /manga?q={query}&page={page}`
Legacy MangaDex search response retained for existing frontend compatibility. `page` is clamped to 1–20 and each page contains up to 24 results. Only `safe` and `suggestive` ratings are requested.

## Versioned metadata API

All v1 success responses include `meta.apiVersion = "1"` and a `requestId`. Errors use `{ error: { code, message }, meta }`.

### `GET /api/v1/sources`
Returns source IDs and capability flags. For the current connector, `search`, `titleDetails`, and `chapters` are supported; `chapterContent` and `offlineDownloads` are false.

### `GET /api/v1/search?query={query}&type=manga&page={page}`
Returns `{ data: ContentItem[], pagination, meta }`. The normalized ContentItem includes `sourceId`, `externalId`, `contentType`, `title`, `alternateTitles`, `description`, `coverUrl`, `authors`, `artists`, `genres`, `tags`, `publicationStatus`, `releaseYear`, `language`, `sourceUrl`, and `contentRating`.

### `GET /api/v1/manga/{mangaDexUuid}`
Returns `{ data: ContentItem, meta }`. Only MangaDex UUIDs and supported content ratings are accepted.

### `GET /api/v1/manga/{mangaDexUuid}/chapters?page=1&language=en`
Returns `{ data: ChapterMetadata[], pagination, meta }`. Chapter metadata includes a provider-scoped `externalId`, chapter/volume number, title, language, page count, publication timestamp, scanlation group names, and canonical source URL. Use `language=all` for all available translation languages. The endpoint does not return chapter-page contents or image URLs.

## Stable identity

A catalogue entry is keyed in the app by an internal `contentItemId`, while provider identifiers remain in `sourceEntries` (`sourceId` + `externalId`). Matching across different providers should be conservative. Do not merge solely because chapter numbers or similar titles match.

## Error codes

- `UNSUPPORTED_CONTENT_TYPE` — not yet supported by the source registry.
- `INVALID_MANGA_ID` — ID is not a valid MangaDex UUID.
- `INVALID_LANGUAGE` — invalid language filter.
- `TITLE_UNAVAILABLE` — missing or filtered by the connector's content-rating policy.
- `RATE_LIMITED` — upstream rate limit.
- `UPSTREAM_UNAVAILABLE` — upstream timeout or failure.
- `NOT_FOUND` — unknown API route.

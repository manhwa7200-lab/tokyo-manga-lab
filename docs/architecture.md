# Architecture — Tokyo Manga Lab V1 Foundation

## Runtime flow

`index.html` loads CSS and the ES module entrypoint `src/app.js`. The app controller renders hash-routed screens. Features call repositories and services; the UI does not call source endpoints directly.

## Source adapter boundary

`src/sources/source-registry.js` registers adapters. `mangadex-adapter.js` uses `api-client.js` and normalizes responses into the internal `contentItems` shape. Live search continues to use the already deployed `/health` and `/manga` endpoints for backward compatibility. The preview adds versioned metadata endpoints to the Worker source; details and chapter lists use them after that Worker patch is deployed.

## Local database

`src/data/database.js` owns IndexedDB creation and the versioned object-store schema. Repositories in `src/data/repositories` coordinate content items, source entries, library entries, collections, and backup operations. Large binary content is referenced by storage keys and is not duplicated in metadata rows.

## Phase boundaries

- V1 foundation: manga search, local library, collections, status, favourites, basic profile/settings and metadata backup.
- This preview: versioned API contracts and paginated title/chapter metadata endpoints. Next: implement the in-app chapter reader after Worker deployment and browser testing.
- Novel beta after the main site launch: local imports (EPUB/TXT first), a format-appropriate reader, then PDF and permitted online connectors.
- Later backend: user accounts, cloud sync, author applications, private drafts, moderation, publishing, notifications and optional creator donations.

## Safety and data integrity

- Adult content preference defaults to off; no explicit connector is installed.
- A library removal deletes the library link and collection memberships but preserves cached content metadata, reading progress, bookmarks and imported assets.
- JSON backup import is a merge-by-ID operation; matching IDs may be updated.
- The Worker source changes in this preview, but a ZIP extraction does not deploy it; the live Worker remains unchanged until separately deployed.

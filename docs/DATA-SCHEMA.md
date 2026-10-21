# Detailed data schema — planning baseline

This document specifies the approved conceptual model. It is not a command to create every store before its feature exists. Introduce stores through versioned migrations when the relevant feature is ready.

## IDs and conventions
- Use stable internal UUID-like IDs generated locally.
- Keep provider identifiers separate from internal IDs.
- Timestamps are ISO-compatible dates or integer epoch values, consistently applied within a store.
- Required fields must be validated at repository boundaries.
- Structured records live in IndexedDB. Large binary content is referenced by a storage key and kept in a suitable storage backend.

## Local stores

### `contentItems`
`id`, `title`, `alternateTitles[]`, `contentType` (`manga|novel|web_novel`), `description`, `coverAssetKey`, `genres[]`, `authors[]`, `artists[]`, `publicationStatus`, `releaseYear`, `language`, `createdAt`, `updatedAt`.

### `sourceEntries`
`id`, `contentItemId`, `sourceId`, `externalId`, `sourceUrl`, `sourceTitle`, `language`, `lastCheckedAt`, `availabilityStatus`. When available, `(sourceId, externalId)` is unique. Never merge uncertain provider matches silently.

### `chapterRecords`
`id`, `contentItemId`, `sourceEntryId`, `externalChapterId`, `chapterNumber`, `volumeNumber`, `title`, `language`, `sortOrder`, `publishedAt`, `pageCount`, `canonicalChapterKey`, `availabilityStatus`. Provider-specific chapter identities remain separate; chapter numbers alone are not a reliable match key.

### `chapterAssets`
`id`, `chapterRecordId`, `assetType` (`image|text_segment|document_reference`), `position`, `remoteUrl`, `localStorageKey`, `mimeType`, `byteSize`, `checksum`. Only cache/store assets when permitted by the source and user-selected behavior.

### `libraryEntries`
`id`, `contentItemId`, `personalStatus` (`planned|reading|completed|paused|dropped`), `isFavorite`, `userRating`, `addedAt`, `lastOpenedAt`, `preferredSourceEntryId`, `customTitle`, `notes`. Normally one entry per local profile/content item.

### `collections`
`id`, `name`, `description`, `collectionType` (`manual|smart`), `icon`, `color`, `sortMode`, `filterRules`, `createdAt`, `updatedAt`.

### `collectionItems`
`collectionId`, `libraryEntryId`, `position`, `addedAt`; unique on `(collectionId, libraryEntryId)`.

### `savedViews`
`id`, `name`, `filterRules`, `sortRules`, `createdAt`.

### `readingProgress`
`contentItemId`, `chapterRecordId`, `readerType` (`manga|epub|text|pdf`), `position` (format-specific object), `progressPercent`, `lastReadAt`, `updatedAt`, `deviceId`. Unique per local profile/content item. The position must be type-validated for the selected reader.

### `chapterProgress`
`chapterRecordId`, `contentItemId`, `readingState` (`unread|reading|completed`), `progressPercent`, `firstReadAt`, `completedAt`, `updatedAt`.

### `bookmarks`
`id`, `contentItemId`, `chapterRecordId`, `location` (page, scroll, EPUB CFI, text offset or PDF page), `label`, `createdAt`. Bookmark creation must not alter reading progress.

### `localFiles`
`id`, `fileName`, `mimeType`, `fileSizeBytes`, `checksum`, `storageBackend`, `storageKey`, `importedAt`, `lastVerifiedAt`, `availabilityStatus`. Keep binary file bytes separate from metadata rows; support missing-file detection.

### `downloadJobs`
`id`, `contentItemId`, `chapterRecordId`, `status` (`queued|downloading|completed|failed|cancelled`), `bytesDownloaded`, `totalBytes`, `retryCount`, `lastError`, `createdAt`, `updatedAt`.

### `downloadedAssets`
`id`, `chapterRecordId`, `assetId`, `storageKey`, `byteSize`, `checksum`, `downloadedAt`, `lastAccessedAt`.

### `appSettings`
Key/value preferences for appearance, reader, default library sorting, privacy, content safety, storage and sync. Validate known keys and values; adult-content preference defaults OFF.

### `sourceSettings`
`sourceId`, `isEnabled`, `preferredLanguage`, `lastSuccessfulCheckAt`, `userPreferences`.

### `apiCache`
`cacheKey`, `responseData`, `cachedAt`, `expiresAt`, `sourceId`. Disposable, refreshable data only—never the source of truth for personal reading records.

### `readingSessions`
`id`, `contentItemId`, `chapterRecordId`, `readerType`, `startedAt`, `endedAt`, `activeDurationSeconds`, `completedChaptersDelta`. Use inactivity rules; do not count the full elapsed gap as active reading.

### `statisticsCache` (optional later)
`key`, `value`, `generatedAt`. All cache entries must be reproducible from underlying records.

### `syncOutbox` (future)
`id`, `entityType`, `entityId`, `operation`, `payload`, `createdAt`, `attemptCount`, `status`. Add sync cursors, device IDs and conflict records only when cloud sync is designed.

## Future server-side stores (not IndexedDB authorization)
- `users`, `userRoles`, `authorApplications`, `authorProfiles`, `publishedWorks`, `manuscripts`, `publishedChapters`, `moderationReports`, `moderationActions`, `notifications`.
- Sensitive operations require server-side role checks, audited changes, privacy controls, rights declarations and a takedown/report workflow.

## Relationships
- One `contentItem` has many `sourceEntries` and `chapterRecords`.
- A local `libraryEntry` references one `contentItem`.
- A collection and library entry are linked through `collectionItems` (many-to-many).
- `readingProgress`, `chapterProgress`, `bookmarks`, and `readingSessions` reference content/chapter records.
- `chapterAssets`, `downloadJobs`, and `downloadedAssets` reference the relevant chapter or asset.

## Integrity rules
1. Use transactions for multi-store writes where possible.
2. Use safe, versioned DB migrations; never drop old stores or localStorage backup keys until verification.
3. Removing a library entry must not delete a user's imported original file or blindly delete catalogue metadata/progress/bookmarks.
4. Backup/restore must state whether it includes metadata only or actual binary content; this starter's JSON backup is metadata, not a file archive.
5. Do not upload private user data without an explicit, explained opt-in.
6. Cache/search data may expire; library, bookmarks and progress must not be discarded because a source was unavailable.

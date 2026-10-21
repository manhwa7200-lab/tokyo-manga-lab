export const CONTENT_TYPES = Object.freeze({ MANGA: 'manga', NOVEL: 'novel', WEB_NOVEL: 'web_novel' });
export const LIBRARY_STATUSES = Object.freeze(['planned', 'reading', 'completed', 'paused', 'dropped']);

export function normalizeContentItem(input) {
  const now = new Date().toISOString();
  const id = String(input.id || (input.sourceId && input.externalId ? `${input.sourceId}:${input.externalId}` : crypto.randomUUID()));
  return {
    id,
    sourceId: String(input.sourceId || 'local'),
    externalId: input.externalId == null ? null : String(input.externalId),
    contentType: CONTENT_TYPES[input.contentType?.toUpperCase?.()] || input.contentType || CONTENT_TYPES.MANGA,
    title: String(input.title || 'Untitled').trim().slice(0, 300),
    alternateTitles: Array.isArray(input.alternateTitles) ? input.alternateTitles.map(String).slice(0, 30) : [],
    description: String(input.description || '').slice(0, 12000),
    coverUrl: input.coverUrl || null,
    authors: Array.isArray(input.authors) ? input.authors.map(String).slice(0, 50) : [],
    artists: Array.isArray(input.artists) ? input.artists.map(String).slice(0, 50) : [],
    genres: Array.isArray(input.genres) ? input.genres.map(String).slice(0, 80) : [],
    tags: Array.isArray(input.tags) ? input.tags.map(String).slice(0, 100) : [],
    publicationStatus: input.publicationStatus || 'unknown',
    releaseYear: Number.isFinite(Number(input.releaseYear)) ? Number(input.releaseYear) || null : null,
    language: input.language || null,
    sourceUrl: input.sourceUrl || null,
    contentRating: input.contentRating || 'unknown',
    createdAt: input.createdAt || now,
    updatedAt: now
  };
}

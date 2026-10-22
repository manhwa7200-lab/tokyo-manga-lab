// Pure helpers: translate between AniList data and this app's vocabulary.
const REMOTE_TO_LOCAL = Object.freeze({ CURRENT: 'reading', REPEATING: 'reading', PLANNING: 'planned', COMPLETED: 'completed', PAUSED: 'paused', DROPPED: 'dropped' });
const LOCAL_TO_REMOTE = Object.freeze({ reading: 'CURRENT', planned: 'PLANNING', completed: 'COMPLETED', paused: 'PAUSED', dropped: 'DROPPED' });

export const toLocalStatus = remote => REMOTE_TO_LOCAL[remote] || null;
export const toRemoteStatus = local => LOCAL_TO_REMOTE[local] || null;

const MANGADEX_TITLE = /^https?:\/\/(?:www\.)?mangadex\.org\/title\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i;

// AniList lists MangaDex as an external link on many titles. That gives an exact match with no title guessing.
export function extractMangaDexId(externalLinks) {
  if (!Array.isArray(externalLinks)) return null;
  for (const link of externalLinks) {
    if (String(link?.site || '').toLowerCase() !== 'mangadex') continue;
    const match = MANGADEX_TITLE.exec(String(link?.url || ''));
    if (match) return match[1].toLowerCase();
  }
  return null;
}

export function normalizeRemoteEntry(entry) {
  const media = entry?.media;
  const mediaId = media?.id ?? entry?.mediaId;
  const status = toLocalStatus(entry?.status);
  if (mediaId == null || !status) return null;
  const title = media?.title?.english || media?.title?.romaji || media?.title?.native || 'Untitled';
  const alternateTitles = [media?.title?.romaji, media?.title?.native].filter(text => text && text !== title);
  const mangadexId = extractMangaDexId(media?.externalLinks);
  const base = {
    title,
    alternateTitles,
    description: String(media?.description || ''),
    coverUrl: media?.coverImage?.large || null,
    genres: Array.isArray(media?.genres) ? media.genres : [],
    tags: Array.isArray(media?.genres) ? media.genres : [],
    releaseYear: media?.startDate?.year || null,
    contentType: 'manga',
    contentRating: 'unknown'
  };
  const item = mangadexId
    ? { ...base, sourceId: 'mangadex', externalId: mangadexId, sourceUrl: `https://mangadex.org/title/${mangadexId}`, anilistId: String(mediaId) }
    : { ...base, sourceId: 'anilist', externalId: String(mediaId), sourceUrl: media?.siteUrl || `https://anilist.co/manga/${mediaId}` };
  return {
    mediaId: String(mediaId),
    entryId: entry?.id ?? null,
    status,
    remoteStatus: entry.status,
    progress: Number(entry?.progress) || 0,
    updatedAtMs: (Number(entry?.updatedAt) || 0) * 1000,
    isAdult: Boolean(media?.isAdult),
    mangadexId,
    item
  };
}

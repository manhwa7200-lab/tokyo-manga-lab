import { getRecord, putMany, putRecord } from '../../data/database.js';

const LEGACY_KEY = 'tokyo-manga-lab-v1';
const LOCAL_PROFILE_ID = 'local-default';
const makeId = () => globalThis.crypto?.randomUUID ? crypto.randomUUID() : `tml-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

/** Import the earlier localStorage library once, before the app starts using IndexedDB. */
export async function migrateLegacyLocalStorage() {
  const marker = await getRecord('schemaMeta', 'legacyLocalStorageMigrated');
  if (marker?.value) return { migrated: false, count: 0 };

  let parsed = null;
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (raw) parsed = JSON.parse(raw);
  } catch (error) {
    console.warn('Legacy library could not be parsed; preserving the original browser storage.', error);
  }

  const saved = Array.isArray(parsed?.saved) ? parsed.saved : [];
  const reading = Array.isArray(parsed?.reading) ? parsed.reading : [];
  const oldItems = parsed?.items && typeof parsed.items === 'object' ? parsed.items : {};
  const ids = [...new Set([...saved, ...reading].map(String))];
  const contentItems = [];
  const sourceEntries = [];
  const libraryEntries = [];
  const now = new Date().toISOString();

  for (const oldId of ids) {
    let oldItem = oldItems[oldId] || null;
    let sourceId = oldItem?.sourceId ? 'mangadex' : 'local-legacy';
    let externalId = oldItem?.sourceId || oldItem?.externalId || null;
    if (!externalId && oldId.startsWith('mdx-')) {
      sourceId = 'mangadex';
      externalId = oldId.slice(4);
    }
    const canonicalId = makeId();
    const title = oldItem?.title || (sourceId === 'mangadex' ? `Previously saved MangaDex title (${String(externalId).slice(0, 8)})` : `Imported legacy title (${oldId})`);
    const item = {
      id: canonicalId,
      sourceId,
      externalId: externalId ? String(externalId) : null,
      contentType: 'manga',
      title,
      alternateTitles: [],
      description: oldItem?.summary || '',
      coverUrl: oldItem?.mangaDexCoverUrl || oldItem?.coverUrl || null,
      authors: oldItem?.author ? [String(oldItem.author)] : [],
      artists: [],
      genres: Array.isArray(oldItem?.genres) ? oldItem.genres : [],
      tags: Array.isArray(oldItem?.tags) ? oldItem.tags : [],
      publicationStatus: 'unknown',
      releaseYear: oldItem?.year || null,
      language: null,
      sourceUrl: oldItem?.mangaDexUrl || (externalId && sourceId === 'mangadex' ? `https://mangadex.org/title/${encodeURIComponent(externalId)}` : null),
      contentRating: 'unknown',
      createdAt: now,
      updatedAt: now,
      legacyId: oldId
    };
    contentItems.push(item);
    if (externalId && sourceId === 'mangadex') {
      sourceEntries.push({ id: `mangadex:${externalId}`, contentItemId: canonicalId, sourceId: 'mangadex', externalId: String(externalId), sourceUrl: item.sourceUrl, sourceTitle: item.title, language: null, availabilityStatus: 'unknown', lastCheckedAt: null });
    }
    libraryEntries.push({
      id: `${LOCAL_PROFILE_ID}:${canonicalId}`,
      profileId: LOCAL_PROFILE_ID,
      contentItemId: canonicalId,
      personalStatus: reading.includes(oldId) ? 'reading' : 'planned',
      isFavorite: false,
      userRating: null,
      customTitle: null,
      notes: `Migrated from previous local library ID: ${oldId}`,
      addedAt: now,
      updatedAt: now
    });
  }

  if (contentItems.length) {
    await putMany('contentItems', contentItems);
    await putMany('libraryEntries', libraryEntries);
    if (sourceEntries.length) await putMany('sourceEntries', sourceEntries);
  }
  await putRecord('schemaMeta', { key: 'legacyLocalStorageMigrated', value: true, migratedAt: now, count: contentItems.length });
  // Keep the legacy key as a safety copy. The migration never deletes or overwrites it.
  return { migrated: contentItems.length > 0, count: contentItems.length };
}

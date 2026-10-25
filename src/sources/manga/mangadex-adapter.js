import { apiClient } from '../../services/api-client.js';

function slug(value) {
  return String(value || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function normalizeStatus(value) {
  const status = String(value || '').toLowerCase();
  if (status === 'ongoing' || status === 'releasing') return 'releasing';
  if (status === 'completed') return 'completed';
  if (status === 'hiatus') return 'hiatus';
  return 'unknown';
}

function normalizeManga(raw) {
  const externalId = String(raw.externalId || raw.id || '');
  const tags = Array.isArray(raw.tags) ? raw.tags.map(String).filter(Boolean) : [];
  const authors = Array.isArray(raw.authors) ? raw.authors.map(String).filter(Boolean) : [];
  const artists = Array.isArray(raw.artists) ? raw.artists.map(String).filter(Boolean) : [];
  return {
    id: `mangadex:${externalId}`,
    sourceId: 'mangadex',
    externalId,
    contentType: 'manga',
    title: String(raw.title || 'Untitled manga'),
    alternateTitles: Array.isArray(raw.alternateTitles) ? raw.alternateTitles : [],
    description: String(raw.description || ''),
    coverUrl: raw.coverUrl || null,
    authors,
    artists,
    genres: Array.isArray(raw.genres) ? raw.genres.map(slug) : tags.map(slug),
    tags: tags.slice(0, 12),
    publicationStatus: normalizeStatus(raw.status || raw.publicationStatus),
    releaseYear: raw.releaseYear ?? raw.year ?? null,
    language: raw.language || raw.originalLanguage || null,
    sourceUrl: raw.sourceUrl || raw.mangaDexUrl || `https://mangadex.org/title/${encodeURIComponent(externalId)}`,
    contentRating: raw.contentRating || 'unknown',
    anilistId: /^\d{1,9}$/.test(String(raw.anilistId ?? '')) ? String(raw.anilistId) : null
  };
}

export const mangaDexAdapter = Object.freeze({
  id: 'mangadex',
  label: 'MangaDex',
  contentTypes: ['manga'],
  capabilities: { search: true, titleDetails: true, chapters: true, chapterContent: true, offlineDownloads: false },
  async search(query = '', page = 1, { signal } = {}) {
    const payload = await apiClient.mangaSearch({ query, page, signal });
    if (!payload || !Array.isArray(payload.data)) throw new Error('MangaDex returned data in an unexpected format.');
    const items = payload.data.map(normalizeManga).filter(item => item.externalId);
    const total = Math.max(0, Number(payload.total) || 0);
    const limit = Math.max(1, Number(payload.limit) || 24);
    const pageNumber = Math.max(1, Number(payload.page) || Number(page) || 1);
    return { items, pagination: { page: pageNumber, limit, total, hasNext: pageNumber * limit < total }, source: 'mangadex' };
  },
  async details(externalId, { signal } = {}) {
    const payload = await apiClient.mangaDetails(externalId, { signal });
    if (!payload?.data || payload.data.sourceId !== 'mangadex') throw new Error('MangaDex returned invalid title details.');
    return normalizeManga(payload.data);
  },
  // Returns where the page images live (never the images themselves). They load straight from MangaDex.
  async chapterPages(chapterExternalId, { signal } = {}) {
    return apiClient.chapterPages(chapterExternalId, { signal });
  },
  async chapters(externalId, { page = 1, language = 'en', pageSize, signal } = {}) {
    const payload = await apiClient.mangaChapters(externalId, { page, language, limit: pageSize, signal });
    if (!Array.isArray(payload?.data) || !payload?.pagination) throw new Error('MangaDex returned an invalid chapter list.');
    const limit = Math.max(1, Number(payload.pagination.limit) || 24);
    const pageNumber = Math.max(1, Number(payload.pagination.page) || Number(page) || 1);
    const total = Math.max(0, Number(payload.pagination.total) || payload.data.length);
    return {
      items: payload.data.map(chapter => ({
        id: `mangadex-chapter:${String(chapter.externalId || '')}`,
        sourceId: 'mangadex',
        externalId: String(chapter.externalId || ''),
        mangaExternalId: String(chapter.mangaExternalId || externalId),
        chapterNumber: chapter.chapterNumber ?? null,
        volumeNumber: chapter.volumeNumber ?? null,
        title: chapter.title || '',
        language: chapter.language || language,
        pages: Math.max(0, Number(chapter.pages) || 0),
        publishedAt: chapter.publishedAt || null,
        scanlationGroups: Array.isArray(chapter.scanlationGroups) ? chapter.scanlationGroups : [],
        sourceUrl: chapter.sourceUrl || `https://mangadex.org/chapter/${encodeURIComponent(String(chapter.externalId || ''))}`
      })).filter(chapter => chapter.externalId),
      pagination: payload.pagination || { page: pageNumber, limit, total, hasNext: pageNumber * limit < total },
      source: 'mangadex'
    };
  },
  // Loads a title's chapter list page after page (100 at a time when the Worker allows it), so the app can sort and
  // filter the whole list. Stops after `maxPages` and says whether anything is left (`nextPage`).
  async allChapters(externalId, { language = 'en', signal, startPage = 1, maxPages = 12, onPage } = {}) {
    const items = [];
    let page = startPage;
    let total = 0;
    for (let loaded = 0; loaded < maxPages; loaded += 1) {
      const result = await this.chapters(externalId, { page, language, pageSize: 100, signal });
      items.push(...result.items);
      total = Math.max(total, Number(result.pagination?.total) || 0);
      if (onPage) onPage({ items: [...items], total });
      if (!result.pagination?.hasNext || !result.items.length) return { items, total: Math.max(total, items.length), nextPage: null };
      page += 1;
    }
    return { items, total, nextPage: page };
  }
});

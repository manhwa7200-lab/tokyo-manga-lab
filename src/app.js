import { AppController } from './core/app-controller.js';
import { bindNavigation, getCurrentRoute, getRouteParam } from './core/router.js';
import { getAllRecords, openDatabase } from './data/database.js';
import {
  addItemToCollection, addToLibrary, cacheCatalogueItems, createCollection,
  exportBackup, getCatalogueItems, getCollections, getLibraryItems,
  getCollectionLibraryItems, importBackup, removeFromLibrary, setLibraryStatus, toggleFavorite
} from './data/repositories/library-repository.js';
import { sourceRegistry } from './sources/source-registry.js';
import { adultActive, configureAdult } from './services/api-client.js';
import { isNativeApp as runningInApp } from './features/anilist/anilist-native.js';
import { loadSettings, saveSetting } from './features/settings/settings-service.js';
import { migrateLegacyLocalStorage } from './features/settings/legacy-migration.js';
import { getDashboardStatistics } from './features/statistics/statistics-service.js';
import { escapeHtml, formatDate, slug, truncate } from './shared/utils.js';
import { hydrateIcons, icon } from './shared/icons.js';
import { APP_VERSION } from './shared/app-info.js';
import { CHAPTER_LANGUAGES, SETTINGS_CATEGORIES, findCategory } from './features/settings/settings-schema.js';
import { PROFILE_GROUPS, plannedProfileRows } from './features/profile/profile-sections.js';
import { featuresFor } from './features/feature-registry.js';
import { mountReader, renderReaderShell } from './features/reader/reader-view.js';
import { isChapterId, normalizePagesPayload } from './features/reader/reader-pages.js';
import { resetTips } from './features/reader/reader-features.js';
import { ANILIST_TOKEN_DEFAULT_TTL_SECONDS, AUTH_ATTEMPT_MAX_AGE_MS, DEFAULT_ANILIST_CLIENT_ID } from './features/anilist/anilist-config.js';
import { buildAuthorizeUrl, looksLikeToken, parseAuthRedirect } from './features/anilist/anilist-auth.js';
import { clearAuthAttempt, getAccount, getAuthAttempt, markAuthAttempt } from './features/anilist/anilist-store.js';
import { closeAuthPage, isNativeApp, listenForAppLinks, openAuthPage } from './features/anilist/anilist-native.js';
import { connectWithToken, describeAccount, describeSummary, disconnect as disconnectAniList, flushOutbox, notifyLocalChange, runSync } from './features/anilist/anilist-sync.js';

const root = document.getElementById('appView');
const state = {
  route: 'home', settings: null, results: [], pagination: { page: 1, limit: 24, total: 0, hasNext: false },
  query: '', page: 1, genre: 'all', searchLoading: true, apiError: '', offlineResults: false,
  library: [], libraryById: new Map(), libraryStatusFilter: 'all', collections: [], selectedCollectionId: '',
  anilist: { account: null, status: { connected: false, expired: false, label: 'Not connected' }, busy: false },
  readerContext: null, readerHandle: null, readerReturnHash: '#library',
  detailsItemId: null, detailsSequence: 0, chapterSequence: 0, detailsLoading: false, detailsLoadingChapters: false, detailsMetadataError: '', detailsError: '', detailsChapters: [], detailsChapterPage: 1, detailsChapterLanguage: 'en', detailsChapterPagination: { page: 1, limit: 24, total: 0, hasNext: false }, searchSequence: 0, searchTimer: null, searchController: null, lastSearchTime: null
};

const app = new AppController({
  root,
  renderers: {
    home: renderHome,
    discover: renderDiscover,
    library: renderLibrary,
    downloads: renderDownloads,
    profile: renderProfile,
    settings: renderSettings,
    read: renderReader
  },
  afterRender: { read: mountCurrentReader },
  beforeLeave: { read: unmountReader }
});

// ---- Reader -----------------------------------------------------------------------------
const READER_CONTEXT_KEY = 'tml-reader-context';

function renderReader() { return renderReaderShell(); }

function readStoredReaderContext(chapterId) {
  try {
    const stored = JSON.parse(sessionStorage.getItem(READER_CONTEXT_KEY) || 'null');
    return stored && Array.isArray(stored.chapters) && stored.chapters.some(chapter => chapter.id === chapterId) ? stored : null;
  } catch { return null; }
}

function storeReaderContext(context) {
  try { sessionStorage.setItem(READER_CONTEXT_KEY, JSON.stringify(context)); } catch { /* optional convenience only */ }
}

function unmountReader() {
  state.readerHandle?.destroy();
  state.readerHandle = null;
}

function mountCurrentReader() {
  unmountReader();
  const host = document.getElementById('readerRoot');
  const chapterId = getRouteParam();
  if (!host) return;
  if (!isChapterId(chapterId)) {
    host.innerHTML = '<div class="reader-status"><h2>Chapter not found</h2><p>That reader link is not valid.</p><div class="reader-status-actions"><a class="button" href="#library">Back to library</a></div></div>';
    return;
  }
  const context = state.readerContext?.chapters?.some(chapter => chapter.id === chapterId) ? state.readerContext : readStoredReaderContext(chapterId);
  state.readerContext = context;
  state.readerHandle = mountReader(host, {
    chapterId,
    context,
    settings: state.settings,
    loadPages: async (id, { signal } = {}) => {
      const adapter = sourceRegistry.get('mangadex');
      if (!adapter?.chapterPages) throw new Error('This source cannot provide chapter pages.');
      return normalizePagesPayload(await adapter.chapterPages(id, { signal }));
    },
    onClose: closeReader,
    onOpenSettings: () => { window.location.hash = '#settings/reading'; },
    onOpenChapter: id => { window.location.replace(`#read/${id}`); },
    onSetting: async (key, value) => {
      try { await saveSetting(key, value); state.settings = { ...state.settings, [key]: value }; }
      catch (error) { console.warn('Reader setting not saved:', error); }
    }
  });
}

function closeReader() {
  const returnTo = state.readerReturnHash || '#library';
  const itemId = state.readerContext?.contentItemId || null;
  unmountReader();
  window.location.hash = returnTo === '#read' || returnTo.startsWith('#read/') ? '#library' : returnTo;
  // Reopen the title sheet the reader was started from, after the screen behind it has rendered.
  if (itemId) window.setTimeout(() => openDetails(itemId), 80);
}

function startReading(chapterId) {
  if (!isChapterId(chapterId)) return;
  const item = currentDetailsItem();
  const chapters = state.detailsChapters
    .filter(chapter => chapter.externalId && isChapterId(chapter.externalId))
    .map(chapter => {
      const volume = chapter.volumeNumber ? `Vol. ${chapter.volumeNumber} · ` : '';
      const number = chapter.chapterNumber !== null && chapter.chapterNumber !== '' ? `Chapter ${chapter.chapterNumber}` : 'Extra / oneshot';
      return { id: chapter.externalId, number: chapter.chapterNumber ?? null, label: `${volume}${number}${chapter.title ? ` — ${chapter.title}` : ''}`, pages: chapter.pages, groups: chapter.scanlationGroups || [] };
    });
  state.readerContext = { contentItemId: item?.id || null, title: item?.title || 'Reading', chapters };
  storeReaderContext(state.readerContext);
  state.readerReturnHash = window.location.hash && !window.location.hash.startsWith('#read') ? window.location.hash : '#library';
  closeDetails();
  window.location.hash = `#read/${chapterId}`;
}

function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2600);
}

function setConnectionStatus(status, label) {
  const el = document.getElementById('connectionStatus');
  el.dataset.state = status;
  el.title = label;
  el.setAttribute('aria-label', label);
  el.innerHTML = `<span class="status-dot"></span><span class="status-text">${escapeHtml(label)}</span>`;
}

// Replace broken remote covers with a local visual fallback without blocking the card.
document.addEventListener('error', event => {
  const img = event.target;
  if (!(img instanceof HTMLImageElement) || !img.hasAttribute('data-cover-fallback') || img.dataset.fallbackDone === '1') return;
  img.dataset.fallbackDone = '1';
  const title = img.dataset.coverFallback || 'Cover unavailable';
  const fallback = document.createElement('div');
  fallback.className = img.classList.contains('library-cover') ? 'library-cover library-cover-fallback' : 'cover-placeholder';
  const glyph = document.createElement('span');
  glyph.className = 'glyph';
  glyph.textContent = Array.from(title)[0] || '漫';
  const label = document.createElement('strong');
  label.textContent = truncate(title, 56);
  const note = document.createElement('small');
  note.textContent = 'Cover unavailable';
  fallback.append(glyph, label, note);
  img.replaceWith(fallback);
}, true);

function titleAuthor(item) {
  return (item.authors || []).join(', ') || 'Unknown creator';
}

function coverMarkup(item, compact = false) {
  const cover = item.coverUrl;
  if (cover) {
    return `<img ${compact ? 'class="library-cover"' : ''} loading="lazy" alt="Cover of ${escapeHtml(item.title)}" src="${escapeHtml(cover)}" data-cover-fallback="${escapeHtml(item.title)}">`;
  }
  if (compact) return `<div class="library-cover library-cover-fallback">漫</div>`;
  const titleInitial = Array.from(item.title || '漫')[0];
  return `<div class="cover-placeholder" aria-label="Cover placeholder for ${escapeHtml(item.title)}"><span class="glyph">${escapeHtml(titleInitial)}</span><strong>${escapeHtml(truncate(item.title, 56))}</strong><small>${item.sourceId === 'mangadex' ? 'MANGADEX' : 'LOCAL LIBRARY'}</small></div>`;
}

function getLibraryEntry(itemId) {
  return state.libraryById.get(itemId) || null;
}

function renderMangaCard(item) {
  const entry = getLibraryEntry(item.id);
  const saved = Boolean(entry);
  const title = escapeHtml(item.title);
  const id = escapeHtml(item.id);
  const status = entry && entry.personalStatus !== 'planned' ? `<span class="card-status">${escapeHtml(entry.personalStatus)}</span>` : '';
  return `<article class="manga-card" data-content-id="${id}">
    <div class="poster-wrap">
      <button class="poster" type="button" data-action="details" data-id="${id}" aria-label="Open details for ${title}">${coverMarkup(item)}</button>
      <button class="card-save ${saved ? 'saved' : ''}" type="button" data-action="save" data-id="${id}" aria-pressed="${saved}" aria-label="${saved ? 'Remove from library' : 'Add to library'}: ${title}">${icon(saved ? 'bookmarkFill' : 'bookmark')}</button>
      ${status}
    </div>
    <div class="card-body"><h3 class="card-title">${title}</h3><p class="card-meta">${escapeHtml(titleAuthor(item))}</p></div>
  </article>`;
}

// One row in a grouped list. Used by Profile, Settings and the planned-feature lists.
function listRow({ icon: iconName = '', title, description = '', href = '', action = '', attrs = '', planned = false, badge = '', trail = '', external = false }) {
  const tile = iconName ? `<span class="row-icon">${icon(iconName)}</span>` : '';
  const label = badge || (planned ? 'Planned' : '');
  const inner = `${tile}<span class="row-copy"><strong>${escapeHtml(title)}${label ? `<span class="badge-planned">${escapeHtml(label)}</span>` : ''}</strong>${description ? `<small>${escapeHtml(description)}</small>` : ''}</span>${trail ? `<span class="row-trail">${trail}</span>` : ''}`;
  const cls = `row${planned ? ' is-planned' : ''}`;
  if (href) return `<a class="${cls}" href="${escapeHtml(href)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${inner}</a>`;
  if (action) return `<button class="${cls}" type="button" data-action="${escapeHtml(action)}" ${attrs}>${inner}</button>`;
  return `<div class="${cls}"${planned ? ' aria-disabled="true"' : ''}>${inner}</div>`;
}

function renderRoadmap(screen) {
  const list = featuresFor(screen);
  if (!list.length) return '';
  return `<details class="roadmap"><summary>${icon('sparkle')}<span>Planned for this screen</span>${icon('chevronRight')}</summary><div class="group">${list.map(feature => listRow({ icon: feature.icon, title: feature.title, description: feature.description, planned: true })).join('')}</div></details>`;
}

function renderEmpty(title, message, action = '') {
  return `<div class="empty-state"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span>${action ? `<div style="margin-top:14px">${action}</div>` : ''}</div>`;
}

function renderStats(stats) {
  const cells = [[stats.totalTitles, 'In library'], [stats.reading, 'Reading'], [stats.completed, 'Completed'], [stats.favorites, 'Favourites']];
  return `<div class="stat-strip" role="list">${cells.map(([value, label]) => `<div role="listitem"><strong>${Number(value) || 0}</strong><span>${label}</span></div>`).join('')}</div>`;
}

function searchControls() {
  const genres = [
    ['all', 'All'], ['action', 'Action'], ['adventure', 'Adventure'], ['fantasy', 'Fantasy'],
    ['romance', 'Romance'], ['mystery', 'Mystery'], ['sci-fi', 'Sci-fi'], ['slice-of-life', 'Slice of life']
  ];
  return `<div class="chip-row" role="group" aria-label="Filter results by genre">${genres.map(([id, label]) => `<button class="filter-chip ${state.genre === id ? 'active' : ''}" type="button" data-action="genre-filter" data-genre="${id}" aria-pressed="${state.genre === id}">${label}</button>`).join('')}</div>`;
}

function filteredResults() {
  if (state.genre === 'all') return state.results;
  return state.results.filter(item => (item.genres || []).includes(state.genre) || (item.tags || []).some(tag => slug(tag) === state.genre));
}

function resultsGrid() {
  const items = filteredResults();
  if (state.searchLoading && !state.results.length) return `<div class="empty-state"><span class="spinner"></span><strong style="margin-top:14px">Searching MangaDex…</strong><span>Getting the catalogue ready.</span></div>`;
  if (!items.length && state.offlineResults) return renderEmpty('No cached matches', 'The catalogue is offline and no locally cached titles match this search. Your saved library is still available.', '<button class="button" data-action="retry-search">Retry online search</button>');
  if (!items.length) return renderEmpty('No matching manga', 'Try a shorter search or another tag.', '<button class="button" data-action="clear-search">Clear search</button>');
  return `<div class="content-grid">${items.map(item => renderMangaCard(item)).join('')}</div>`;
}

function paginationMarkup() {
  if (state.offlineResults || state.pagination.total <= state.pagination.limit || !state.results.length) return '';
  const totalPages = Math.max(1, Math.min(20, Math.ceil(state.pagination.total / state.pagination.limit)));
  return `<div class="page-controls"><button class="button" data-action="page-back" ${state.page <= 1 ? 'disabled' : ''}>‹ Previous</button><div class="page-count"><strong>Page ${state.page} of ${totalPages}</strong>${Number(state.pagination.total).toLocaleString()} results</div><button class="button" data-action="page-next" ${!state.pagination.hasNext ? 'disabled' : ''}>Next ›</button></div>`;
}

function renderStatusBanner() {
  if (!state.apiError) return '';
  return `<div class="notice ${state.offlineResults ? '' : 'warning'}" role="status"><strong>${state.offlineResults ? 'Offline catalogue mode.' : 'Catalogue note.'}</strong> ${escapeHtml(state.apiError)} <button class="mini-link" data-action="retry-search">Retry</button></div>`;
}

async function renderHome() {
  await refreshLibraryIndex();
  const stats = await getDashboardStatistics();
  const continuing = state.library.filter(row => row.personalStatus === 'reading').slice(0, 12).map(row => row.item);
  const fresh = state.results.slice(0, 12);
  const continueBlock = continuing.length
    ? `<div class="rail">${continuing.map(item => renderMangaCard(item)).join('')}</div>`
    : `<div class="shelf-empty">${icon('bookmark')}<p><strong>Nothing in progress</strong>Add a title and mark it as reading to find it here.</p><a class="button-subtle" href="#discover">Discover</a></div>`;
  const freshBlock = state.searchLoading && !fresh.length
    ? '<div class="empty-state"><span class="spinner"></span><strong>Loading catalogue</strong></div>'
    : fresh.length ? `<div class="rail">${fresh.map(item => renderMangaCard(item)).join('')}</div>` : renderEmpty('Catalogue not loaded', 'Open Discover to try again.');
  return `<section>
    <div class="page-head"><div><h1>Home</h1><p>Pick up where you left off.</p></div></div>
    <form class="search-bar" data-form="search"><label class="sr-only" for="homeSearch">Search manga titles</label><input class="field" id="homeSearch" name="query" type="search" autocomplete="off" maxlength="100" placeholder="Search manga" value="${escapeHtml(state.query)}"><button class="button-primary" type="submit">Search</button></form>
    <div class="section-head"><h2>Continue reading</h2><a class="more" href="#library">Library${icon('chevronRight', 'icon-sm')}</a></div>${continueBlock}
    <div class="section-head"><h2>From MangaDex</h2><a class="more" href="#discover">See all${icon('chevronRight', 'icon-sm')}</a></div>${freshBlock}
    ${renderStats(stats)}
    ${renderStatusBanner()}
    ${renderRoadmap('home')}
    <p class="footer-note">Tokyo Manga Lab ${escapeHtml(APP_VERSION)} · Tokyo Brotherhood</p>
  </section>`;
}

async function renderDiscover() {
  await refreshLibraryIndex();
  return `<section>
    <div class="page-head"><div><h1>Discover</h1><p>Search the MangaDex catalogue.</p></div></div>
    <div class="search-panel"><form class="search-bar" data-form="search"><label class="sr-only" for="discoverSearch">Search manga titles</label><input class="field" id="discoverSearch" name="query" type="search" autocomplete="off" maxlength="100" placeholder="Title, series or keyword" value="${escapeHtml(state.query)}"><button class="button-primary" type="submit">Search</button></form>${searchControls()}<p class="search-note">Genre chips filter the results already loaded on this page.</p></div>
    <div class="section-head"><div><h2>${state.query ? `Results for “${escapeHtml(state.query)}”` : 'Latest from MangaDex'}</h2><p>${state.offlineResults ? 'Showing cached titles saved on this device.' : `${Number(state.pagination.total).toLocaleString()} titles found`}</p></div><button class="button button-small" data-action="retry-search">Refresh</button></div>
    ${renderStatusBanner()}${resultsGrid()}${paginationMarkup()}
    ${renderRoadmap('discover')}
    <p class="footer-note">Metadata, covers and chapter pages belong to their sources and creators.</p>
  </section>`;
}

async function renderLibrary() {
  await refreshLibraryIndex();
  const syncLinks = new Map((await getAllRecords('syncLinks')).map(row => [row.contentItemId, row]));
  state.collections = await getCollections();
  let entries = state.library;
  if (state.libraryStatusFilter !== 'all') entries = entries.filter(row => row.personalStatus === state.libraryStatusFilter);
  if (state.selectedCollectionId) {
    const collectionRows = await getCollectionLibraryItems(state.selectedCollectionId);
    const ids = new Set(collectionRows.map(row => row.contentItemId));
    entries = entries.filter(row => ids.has(row.contentItemId));
  }
  const sort = state.settings?.defaultLibrarySort || 'recently-updated';
  if (sort === 'recently-added') entries = [...entries].sort((a, b) => String(b.addedAt).localeCompare(String(a.addedAt)));
  else if (sort === 'title') entries = [...entries].sort((a, b) => String(a.item.title).localeCompare(String(b.item.title)));
  const statuses = [['all', 'All statuses'], ['reading', 'Reading'], ['planned', 'Planned'], ['completed', 'Completed'], ['paused', 'Paused'], ['dropped', 'Dropped']];
  const collectionChips = `<div class="chip-row" role="group" aria-label="Collections"><button class="collection-chip ${!state.selectedCollectionId ? 'active' : ''}" data-action="select-collection" data-id="">All titles</button>${state.collections.map(c => `<button class="collection-chip ${state.selectedCollectionId === c.id ? 'active' : ''}" data-action="select-collection" data-id="${escapeHtml(c.id)}">${escapeHtml(c.name)}</button>`).join('')}</div>`;
  const listMarkup = entries.length ? `<div class="library-list">${entries.map(row => {
    const item = row.item;
    const id = escapeHtml(item.id);
    const options = ['planned', 'reading', 'completed', 'paused', 'dropped'].map(s => `<option value="${s}" ${row.personalStatus === s ? 'selected' : ''}>${s.charAt(0).toUpperCase()}${s.slice(1)}</option>`).join('');
    return `<article class="library-card"><button class="poster-link" type="button" data-action="details" data-id="${id}" aria-label="Open details for ${escapeHtml(item.title)}">${coverMarkup(item, true)}</button><div class="library-info"><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(titleAuthor(item))} · Added ${escapeHtml(formatDate(row.addedAt))}</p>${row.isFavorite ? '<span class="pill-label accent">Favourite</span> ' : ''}${syncLinks.has(item.id) ? `<span class="pill-label">AniList${syncLinks.get(item.id).remoteProgress ? ` · ch. ${Number(syncLinks.get(item.id).remoteProgress)}` : ''}</span>` : ''}</div><div class="library-actions"><label class="sr-only" for="status-${id}">Status for ${escapeHtml(item.title)}</label><select class="select-field" id="status-${id}" data-library-status="${id}">${options}</select><button class="button button-small" data-action="favorite" data-id="${id}">${row.isFavorite ? 'Unfavourite' : 'Favourite'}</button><button class="button button-small" data-action="add-collection" data-id="${id}">Collection</button><button class="button button-small button-danger" data-action="remove" data-id="${id}">Remove</button></div></article>`;
  }).join('')}</div>` : renderEmpty('Your library is empty', 'Search MangaDex and save titles to build your shelf.', '<a class="button-primary" href="#discover">Discover manga</a>');
  const collectionName = state.selectedCollectionId ? escapeHtml(state.collections.find(c => c.id === state.selectedCollectionId)?.name || 'Collection') : 'All titles';
  return `<section>
    <div class="page-head"><div><h1>Library</h1><p>${collectionName} · saved on this device</p></div><button class="button-primary button-small" data-action="create-collection">${icon('plus', 'icon-sm')}Collection</button></div>
    ${collectionChips}
    <div class="toolbar"><label class="sr-only" for="statusFilter">Filter by status</label><select class="select-field" id="statusFilter" data-action="status-filter">${statuses.map(([value, label]) => `<option value="${value}" ${state.libraryStatusFilter === value ? 'selected' : ''}>${label}</option>`).join('')}</select><span class="count">${entries.length} title${entries.length === 1 ? '' : 's'}</span></div>
    ${listMarkup}
    ${renderRoadmap('library')}
    <p class="footer-note">Removing a title keeps its cached metadata, bookmarks and imported files.</p>
  </section>`;
}

async function renderDownloads() {
  const rows = await (await import('./data/database.js')).getAllRecords('downloadJobs');
  const info = [
    { icon: 'download', title: 'Offline chapters', description: 'The catalogue API provides metadata only, so there is nothing to download yet.', planned: true },
    { icon: 'database', title: 'Local storage', description: 'Downloaded pages and imported files will be tracked apart from catalogue data.' },
    { icon: 'clock', title: 'Download queue', description: `${rows.length} task${rows.length === 1 ? '' : 's'} recorded on this device.` }
  ];
  return `<section>
    <div class="page-head"><div><h1>Downloads</h1><p>Offline reading, when sources allow it.</p></div></div>
    <div class="group">${info.map(row => listRow(row)).join('')}</div>
    ${rows.length ? `<h2 class="group-title">Tasks</h2><div class="library-list">${rows.map(job => `<div class="library-card"><div class="library-cover library-cover-fallback">${icon('download')}</div><div class="library-info"><h3>${escapeHtml(job.status || 'Task')}</h3><p>${escapeHtml(job.lastError || 'Download task')}</p><span class="pill-label">${Number(job.bytesDownloaded || 0).toLocaleString()} bytes</span></div></div>`).join('')}</div>` : renderEmpty('Nothing downloaded yet', 'Download status and storage use will show here.')}
    ${renderRoadmap('downloads')}
  </section>`;
}

function chartMarkup(stats) {
  if (!stats.hasReadingSessions) return `<div class="chart-empty">Reading activity charts will begin tracking actual reading sessions after the chapter reader is connected. Library changes are not counted as reading time.</div>`;
  const max = Math.max(1, ...stats.daily.map(day => day.sessions));
  return `<div class="chart" role="img" aria-label="Reading sessions over the last seven days">${stats.daily.map(day => `<div class="chart-column"><span class="bar-value">${day.sessions}</span><div class="bar" style="height:${Math.max(3, day.sessions / max * 88)}px"></div><small>${escapeHtml(day.label)}</small></div>`).join('')}</div>`;
}

async function renderProfile() {
  const stats = await getDashboardStatistics();
  await refreshAniList();
  const chevron = icon('chevronRight');
  const groups = PROFILE_GROUPS.map(group => `<h2 class="group-title">${escapeHtml(group.title)}</h2><div class="group">${group.rows.map(row => listRow({ icon: row.icon, title: row.title, description: row.description, href: row.href, trail: chevron })).join('')}</div>`).join('');
  const planned = plannedProfileRows().map(row => listRow({ icon: row.icon, title: row.title, description: row.description, planned: true, action: 'planned-feature', attrs: `data-title="${escapeHtml(row.title)}"` })).join('');
  return `<section>
    <div class="identity"><div class="identity-avatar" aria-hidden="true">東</div><div><h1>Local reader</h1><p>Your library lives on this device.</p>${state.anilist.status.connected ? `<span class="pill-label accent">${escapeHtml(state.anilist.status.label.replace('Connected as ', 'AniList: '))}</span>` : '<span class="pill-label">No account needed</span>'}</div></div>
    ${renderStats(stats)}
    ${groups}
    <h2 class="group-title">Reading activity</h2>
    <div class="group"><div class="surface-pad">${chartMarkup(stats)}<div class="divider"></div><p style="margin:0;font-size:.8rem">${stats.completedChapters} chapters completed · ${Math.round(stats.activeSessionSeconds / 60)} minutes of active reading. Time only counts once the reader is connected.</p></div></div>
    <h2 class="group-title">Coming later</h2>
    <div class="group">${planned}</div>
    <p class="footer-note">Tokyo Manga Lab ${escapeHtml(APP_VERSION)}</p>
  </section>`;
}


// ---------- AniList ----------
async function refreshAniList() {
  state.anilist.account = await getAccount();
  state.anilist.status = describeAccount(state.anilist.account);
}

const anilistClientId = () => String(state.settings?.anilistClientId || DEFAULT_ANILIST_CLIENT_ID || '').trim();

async function startAniListSignIn() {
  if (!isNativeApp()) { toast('One-tap sign-in works in the Android app. In a browser, use "Paste a token instead".'); return; }
  const url = buildAuthorizeUrl(anilistClientId());
  await markAuthAttempt();
  await openAuthPage(url);
}

async function finishAniListConnect(tokenInfo) {
  const account = await connectWithToken(tokenInfo);
  await refreshAniList();
  toast(`Connected to AniList as ${account.viewer.name}.`);
  if (!state.settings.anilistPushEnabled && window.confirm('Also save the status changes you make here on AniList? Sync never deletes anything. You can change this in Settings.')) {
    await saveSetting('anilistPushEnabled', true);
    state.settings = { ...state.settings, anilistPushEnabled: true };
  }
  if (window.location.hash === '#settings/account') await app.navigate('settings');
  else window.location.hash = '#settings/account';
}

// Android hands tokyomangalab://anilist-auth#access_token=... back to the app. Accept it only right after we started sign-in.
async function handleAniListRedirect(urlString) {
  const parsed = parseAuthRedirect(urlString);
  if (!parsed.ok && parsed.reason === 'not-ours') return;
  await closeAuthPage();
  const attempt = await getAuthAttempt();
  await clearAuthAttempt();
  if (!attempt || Date.now() - attempt.startedAt > AUTH_ATTEMPT_MAX_AGE_MS) { toast('That sign-in link was not expected. Start sign-in from Settings.'); return; }
  if (!parsed.ok) { toast(parsed.reason === 'denied' ? 'AniList sign-in was cancelled.' : 'AniList did not send a sign-in token. Try again.'); return; }
  try { await finishAniListConnect(parsed); }
  catch (error) { console.error(error); toast(error?.message || 'Could not finish AniList sign-in.'); }
}

async function pasteAniListToken() {
  const raw = window.prompt('Paste your AniList access token:');
  if (raw === null) return;
  const token = raw.trim();
  if (!looksLikeToken(token)) { toast('That does not look like an AniList token.'); return; }
  await finishAniListConnect({ accessToken: token, expiresAt: Date.now() + ANILIST_TOKEN_DEFAULT_TTL_SECONDS * 1000 });
}

async function signOutAniList() {
  if (!window.confirm('Sign out of AniList on this device? Your library stays as it is.')) return;
  await disconnectAniList();
  await refreshAniList();
  await app.navigate('settings');
  toast('Signed out of AniList.');
}

async function syncAniList() {
  if (state.anilist.busy) return;
  state.anilist.busy = true;
  const say = text => { const out = document.getElementById('anilistResult'); if (out) out.textContent = text; };
  try {
    say('Starting sync');
    const summary = await runSync({
      pushEnabled: Boolean(state.settings.anilistPushEnabled),
      allowAdult: Boolean(state.settings.adultContentEnabled),
      confirmPush: count => window.confirm(`Add or update ${count} title${count === 1 ? '' : 's'} on your AniList account from this app? Nothing is deleted.`),
      onProgress: say
    });
    await refreshAniList();
    await refreshLibraryIndex();
    await app.navigate('settings');
    say(describeSummary(summary));
    toast('AniList sync finished.');
  } catch (error) {
    console.error(error);
    await refreshAniList();
    await app.navigate('settings');
    say(error?.message || 'AniList sync failed.');
  } finally { state.anilist.busy = false; }
}

// After a status change here: queue it for AniList when push is on and the title has an exact AniList id.
function queueAniListPush(contentItemId) {
  if (!state.settings?.anilistPushEnabled || !state.anilist.status.connected) return;
  notifyLocalChange(contentItemId).catch(error => { console.warn('AniList push not queued:', error); });
}

function dynamicValue(name) {
  if (name === 'anilistStatus') return state.anilist.status.label;
  if (name === 'ratings') return adultActive() ? 'Includes adult (Android app only)' : 'Safe and suggestive';
  if (name === 'anilistLastSync') {
    const last = state.anilist.account?.lastSync;
    return last ? `${new Date(last.at).toLocaleString()}` : 'Not synced yet';
  }
  return '';
}

function itemVisible(item) {
  if (item.when === 'anilistConnected') return state.anilist.status.connected;
  if (item.when === 'anilistDisconnected') return !state.anilist.status.connected;
  return true;
}

function settingRow(item) {
  const s = state.settings;
  if (item.type === 'planned') return listRow({ title: item.title, description: item.description, planned: true });
  if (item.type === 'link') return listRow({ title: item.title, description: item.description, href: item.href, external: true, trail: icon('external', 'icon-sm') });
  const copy = `<span class="row-copy"><strong>${escapeHtml(item.title)}</strong>${item.description ? `<small>${escapeHtml(item.description)}</small>` : ''}</span>`;
  if (item.type === 'toggle') {
    return `<label class="row">${copy}<span class="row-trail"><span class="switch"><input type="checkbox" data-setting="${item.key}" ${s[item.key] ? 'checked' : ''}><span class="switch-track"></span></span></span></label>`;
  }
  if (item.type === 'select') {
    const options = item.options.map(([value, label]) => `<option value="${escapeHtml(value)}" ${s[item.key] === value ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('');
    return `<div class="row">${copy}<span class="row-trail"><label class="sr-only" for="set-${item.key}">${escapeHtml(item.title)}</label><select class="select-field" id="set-${item.key}" data-setting="${item.key}">${options}</select></span></div>`;
  }
  if (item.type === 'text') {
    return `<div class="row">${copy}<span class="row-trail"><label class="sr-only" for="set-${item.key}">${escapeHtml(item.title)}</label><input class="field text-field" id="set-${item.key}" type="text" inputmode="${escapeHtml(item.inputMode || 'text')}" autocomplete="off" placeholder="${escapeHtml(item.placeholder || '')}" value="${escapeHtml(s[item.key] || '')}" data-setting="${item.key}"></span></div>`;
  }
  if (item.type === 'action') {
    return `<div class="row">${copy}<span class="row-trail"><button class="button button-small ${item.danger ? 'button-danger' : ''}" type="button" data-action="${escapeHtml(item.action)}">${escapeHtml(item.button)}</button></span></div>${item.resultId ? `<p class="row-result" id="${escapeHtml(item.resultId)}" aria-live="polite"></p>` : ''}`;
  }
  const value = item.valueFrom ? dynamicValue(item.valueFrom) : item.value;
  return `<div class="row is-info">${copy}<span class="row-trail"><span class="row-value" title="${escapeHtml(value)}">${escapeHtml(value)}</span></span></div>`;
}

function renderSettingsHome() {
  const row = category => listRow({ icon: category.icon, title: category.title, description: category.summary, href: `#settings/${category.id}`, badge: category.planned ? 'Planned' : '', trail: icon('chevronRight') });
  return `<section>
    <a class="back-link" href="#profile">${icon('chevronLeft')}Profile</a>
    <div class="page-head"><div><h1>Settings</h1><p>Choose a category.</p></div></div>
    <div class="group">${SETTINGS_CATEGORIES.filter(c => !c.planned).map(row).join('')}</div>
    <h2 class="group-title">Coming later</h2>
    <div class="group">${SETTINGS_CATEGORIES.filter(c => c.planned).map(row).join('')}</div>
    <p class="footer-note">Settings are saved on this device.</p>
  </section>`;
}

function renderSettingsCategory(category) {
  const groups = category.groups.map(group => ({ group, items: group.items.filter(itemVisible) })).filter(({ items }) => items.length).map(({ group, items }) => `<h2 class="group-title">${escapeHtml(group.title)}</h2><div class="group">${items.map(settingRow).join('')}</div>`).join('');
  return `<section>
    <a class="back-link" href="#settings">${icon('chevronLeft')}Settings</a>
    <div class="page-head"><div><h1>${escapeHtml(category.title)}</h1><p>${escapeHtml(category.summary)}</p></div></div>
    ${category.planned ? '<div class="notice"><strong>Planned.</strong> These options are not available yet. They are listed so you can see what is coming.</div>' : ''}
    ${groups}
  </section>`;
}

async function renderSettings() {
  if (!state.settings) state.settings = await loadSettings();
  await refreshAniList();
  const category = findCategory(getRouteParam());
  return category ? renderSettingsCategory(category) : renderSettingsHome();
}

async function loadSearch(query = state.query, page = 1) {
  const sequence = ++state.searchSequence;
  if (state.searchController) state.searchController.abort();
  state.searchController = new AbortController();
  state.query = String(query || '').trim().slice(0, 100);
  state.page = Math.max(1, Math.min(20, Number(page) || 1));
  state.searchLoading = true;
  state.results = [];
  state.apiError = '';
  state.offlineResults = false;
  state.genre = state.genre || 'all';
  if (['home', 'discover'].includes(app.currentRoute())) await app.navigate(app.currentRoute());
  try {
    if (state.settings && !state.settings.enableOnlineSearch) throw new Error('Online search is disabled in Settings. Turn it on to search MangaDex.');
    const result = await sourceRegistry.search('mangadex', state.query, state.page, { signal: state.searchController.signal });
    if (sequence !== state.searchSequence) return;
    state.results = await cacheCatalogueItems(result.items);
    state.pagination = result.pagination;
    state.lastSearchTime = new Date().toISOString();
    setConnectionStatus('online', 'MangaDex online');
  } catch (error) {
    if (sequence !== state.searchSequence) return;
    state.apiError = error?.message || 'The catalogue is unavailable.';
    try {
      const local = (await getCatalogueItems()).filter(isRatingVisible);
      const queryLower = state.query.toLowerCase();
      const matched = local.filter(item => `${item.title} ${(item.authors || []).join(' ')} ${(item.tags || []).join(' ')} ${item.description || ''}`.toLowerCase().includes(queryLower));
      state.results = matched.slice(0, 24);
      state.pagination = { page: 1, limit: 24, total: matched.length, hasNext: false };
      state.offlineResults = true;
    } catch {
      state.results = [];
      state.pagination = { page: 1, limit: 24, total: 0, hasNext: false };
    }
    setConnectionStatus('offline', 'Catalogue offline');
  } finally {
    if (sequence === state.searchSequence) {
      state.searchLoading = false;
      await refreshLibraryIndex();
      if (['home', 'discover'].includes(app.currentRoute())) await app.navigate(app.currentRoute());
    }
  }
}

async function refreshLibraryIndex() {
  state.library = await getLibraryItems();
  state.libraryById = new Map(state.library.map(row => [row.contentItemId, row]));
}

function runSearchFromForm(form) {
  const input = form.querySelector('input[name="query"]');
  const query = input?.value || '';
  state.genre = 'all';
  if (app.currentRoute() !== 'discover') window.location.hash = '#discover';
  loadSearch(query, 1);
}

function currentDetailsItem() {
  return [...state.results, ...state.library.map(row => row.item)].find(row => row?.id === state.detailsItemId) || null;
}

function safeMangaDexChapterUrl(value) {
  try {
    const url = new URL(value);
    return url.origin === 'https://mangadex.org' && url.pathname.startsWith('/chapter/') ? url.href : '';
  } catch { return ''; }
}

function safeMangaDexTitleUrl(value) {
  try {
    const url = new URL(value);
    return url.origin === 'https://mangadex.org' && url.pathname.startsWith('/title/') ? url.href : '';
  } catch { return ''; }
}

function safeAniListUrl(value) {
  try {
    const url = new URL(value);
    return url.origin === 'https://anilist.co' && /^\/manga\/\d+/.test(url.pathname) ? url.href : '';
  } catch { return ''; }
}

function chapterApiUnavailableMessage(error) {
  if (error?.status === 404) return 'The deployed Worker needs the new details/chapters API routes from the V1.1 package.';
  if (error?.code === 'NETWORK_ERROR' && ['localhost', '127.0.0.1'].includes(location.hostname)) {
    return 'The local preview may be blocked by the deployed Worker CORS settings. Deploy the reviewed Worker patch and verify its URL as described in DEPLOY-ON-ANDROID.md.';
  }
  return error?.message || 'The chapter metadata API is unavailable.';
}

function chapterLanguageOptions() {
  const current = state.detailsChapterLanguage;
  const all = `<option value="all" ${current === 'all' ? 'selected' : ''}>All languages</option>`;
  return all + CHAPTER_LANGUAGES.map(([value, label]) => `<option value="${value}" ${current === value ? 'selected' : ''}>${label}</option>`).join('');
}

function renderDetailsContent(item) {
  if (!item) return;
  const entry = getLibraryEntry(item.id);
  const safeSourceUrl = item.sourceId === 'mangadex' ? safeMangaDexTitleUrl(item.sourceUrl) : item.sourceId === 'anilist' ? safeAniListUrl(item.sourceUrl) : '';
  const sourceName = item.sourceId === 'anilist' ? 'AniList' : 'MangaDex';
  const sourceLink = safeSourceUrl ? `<a class="button-primary" href="${escapeHtml(safeSourceUrl)}" target="_blank" rel="noopener noreferrer">Open ${sourceName} ↗</a>` : '';
  const metadataNotice = state.detailsMetadataError ? `<div class="notice warning"><strong>Using cached metadata.</strong> ${escapeHtml(state.detailsMetadataError)}</div>` : '';
  const canRead = Boolean(sourceRegistry.get('mangadex')?.capabilities?.chapterContent);
  const chapterRows = state.detailsChapters.map(chapter => {
    const volume = chapter.volumeNumber ? `Vol. ${chapter.volumeNumber} · ` : '';
    const number = chapter.chapterNumber !== null && chapter.chapterNumber !== '' ? `Chapter ${chapter.chapterNumber}` : 'Extra / oneshot';
    const label = `${volume}${number}${chapter.title ? ` — ${chapter.title}` : ''}`;
    const sourceUrl = safeMangaDexChapterUrl(chapter.sourceUrl);
    return `<article class="chapter-row"><div class="chapter-row-main"><strong>${escapeHtml(label)}</strong><small>${escapeHtml(chapter.language || 'Unknown language')} · ${Number(chapter.pages) || 0} pages${chapter.publishedAt ? ` · ${escapeHtml(formatDate(chapter.publishedAt))}` : ''}</small>${chapter.scanlationGroups?.length ? `<small>Group: ${escapeHtml(chapter.scanlationGroups.join(', '))}</small>` : ''}</div><div class="chapter-actions">${canRead && Number(chapter.pages) > 0 ? `<button class="button-primary chapter-read" data-action="read-chapter" data-chapter-id="${escapeHtml(chapter.externalId)}">Read</button>` : ''}${sourceUrl ? `<a class="button chapter-open" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Open on MangaDex">↗</a>` : ''}</div></article>`;
  }).join('');
  let chapterNotice = '';
  if (state.detailsLoadingChapters) chapterNotice = '<div class="empty-state chapter-empty"><span class="spinner"></span><strong>Loading chapter list…</strong><span>Fetching chapter metadata only.</span></div>';
  else if (state.detailsError) chapterNotice = `<div class="notice warning"><strong>Chapter list unavailable.</strong> ${escapeHtml(state.detailsError)} <span>Use the MangaDex source link for the latest chapter list.</span></div>`;
  else if (!state.detailsChapters.length) chapterNotice = '<div class="empty-state chapter-empty"><strong>No chapters in this result.</strong><span>Try another language or open the source page.</span></div>';
  const pagination = state.detailsChapterPagination;
  const pagesMarkup = pagination.total > pagination.limit ? `<div class="page-controls chapter-pager"><button class="button" data-action="chapter-page-back" ${pagination.page <= 1 ? 'disabled' : ''}>‹ Previous</button><div class="page-count"><strong>Page ${pagination.page}</strong>${Number(pagination.total).toLocaleString()} chapters</div><button class="button" data-action="chapter-page-next" ${!pagination.hasNext ? 'disabled' : ''}>Next ›</button></div>` : '';
  document.getElementById('detailsContent').innerHTML = `<div class="details-layout"><div class="details-cover">${coverMarkup(item)}</div><div><span class="eyebrow">${escapeHtml(item.sourceId === 'mangadex' ? 'MangaDex title' : item.sourceId === 'anilist' ? 'AniList title' : 'Local library item')}</span><h2 id="detailsTitle">${escapeHtml(item.title)}</h2><p>${escapeHtml(titleAuthor(item))}${item.releaseYear ? ` · ${escapeHtml(item.releaseYear)}` : ''}</p><div class="tag-row">${(item.tags || []).slice(0, 8).map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</div><p>${escapeHtml(item.description || 'No synopsis is available in the catalogue response.')}</p><p class="muted">Catalogue status: ${escapeHtml(item.publicationStatus || 'unknown')} · Rating: ${escapeHtml(item.contentRating || 'unknown')}</p>${metadataNotice}</div></div><div class="details-actions">${entry ? `<button class="button-subtle" data-action="mark-reading" data-id="${escapeHtml(item.id)}">${entry.personalStatus === 'reading' ? 'Currently reading' : 'Mark as reading'}</button>` : `<button class="button-subtle" data-action="save" data-id="${escapeHtml(item.id)}">Add to library</button>`}${sourceLink}</div><section class="chapter-panel"><div class="section-topline chapter-heading"><div><h3>Chapters</h3><p>Tap Read to open a chapter here. The ↗ button opens it on MangaDex.</p></div><label class="chapter-language-label">Language <select class="select-field" data-action="chapter-language" aria-label="Chapter language">${chapterLanguageOptions()}</select></label></div>${state.detailsLoading ? '<p class="muted">Refreshing title metadata…</p>' : ''}${chapterNotice}${chapterRows ? `<div class="chapter-list">${chapterRows}</div>` : ''}${pagesMarkup}</section><p class="footer-note">Chapter pages load directly from MangaDex. Tokyo Manga Lab does not download, store or re-host them.</p>`;
}

async function loadDetailsChapters(externalId, page = 1, language = state.detailsChapterLanguage, sequence = state.detailsSequence) {
  const adapter = sourceRegistry.get('mangadex');
  if (!adapter?.chapters || !externalId) return;
  const request = ++state.chapterSequence;
  state.detailsLoadingChapters = true;
  state.detailsError = '';
  state.detailsChapterPage = Math.max(1, Number(page) || 1);
  state.detailsChapterLanguage = language;
  renderDetailsContent(currentDetailsItem());
  try {
    const result = await adapter.chapters(externalId, { page: state.detailsChapterPage, language });
    if (request !== state.chapterSequence || sequence !== state.detailsSequence) return;
    state.detailsChapters = result.items;
    state.detailsChapterPagination = result.pagination;
  } catch (error) {
    if (request !== state.chapterSequence || sequence !== state.detailsSequence) return;
    state.detailsChapters = [];
    state.detailsChapterPagination = { page: state.detailsChapterPage, limit: 24, total: 0, hasNext: false };
    state.detailsError = chapterApiUnavailableMessage(error);
  } finally {
    if (request === state.chapterSequence && sequence === state.detailsSequence) {
      state.detailsLoadingChapters = false;
      renderDetailsContent(currentDetailsItem());
    }
  }
}

async function openDetails(contentItemId) {
  const item = [...state.results, ...state.library.map(row => row.item)].find(row => row?.id === contentItemId);
  if (!item) { toast('Title details are not cached yet. Search for it again.'); return; }
  const sequence = ++state.detailsSequence;
  state.detailsItemId = contentItemId;
  state.detailsLoading = true;
  state.detailsLoadingChapters = item.sourceId === 'mangadex';
  state.detailsMetadataError = '';
  state.detailsError = '';
  state.detailsChapters = [];
  state.detailsChapterPage = 1;
  state.detailsChapterLanguage = state.settings?.preferredLanguage || 'en';
  state.detailsChapterPagination = { page: 1, limit: 24, total: 0, hasNext: false };
  renderDetailsContent(item);
  const dialog = document.getElementById('detailsDialog');
  if (!dialog.open && typeof dialog.showModal === 'function') dialog.showModal();
  else if (!dialog.open) dialog.setAttribute('open', '');

  if (item.sourceId !== 'mangadex' || !item.externalId) {
    state.detailsLoading = false;
    state.detailsLoadingChapters = false;
    state.detailsError = 'Chapter listing is available for compatible MangaDex catalogue entries only.';
    renderDetailsContent(item);
    return;
  }

  const adapter = sourceRegistry.get(item.sourceId);
  if (!adapter?.details || !adapter?.chapters) {
    state.detailsLoading = false;
    state.detailsLoadingChapters = false;
    state.detailsError = 'This source does not provide title detail and chapter-list capabilities yet.';
    renderDetailsContent(item);
    return;
  }

  // Fetch details and chapter metadata independently so a partial source failure remains useful.
  const detailsTask = (async () => {
    try {
      const freshRaw = await adapter.details(item.externalId);
      const [fresh] = await cacheCatalogueItems([freshRaw]);
      if (sequence !== state.detailsSequence) return;
      state.results = state.results.map(row => row.sourceId === fresh.sourceId && row.externalId === fresh.externalId ? fresh : row);
      state.library = state.library.map(row => row.contentItemId === fresh.id ? { ...row, item: fresh } : row);
      state.libraryById = new Map(state.library.map(row => [row.contentItemId, row]));
      renderDetailsContent(fresh);
    } catch (error) {
      if (sequence !== state.detailsSequence) return;
      state.detailsMetadataError = chapterApiUnavailableMessage(error);
    } finally {
      if (sequence === state.detailsSequence) {
        state.detailsLoading = false;
        renderDetailsContent(currentDetailsItem() || item);
      }
    }
  })();
  const chaptersTask = loadDetailsChapters(item.externalId, 1, state.detailsChapterLanguage, sequence);
  await Promise.allSettled([detailsTask, chaptersTask]);
}

function closeDetails() {
  state.detailsSequence += 1;
  state.chapterSequence += 1;
  state.detailsLoading = false;
  state.detailsLoadingChapters = false;
  const dialog = document.getElementById('detailsDialog');
  if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open');
}

async function toggleLibrary(itemId) {
  const item = [...state.results, ...state.library.map(row => row.item)].find(row => row?.id === itemId);
  if (!item) { toast('Title unavailable. Search again to reload its metadata.'); return; }
  const existing = getLibraryEntry(itemId);
  if (existing) {
    await removeFromLibrary(itemId);
    toast('Removed from your library. Progress and cached metadata are preserved.');
  } else {
    await addToLibrary(item, 'planned');
    queueAniListPush(item.id);
    toast('Added to your local library.');
  }
  await refreshLibraryIndex();
  await app.navigate(app.currentRoute());
  if (document.getElementById('detailsDialog').open) openDetails(itemId);
}

async function markReading(itemId) {
  const item = [...state.results, ...state.library.map(row => row.item)].find(row => row?.id === itemId);
  if (!item) { toast('Title unavailable. Search again to reload its metadata.'); return; }
  await setLibraryStatus(item, 'reading');
  queueAniListPush(item.id);
  await refreshLibraryIndex();
  toast('Status saved as Reading.');
  await app.navigate(app.currentRoute());
  if (document.getElementById('detailsDialog').open) openDetails(itemId);
}

async function createNewCollection() {
  const name = window.prompt('Name your collection (for example, Weekend reads):');
  if (name === null) return null;
  const collection = await createCollection(name);
  state.selectedCollectionId = collection.id;
  state.collections = await getCollections();
  await app.navigate('library');
  toast('Collection created.');
  return collection;
}

async function addToCollectionPrompt(contentItemId) {
  if (!state.collections.length) {
    const collection = await createNewCollection();
    if (!collection) return;
    await addItemToCollection(collection.id, contentItemId);
    state.selectedCollectionId = collection.id;
    toast(`Created ${collection.name} and added the title.`);
    await app.navigate('library');
    return;
  }
  const choices = state.collections.map((collection, index) => `${index + 1}. ${collection.name}`).join('\n');
  const raw = window.prompt(`Enter the number of the collection:\n${choices}`);
  if (raw === null) return;
  const index = Number(raw) - 1;
  const collection = state.collections[index];
  if (!collection) { toast('That collection number is not valid.'); return; }
  await addItemToCollection(collection.id, contentItemId);
  state.selectedCollectionId = collection.id;
  toast(`Added to ${collection.name}.`);
  await app.navigate('library');
}

async function downloadBackup() {
  const backup = await exportBackup();
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `tokyo-manga-lab-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  toast('Backup exported. Keep a copy outside this browser.');
}

async function uploadBackupFile(file) {
  if (!file) return;
  if (file.size > 25 * 1024 * 1024) throw new Error('Backup is larger than 25 MB. For safety, import a smaller metadata backup.');
  const data = JSON.parse(await file.text());
  if (!window.confirm('Merge this Tokyo Manga Lab backup into the current local database? Existing records with matching IDs may be updated.')) return;
  await importBackup(data);
  await refreshLibraryIndex();
  state.settings = await loadSettings();
  configureAdult(state.settings.adultContentEnabled);
  applyTheme();
  await app.navigate(app.currentRoute());
  toast('Backup imported. Check your library and settings.');
}

function applyTheme() {
  const isMidnight = state.settings?.theme === 'midnight';
  const root = document.documentElement;
  root.dataset.theme = isMidnight ? 'midnight' : 'sakura';
  root.dataset.coverSize = state.settings?.coverSize === 'compact' ? 'compact' : 'comfortable';
  root.style.colorScheme = 'dark';
  root.classList.toggle('reduce-motion', Boolean(state.settings?.reducedMotion));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isMidnight ? '#070b13' : '#0a0910');
}

// Adult MangaDex ratings: Android app only, off by default, and never age verification.
const ADULT_RATINGS = new Set(['erotica', 'pornographic']);
function isRatingVisible(item) { return !ADULT_RATINGS.has(item?.contentRating) || adultActive(); }

async function handleSettingChange(input) {
  const key = input.dataset.setting;
  if (!key) return;
  const value = input.type === 'checkbox' ? input.checked : input.value;
  if (key === 'adultContentEnabled' && value) {
    if (!runningInApp()) {
      input.checked = false;
      toast('Adult titles are only available in the Android app. The web version stays family-friendly.');
      return;
    }
    if (!window.confirm('Show adult (erotica and pornographic) titles from MangaDex?\n\nThis is only a preference on this device. It is not age verification. Only continue if you are old enough under the laws where you live.')) {
      input.checked = false;
      return;
    }
  }
  await saveSetting(key, value);
  state.settings = { ...state.settings, [key]: value };
  applyTheme();
  if (key === 'adultContentEnabled') {
    configureAdult(value);
    state.results = [];
    await app.navigate(app.currentRoute());
    loadSearch(state.query, 1);
    toast(value ? 'Adult titles enabled in this app.' : 'Adult titles hidden.');
  } else toast('Setting saved on this device.');
}

async function checkApi() {
  const result = document.getElementById('apiTestResult');
  if (result) result.textContent = 'Testing connection…';
  try {
    const adapter = sourceRegistry.get('mangadex');
    if (!adapter) throw new Error('MangaDex adapter is not registered.');
    const { apiClient } = await import('./services/api-client.js');
    const health = await apiClient.health();
    setConnectionStatus('online', 'MangaDex online');
    if (result) result.textContent = `API responded: ${health.service || 'Tokyo Manga Lab catalogue API'}.`;
    toast('Catalogue API is reachable.');
  } catch (error) {
    setConnectionStatus('offline', 'Catalogue offline');
    if (result) result.textContent = error.message || 'The API could not be reached.';
    toast('Catalogue API check failed.');
  }
}

async function handleAction(action, target) {
  const id = target.dataset.id;
  switch (action) {
    case 'toggle-theme': {
      const theme = state.settings?.theme === 'midnight' ? 'sakura' : 'midnight';
      await saveSetting('theme', theme);
      state.settings = { ...state.settings, theme };
      applyTheme();
      toast(theme === 'midnight' ? 'Midnight Blue theme enabled.' : 'Sakura Night theme enabled.');
      if (app.currentRoute() === 'settings') await app.navigate('settings');
      break;
    }
    case 'search-submit': {
      const form = target.closest('form');
      if (form) runSearchFromForm(form);
      break;
    }
    case 'save': await toggleLibrary(id); break;
    case 'mark-reading': await markReading(id); break;
    case 'details': openDetails(id); break;
    case 'close-details': closeDetails(); break;
    case 'read-chapter': startReading(target.dataset.chapterId); break;
    case 'reader-tips-reset': resetTips(); toast('The reader tips will show next time you open a chapter.'); break;
    case 'chapter-page-back': { const item = currentDetailsItem(); if (item?.externalId && state.detailsChapterPagination.page > 1) await loadDetailsChapters(item.externalId, state.detailsChapterPagination.page - 1); break; }
    case 'chapter-page-next': { const item = currentDetailsItem(); if (item?.externalId && state.detailsChapterPagination.hasNext) await loadDetailsChapters(item.externalId, state.detailsChapterPagination.page + 1); break; }
    case 'retry-search': await loadSearch(state.query, state.page); break;
    case 'clear-search': state.genre = 'all'; await loadSearch('', 1); break;
    case 'genre-filter': state.genre = target.dataset.genre || 'all'; await app.navigate('discover'); break;
    case 'page-back': if (state.page > 1) await loadSearch(state.query, state.page - 1); break;
    case 'page-next': if (state.pagination.hasNext) await loadSearch(state.query, state.page + 1); break;
    case 'create-collection': await createNewCollection(); break;
    case 'select-collection': state.selectedCollectionId = target.dataset.id || ''; await app.navigate('library'); break;
    case 'favorite': await toggleFavorite(id); await refreshLibraryIndex(); await app.navigate('library'); toast('Favourite updated.'); break;
    case 'remove': if (window.confirm('Remove this title from your library? Cached metadata, imported files and bookmarks will be preserved.')) { await removeFromLibrary(id); await refreshLibraryIndex(); await app.navigate('library'); toast('Removed from your library.'); } break;
    case 'add-collection': await addToCollectionPrompt(id); break;
    case 'export-backup': await downloadBackup(); break;
    case 'import-backup': document.getElementById('backupFileInput').click(); break;
    case 'open-settings': window.location.hash = '#settings'; break;
    case 'planned-feature': toast(`${target.dataset.title || 'This feature'} is planned and not available yet.`); break;
    case 'check-api': await checkApi(); break;
    case 'anilist-connect': await startAniListSignIn(); break;
    case 'anilist-paste-token': await pasteAniListToken(); break;
    case 'anilist-sync': await syncAniList(); break;
    case 'anilist-disconnect': await signOutAniList(); break;
    case 'retry-screen': await app.navigate(app.currentRoute()); break;
    default: break;
  }
}

function bindUiEvents() {
  document.addEventListener('click', async event => {
    const actionElement = event.target.closest('[data-action]');
    if (!actionElement) return;
    const action = actionElement.dataset.action;
    if (action === 'search-submit') event.preventDefault();
    try { await handleAction(action, actionElement); }
    catch (error) { console.error(error); toast(error?.message || 'That action could not be completed.'); }
  });

  document.addEventListener('submit', event => {
    const form = event.target.closest('form[data-form="search"]');
    if (!form) return;
    event.preventDefault();
    runSearchFromForm(form);
  });

  document.addEventListener('input', event => {
    const input = event.target;
    if (!input.matches('#homeSearch, #discoverSearch')) return;
    state.query = input.value;
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => {
      if (app.currentRoute() !== 'discover') window.location.hash = '#discover';
      loadSearch(state.query, 1);
    }, 550);
  });

  document.addEventListener('change', async event => {
    const input = event.target;
    try {
      if (input.matches('[data-setting]')) await handleSettingChange(input);
      else if (input.matches('[data-library-status]')) {
        const itemId = input.dataset.libraryStatus;
        const row = state.library.find(entry => entry.contentItemId === itemId);
        const item = row?.item || state.results.find(entry => entry.id === itemId);
        if (item) { await setLibraryStatus(item, input.value); queueAniListPush(item.id); await refreshLibraryIndex(); await app.navigate('library'); toast('Reading status updated.'); }
      } else if (input.matches('[data-action="chapter-language"]')) {
        const item = currentDetailsItem();
        if (item?.externalId) await loadDetailsChapters(item.externalId, 1, input.value);
      } else if (input.matches('[data-action="status-filter"]')) {
        state.libraryStatusFilter = input.value;
        await app.navigate('library');
      }
    } catch (error) { console.error(error); toast(error?.message || 'Could not save that change.'); }
  });

  document.getElementById('detailsDialog').addEventListener('click', event => {
    if (event.target === event.currentTarget) closeDetails();
  });
  document.getElementById('backupFileInput').addEventListener('change', async event => {
    const input = event.currentTarget;
    try { await uploadBackupFile(input.files?.[0]); }
    catch (error) { toast(error?.message || 'Could not import backup.'); }
    finally { input.value = ''; }
  });
}

async function initialize() {
  hydrateIcons();
  bindUiEvents();
  try {
    await openDatabase();
    const migration = await migrateLegacyLocalStorage();
    if (migration.migrated) console.info(`Migrated ${migration.count} local library entries from the previous version.`);
    state.settings = await loadSettings();
    configureAdult(state.settings.adultContentEnabled);
    applyTheme();
    await refreshLibraryIndex();
    await refreshAniList();
    await listenForAppLinks(handleAniListRedirect);
    bindNavigation(route => { app.navigate(route); });
    await loadSearch('', 1);
    await app.navigate(getCurrentRoute());
    try {
      const { apiClient } = await import('./services/api-client.js');
      const health = await apiClient.health();
      setConnectionStatus('online', 'MangaDex online');
      console.info('Tokyo Manga Lab API ready:', health.service || 'health check passed');
    } catch (error) {
      setConnectionStatus('offline', 'Catalogue offline');
      console.warn('Catalogue health check failed:', error.message);
    }
    if (state.settings.anilistPushEnabled && state.anilist.status.connected) flushOutbox().catch(error => console.warn('AniList outbox not sent:', error.message));
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('./sw.js').catch(error => console.warn('Offline app-shell registration skipped:', error));
    }
  } catch (error) {
    console.error('Tokyo Manga Lab initialization failed:', error);
    root.innerHTML = `<section class="surface surface-pad"><h2>Local storage could not start</h2><p>${escapeHtml(error.message || 'Your browser could not open the local database.')}</p><p>Open this site through a web server or GitHub Pages and try again in a current browser.</p><button class="button" data-action="retry-screen">Retry</button></section>`;
  }
}

initialize();

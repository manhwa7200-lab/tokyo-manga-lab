import { AppController } from './core/app-controller.js';
import { bindNavigation, getCurrentRoute } from './core/router.js';
import { openDatabase } from './data/database.js';
import {
  addItemToCollection, addToLibrary, cacheCatalogueItems, createCollection,
  exportBackup, getCatalogueItems, getCollections, getLibraryItems,
  getCollectionLibraryItems, importBackup, removeFromLibrary, setLibraryStatus, toggleFavorite
} from './data/repositories/library-repository.js';
import { sourceRegistry } from './sources/source-registry.js';
import { loadSettings, saveSetting } from './features/settings/settings-service.js';
import { migrateLegacyLocalStorage } from './features/settings/legacy-migration.js';
import { getDashboardStatistics } from './features/statistics/statistics-service.js';
import { escapeHtml, formatDate, slug, truncate } from './shared/utils.js';

const root = document.getElementById('appView');
const state = {
  route: 'home', settings: null, results: [], pagination: { page: 1, limit: 24, total: 0, hasNext: false },
  query: '', page: 1, genre: 'all', searchLoading: true, apiError: '', offlineResults: false,
  library: [], libraryById: new Map(), libraryStatusFilter: 'all', collections: [], selectedCollectionId: '',
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
    settings: renderSettings
  }
});

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
  el.innerHTML = `<span class="status-dot"></span>${escapeHtml(label)}`;
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

function renderMangaCard(item, { compact = false } = {}) {
  const entry = getLibraryEntry(item.id);
  const tags = (item.tags || []).slice(0, 3).map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('');
  const savedLabel = entry ? '✓ In library' : '+ Add to library';
  const mainAction = entry
    ? `<button class="button-subtle" data-action="mark-reading" data-id="${escapeHtml(item.id)}">${entry.personalStatus === 'reading' ? 'Reading ✓' : 'Mark reading'}</button>`
    : `<button class="button-subtle" data-action="save" data-id="${escapeHtml(item.id)}">${savedLabel}</button>`;
  return `<article class="manga-card" data-content-id="${escapeHtml(item.id)}">
    <div class="cover" style="--cover-a:#55316f;--cover-b:#24485e">
      <span class="source-badge">${item.sourceId === 'mangadex' ? 'MANGADEX' : 'LOCAL'}</span>
      ${coverMarkup(item)}
    </div>
    <div class="card-body">
      <h3 class="card-title">${escapeHtml(item.title)}</h3>
      <div class="meta"><span title="${escapeHtml(titleAuthor(item))}">${escapeHtml(titleAuthor(item))}</span><span>${escapeHtml(item.releaseYear || 'Year n/a')}</span></div>
      <p class="description">${escapeHtml(truncate(item.description || 'Open the source page for more details.', 130))}</p>
      <div class="tag-row">${tags || '<span class="tag">Manga</span>'}</div>
      <div class="card-actions">
        ${mainAction}
        <button class="button" data-action="details" data-id="${escapeHtml(item.id)}">Details</button>
      </div>
    </div>
  </article>`;
}

function renderEmpty(title, message, action = '') {
  return `<div class="empty-state"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span>${action ? `<div style="margin-top:14px">${action}</div>` : ''}</div>`;
}

function renderStats(stats) {
  const cards = [
    ['▤', stats.totalTitles, 'In your library'],
    ['◌', stats.reading, 'Currently reading'],
    ['✓', stats.completed, 'Completed titles'],
    ['♡', stats.favorites, 'Favourites']
  ];
  return `<div class="stat-grid">${cards.map(([icon, value, label]) => `<div class="stat-card"><span class="stat-icon" aria-hidden="true">${icon}</span><strong>${Number(value) || 0}</strong><span>${label}</span></div>`).join('')}</div>`;
}

function renderItemsGrid(items, emptyTitle = 'Nothing here yet', emptyMessage = 'Search the catalogue and add a title to your library.', action = '') {
  return items.length ? `<div class="content-grid">${items.map(item => renderMangaCard(item)).join('')}</div>` : renderEmpty(emptyTitle, emptyMessage, action);
}

function searchControls() {
  const genres = [
    ['all', 'All'], ['action', 'Action'], ['adventure', 'Adventure'], ['fantasy', 'Fantasy'],
    ['romance', 'Romance'], ['mystery', 'Mystery'], ['sci-fi', 'Sci-fi'], ['slice-of-life', 'Slice of life']
  ];
  return `<div class="filter-row" aria-label="Filter current results by tag">${genres.map(([id, label]) => `<button class="filter-chip ${state.genre === id ? 'active' : ''}" type="button" data-action="genre-filter" data-genre="${id}" aria-pressed="${state.genre === id}">${label}</button>`).join('')}</div>`;
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
  const library = await getLibraryItems();
  const stats = await getDashboardStatistics();
  const continuing = library.filter(row => row.personalStatus === 'reading').slice(0, 4).map(row => row.item);
  const fresh = state.results.slice(0, 8);
  return `<section class="hero-panel">
    <div><div class="eyebrow">Your reading space · Version 1</div><h1>A home for every <span>chapter.</span></h1><p>Discover manga, build your personal library, and keep track of what you want to read next. Your library data stays in this browser.</p>
      <form class="search-bar" data-form="search"><label class="sr-only" for="homeSearch">Search manga titles</label><input class="field" id="homeSearch" name="query" type="search" autocomplete="off" maxlength="100" placeholder="Search MangaDex titles…" value="${escapeHtml(state.query)}"><button class="button-primary" type="submit">Search manga</button></form>
      <div class="filter-row"><span class="pill-label">MangaDex catalogue</span><span class="pill-label">Local-first library</span><span class="pill-label">Sakura Night UI</span></div>
    </div><div class="hero-art" aria-hidden="true"><div class="hero-orbit"></div><div class="hero-kanji">漫画</div></div>
  </section>
  ${renderStats(stats)}
  <section><div class="section-heading"><div><h2>Continue reading</h2><p>Your titles marked as currently reading.</p></div><a class="button" href="#library">Open library</a></div>${renderItemsGrid(continuing, 'Your reading shelf is waiting', 'Add a manga and mark it as reading to see it here.', '<a class="button-primary" href="#discover">Discover manga</a>')}</section>
  <section><div class="section-heading"><div><h2>Fresh from MangaDex</h2><p>Recent catalogue entries. Select Details to inspect a title.</p></div><a class="button" href="#discover">Explore all</a></div>${state.searchLoading && !fresh.length ? '<div class="empty-state"><span class="spinner"></span><strong style="margin-top:12px">Loading catalogue…</strong></div>' : renderItemsGrid(fresh, 'Catalogue not loaded', 'Open Discover to retry the manga catalogue.')}</section>
  ${renderStatusBanner()}
  <p class="footer-note">Tokyo Manga Lab · Tokyo Brotherhood · Created by Hariharasuthan Karunakaran · Preview build 0.3</p>`;
}

async function renderDiscover() {
  return `<section><div class="section-heading"><div><div class="eyebrow">Catalogue</div><h1>Discover manga</h1><p>Search and filter metadata returned by the MangaDex connector.</p></div><span class="pill-label">Source: MangaDex</span></div>
  <div class="search-panel"><form class="search-bar" data-form="search"><label class="sr-only" for="discoverSearch">Search manga titles</label><input class="field" id="discoverSearch" name="query" type="search" autocomplete="off" maxlength="100" placeholder="Title, series or keyword…" value="${escapeHtml(state.query)}"><button class="button-primary" type="submit">Search</button></form>${searchControls()}<p class="muted" style="font-size:.72rem;margin:4px 0 0">Tag filters apply to the currently loaded results page.</p></div>
  <div class="section-topline"><div><h2>${state.query ? `Results for “${escapeHtml(state.query)}”` : 'Latest catalogue entries'}</h2><p>${state.offlineResults ? 'Showing locally cached catalogue data.' : `${Number(state.pagination.total).toLocaleString()} total results when reported by the source.`}</p></div><button class="button" data-action="retry-search">Refresh results</button></div>
  ${renderStatusBanner()}<div style="margin-top:14px">${resultsGrid()}</div>${paginationMarkup()}<p class="footer-note">Catalogue metadata and covers remain attributed to their respective sources. Chapter reading has not been connected in this build.</p></section>`;
}

async function renderLibrary() {
  state.library = await getLibraryItems();
  state.libraryById = new Map(state.library.map(row => [row.contentItemId, row]));
  state.collections = await getCollections();
  let entries = state.library;
  if (state.libraryStatusFilter !== 'all') entries = entries.filter(row => row.personalStatus === state.libraryStatusFilter);
  if (state.selectedCollectionId) {
    const collectionRows = await getCollectionLibraryItems(state.selectedCollectionId);
    const ids = new Set(collectionRows.map(row => row.contentItemId));
    entries = entries.filter(row => ids.has(row.contentItemId));
  }
  const collectionChips = `<button class="collection-chip ${!state.selectedCollectionId ? 'active' : ''}" data-action="select-collection" data-id="">All titles</button>${state.collections.map(c => `<button class="collection-chip ${state.selectedCollectionId === c.id ? 'active' : ''}" data-action="select-collection" data-id="${escapeHtml(c.id)}">${escapeHtml(c.name)}</button>`).join('')}`;
  const listMarkup = entries.length ? `<div>${entries.map(row => {
    const item = row.item;
    return `<article class="library-card"><div>${coverMarkup(item, true)}</div><div class="library-info"><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(titleAuthor(item))} · Added ${formatDate(row.addedAt)}</p><span class="pill-label">${escapeHtml(row.personalStatus)}</span>${row.isFavorite ? '<span class="tag">♥ Favourite</span>' : ''}</div><div class="library-actions"><label class="sr-only" for="status-${escapeHtml(item.id)}">Status for ${escapeHtml(item.title)}</label><select class="select-field" id="status-${escapeHtml(item.id)}" data-library-status="${escapeHtml(item.id)}"><option value="planned" ${row.personalStatus === 'planned' ? 'selected' : ''}>Planned</option><option value="reading" ${row.personalStatus === 'reading' ? 'selected' : ''}>Reading</option><option value="completed" ${row.personalStatus === 'completed' ? 'selected' : ''}>Completed</option><option value="paused" ${row.personalStatus === 'paused' ? 'selected' : ''}>Paused</option><option value="dropped" ${row.personalStatus === 'dropped' ? 'selected' : ''}>Dropped</option></select><button class="button button-small" data-action="favorite" data-id="${escapeHtml(item.id)}">${row.isFavorite ? '♥ Saved' : '♡ Favourite'}</button><button class="button button-small" data-action="add-collection" data-id="${escapeHtml(item.id)}">Add to collection</button><button class="button button-small button-danger" data-action="remove" data-id="${escapeHtml(item.id)}">Remove</button></div></article>`;
  }).join('')}</div>` : renderEmpty('Your library is empty', 'Search MangaDex and add titles to build your personal shelf.', '<a class="button-primary" href="#discover">Discover manga</a>');
  return `<section><div class="section-heading"><div><div class="eyebrow">Your space</div><h1>My library</h1><p>Personal status, favourites and custom collections live on this device.</p></div><button class="button-primary" data-action="create-collection">＋ New collection</button></div>
  <div class="surface surface-pad"><div class="content-toolbar"><label class="field-label" for="statusFilter" style="margin:0">Status</label><select class="select-field" id="statusFilter" data-action="status-filter"><option value="all" ${state.libraryStatusFilter === 'all' ? 'selected' : ''}>All statuses</option><option value="reading" ${state.libraryStatusFilter === 'reading' ? 'selected' : ''}>Reading</option><option value="planned" ${state.libraryStatusFilter === 'planned' ? 'selected' : ''}>Planned</option><option value="completed" ${state.libraryStatusFilter === 'completed' ? 'selected' : ''}>Completed</option><option value="paused" ${state.libraryStatusFilter === 'paused' ? 'selected' : ''}>Paused</option><option value="dropped" ${state.libraryStatusFilter === 'dropped' ? 'selected' : ''}>Dropped</option></select><span class="muted" style="font-size:.75rem">${entries.length} title${entries.length === 1 ? '' : 's'}</span></div><div class="collection-row">${collectionChips}</div></div>
  <div class="section-topline"><div><h2>${state.selectedCollectionId ? escapeHtml(state.collections.find(c => c.id === state.selectedCollectionId)?.name || 'Collection') : 'All library titles'}</h2><p>Changes save in your local database as you make them.</p></div><button class="button" data-action="export-backup">Export backup</button></div>${listMarkup}<p class="footer-note">Removing a title from this library does not delete the cached catalogue metadata, bookmarks or imported files.</p></section>`;
}

async function renderDownloads() {
  const jobs = (await import('./data/database.js')).getAllRecords('downloadJobs');
  const rows = await jobs;
  return `<section><div class="section-heading"><div><div class="eyebrow">Offline shelf</div><h1>Downloads</h1><p>Manage offline content as source and chapter permissions are added.</p></div><span class="pill-label">Foundation only</span></div>
  <div class="surface surface-pad"><div class="feature-list"><div class="feature-row"><span class="feature-icon">⇩</span><div><strong>Offline chapter downloads — planned</strong><small>The current Worker provides catalogue metadata only, not chapter pages. We will add downloads after chapter endpoints and source permissions are verified.</small></div></div><div class="feature-row"><span class="feature-icon">▣</span><div><strong>Local storage</strong><small>Imported book files and downloaded pages will be tracked separately from catalogue metadata, so clearing a cache cannot accidentally delete personal files.</small></div></div><div class="feature-row"><span class="feature-icon">↻</span><div><strong>Download queue</strong><small>${rows.length} queued or recorded download task${rows.length === 1 ? '' : 's'} in this browser.</small></div></div></div></div>
  ${rows.length ? `<div class="section-topline"><h2>Download tasks</h2></div>${rows.map(job => `<div class="library-card"><div class="library-cover library-cover-fallback">⇩</div><div class="library-info"><h3>${escapeHtml(job.status || 'Task')}</h3><p>${escapeHtml(job.lastError || 'Download job record')}</p></div><span class="pill-label">${Number(job.bytesDownloaded || 0).toLocaleString()} bytes</span></div>`).join('')}` : renderEmpty('Nothing downloaded yet', 'When chapter downloads are implemented, their status and storage usage will appear here.')}</section>`;
}

function chartMarkup(stats) {
  if (!stats.hasReadingSessions) return `<div class="chart-empty">Reading activity charts will begin tracking actual reading sessions after the chapter reader is connected. Library changes are not counted as reading time.</div>`;
  const max = Math.max(1, ...stats.daily.map(day => day.sessions));
  return `<div class="chart" role="img" aria-label="Reading sessions over the last seven days">${stats.daily.map(day => `<div class="chart-column"><span class="bar-value">${day.sessions}</span><div class="bar" style="height:${Math.max(3, day.sessions / max * 88)}px"></div><small>${escapeHtml(day.label)}</small></div>`).join('')}</div>`;
}

async function renderProfile() {
  const stats = await getDashboardStatistics();
  return `<section><div class="section-heading"><div><div class="eyebrow">Your account space</div><h1>Profile & statistics</h1><p>This first version stores your profile data locally; account sign-in is a future backend feature.</p></div></div>
  <div class="surface profile-hero"><div class="profile-avatar">東</div><div><h1>Local Reader</h1><p>Tokyo Manga Lab · This device</p><span class="pill-label">No account required</span></div></div>
  ${renderStats(stats)}
  <div class="settings-layout"><section class="surface surface-pad settings-section"><h2>Reading activity</h2><p>Actual reading time and sessions will be counted when manga chapter reading is connected.</p>${chartMarkup(stats)}<div class="divider"></div><div class="feature-list"><div class="feature-row"><span class="feature-icon">✓</span><div><strong>${stats.completedChapters} completed chapters recorded</strong><small>Chapter-level totals become available after chapter tracking is implemented.</small></div></div><div class="feature-row"><span class="feature-icon">◷</span><div><strong>${Math.round(stats.activeSessionSeconds / 60)} minutes of active reading</strong><small>Only verified active session records are included; no time is inferred from a title being marked as reading.</small></div></div></div></section>
  <section class="surface surface-pad settings-section"><h2>Library backup</h2><p>Export your metadata, collections and progress records. Imported or downloaded binary files are not embedded in this JSON backup.</p><div class="feature-list"><button class="button-primary" data-action="export-backup">Export JSON backup</button><button class="button" data-action="import-backup">Import JSON backup</button><button class="button" data-action="open-settings">Privacy & settings</button></div><p style="font-size:.7rem;margin-top:14px">Keep a copy outside this browser before clearing site data.</p></section></div></section>`;
}

async function renderSettings() {
  if (!state.settings) state.settings = await loadSettings();
  const s = state.settings;
  return `<section><div class="section-heading"><div><div class="eyebrow">Make it yours</div><h1>Settings</h1><p>Reader preferences and privacy controls. Some reader features arrive in later phases.</p></div></div>
  <div class="settings-layout"><div class="surface surface-pad settings-section"><h2>Appearance</h2><p>Choose the theme for the Sakura-inspired reading space.</p>
  <div class="toggle-row"><div class="toggle-copy"><strong>Colour theme</strong><small>Sakura Night is the approved default. Midnight Blue keeps the same layout with cooler accents.</small></div><select class="select-field setting-select" data-setting="theme"><option value="sakura" ${s.theme === 'sakura' ? 'selected' : ''}>Sakura Night</option><option value="midnight" ${s.theme === 'midnight' ? 'selected' : ''}>Midnight Blue</option></select></div>
  <div class="toggle-row"><div class="toggle-copy"><strong>Reduce motion</strong><small>Minimize decorative animations and transitions.</small></div><label class="switch"><input type="checkbox" data-setting="reducedMotion" ${s.reducedMotion ? 'checked' : ''}><span class="switch-track"></span></label></div>
  <div class="divider"></div><h2>Content safety & privacy</h2><div class="toggle-row"><div class="toggle-copy"><strong>Adult-content sources</strong><small>Off by default. Turning this preference on does not activate any adult source in this build; the public catalogue connector is still limited to safe and suggestive ratings.</small></div><label class="switch"><input type="checkbox" data-setting="adultContentEnabled" ${s.adultContentEnabled ? 'checked' : ''}><span class="switch-track"></span></label></div>
  <div class="toggle-row"><div class="toggle-copy"><strong>Online catalogue search</strong><small>Allow requests to the configured MangaDex proxy. Your personal library remains locally available when this is off.</small></div><label class="switch"><input type="checkbox" data-setting="enableOnlineSearch" ${s.enableOnlineSearch ? 'checked' : ''}><span class="switch-track"></span></label></div>
  <div class="notice warning" style="margin-top:14px"><strong>Privacy note:</strong> this build has no accounts or cloud sync. Adult-content preference is not age verification, and no explicit-content connector is configured.</div></div>
  <aside class="surface surface-pad settings-section"><h2>Catalogue connection</h2><p>Initial source strategy: MangaDex first, with a modular source-adapter interface.</p><div class="feature-list"><div class="feature-row"><span class="feature-icon">⌕</span><div><strong>MangaDex</strong><small>Search metadata through the existing Cloudflare Worker.</small></div></div><div class="feature-row"><span class="feature-icon">◇</span><div><strong>API base URL</strong><small style="word-break:break-all">${escapeHtml(new URL('./', 'https://tokyo-manga-lab-api2.haribp720.workers.dev').origin)}</small></div></div><div class="feature-row"><span class="feature-icon">↻</span><div><strong>Future connectors</strong><small>Other sources and permitted novel connectors will be added independently after testing.</small></div></div></div><div class="divider"></div><button class="button" data-action="check-api">Test catalogue connection</button><p id="apiTestResult" style="font-size:.75rem;margin-top:11px" aria-live="polite"></p></aside></div>
  <p class="footer-note">Settings are stored in IndexedDB on this device. Use Export backup before clearing browser site data.</p></section>`;
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
      const local = await getCatalogueItems();
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

function chapterApiUnavailableMessage(error) {
  if (error?.status === 404) return 'The deployed Worker needs the new details/chapters API routes from the V1.1 package.';
  if (error?.code === 'NETWORK_ERROR' && ['localhost', '127.0.0.1'].includes(location.hostname)) {
    return 'The local preview may be blocked by the deployed Worker CORS settings. Deploy the reviewed Worker patch and verify its URL as described in DEPLOY-ON-ANDROID.md.';
  }
  return error?.message || 'The chapter metadata API is unavailable.';
}

function renderDetailsContent(item) {
  if (!item) return;
  const entry = getLibraryEntry(item.id);
  const safeSourceUrl = item.sourceId === 'mangadex' ? safeMangaDexTitleUrl(item.sourceUrl) : '';
  const sourceLink = safeSourceUrl ? `<a class="button-primary" href="${escapeHtml(safeSourceUrl)}" target="_blank" rel="noopener noreferrer">Open MangaDex ↗</a>` : '';
  const metadataNotice = state.detailsMetadataError ? `<div class="notice warning"><strong>Using cached metadata.</strong> ${escapeHtml(state.detailsMetadataError)}</div>` : '';
  const chapterRows = state.detailsChapters.map(chapter => {
    const volume = chapter.volumeNumber ? `Vol. ${chapter.volumeNumber} · ` : '';
    const number = chapter.chapterNumber !== null && chapter.chapterNumber !== '' ? `Chapter ${chapter.chapterNumber}` : 'Extra / oneshot';
    const label = `${volume}${number}${chapter.title ? ` — ${chapter.title}` : ''}`;
    const sourceUrl = safeMangaDexChapterUrl(chapter.sourceUrl);
    return `<article class="chapter-row"><div class="chapter-row-main"><strong>${escapeHtml(label)}</strong><small>${escapeHtml(chapter.language || 'Unknown language')} · ${Number(chapter.pages) || 0} pages${chapter.publishedAt ? ` · ${escapeHtml(formatDate(chapter.publishedAt))}` : ''}</small>${chapter.scanlationGroups?.length ? `<small>Group: ${escapeHtml(chapter.scanlationGroups.join(', '))}</small>` : ''}</div>${sourceUrl ? `<a class="button chapter-open" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">Open ↗</a>` : ''}</article>`;
  }).join('');
  let chapterNotice = '';
  if (state.detailsLoadingChapters) chapterNotice = '<div class="empty-state chapter-empty"><span class="spinner"></span><strong>Loading chapter list…</strong><span>Fetching chapter metadata only.</span></div>';
  else if (state.detailsError) chapterNotice = `<div class="notice warning"><strong>Chapter list unavailable.</strong> ${escapeHtml(state.detailsError)} <span>Use the MangaDex source link for the latest chapter list.</span></div>`;
  else if (!state.detailsChapters.length) chapterNotice = '<div class="empty-state chapter-empty"><strong>No chapters in this result.</strong><span>Try another language or open the source page.</span></div>';
  const pagination = state.detailsChapterPagination;
  const pagesMarkup = pagination.total > pagination.limit ? `<div class="page-controls chapter-pager"><button class="button" data-action="chapter-page-back" ${pagination.page <= 1 ? 'disabled' : ''}>‹ Previous</button><div class="page-count"><strong>Page ${pagination.page}</strong>${Number(pagination.total).toLocaleString()} chapters</div><button class="button" data-action="chapter-page-next" ${!pagination.hasNext ? 'disabled' : ''}>Next ›</button></div>` : '';
  document.getElementById('detailsContent').innerHTML = `<div class="details-layout"><div class="details-cover">${coverMarkup(item)}</div><div><span class="eyebrow">${escapeHtml(item.sourceId === 'mangadex' ? 'MangaDex title' : 'Local library item')}</span><h2 id="detailsTitle">${escapeHtml(item.title)}</h2><p>${escapeHtml(titleAuthor(item))}${item.releaseYear ? ` · ${escapeHtml(item.releaseYear)}` : ''}</p><div class="tag-row">${(item.tags || []).slice(0, 8).map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</div><p>${escapeHtml(item.description || 'No synopsis is available in the catalogue response.')}</p><p class="muted">Catalogue status: ${escapeHtml(item.publicationStatus || 'unknown')} · Rating: ${escapeHtml(item.contentRating || 'unknown')}</p>${metadataNotice}</div></div><div class="details-actions">${entry ? `<button class="button-subtle" data-action="mark-reading" data-id="${escapeHtml(item.id)}">${entry.personalStatus === 'reading' ? 'Currently reading' : 'Mark as reading'}</button>` : `<button class="button-subtle" data-action="save" data-id="${escapeHtml(item.id)}">＋ Add to library</button>`}${sourceLink}</div><section class="chapter-panel"><div class="section-topline chapter-heading"><div><h3>Chapters</h3><p>Chapter metadata from MangaDex. Reading opens the original source.</p></div><label class="chapter-language-label">Language <select class="select-field" data-action="chapter-language"><option value="en" ${state.detailsChapterLanguage === 'en' ? 'selected' : ''}>English</option><option value="all" ${state.detailsChapterLanguage === 'all' ? 'selected' : ''}>All languages</option><option value="ja" ${state.detailsChapterLanguage === 'ja' ? 'selected' : ''}>Japanese</option></select></label></div>${state.detailsLoading ? '<p class="muted">Refreshing title metadata…</p>' : ''}${chapterNotice}${chapterRows ? `<div class="chapter-list">${chapterRows}</div>` : ''}${pagesMarkup}</section><p class="footer-note">Tokyo Manga Lab does not proxy chapter pages or download chapter content in this release.</p>`;
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
  state.detailsChapterLanguage = 'en';
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
  const chaptersTask = loadDetailsChapters(item.externalId, 1, 'en', sequence);
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
  await refreshLibraryIndex();
  toast('Status saved as Reading. Chapter reading will connect in a later API phase.');
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
  applyTheme();
  await app.navigate(app.currentRoute());
  toast('Backup imported. Check your library and settings.');
}

function applyTheme() {
  const isMidnight = state.settings?.theme === 'midnight';
  document.documentElement.dataset.theme = isMidnight ? 'midnight' : 'sakura';
  document.documentElement.style.colorScheme = 'dark';
  document.documentElement.classList.toggle('reduce-motion', Boolean(state.settings?.reducedMotion));
}

async function handleSettingChange(input) {
  const key = input.dataset.setting;
  if (!key) return;
  const value = input.type === 'checkbox' ? input.checked : input.value;
  await saveSetting(key, value);
  state.settings = { ...state.settings, [key]: value };
  applyTheme();
  if (key === 'adultContentEnabled' && value) toast('Preference saved. No adult-content source is configured in this build.');
  else toast('Setting saved on this device.');
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
    case 'check-api': await checkApi(); break;
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
        if (item) { await setLibraryStatus(item, input.value); await refreshLibraryIndex(); await app.navigate('library'); toast('Reading status updated.'); }
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
  bindUiEvents();
  try {
    await openDatabase();
    const migration = await migrateLegacyLocalStorage();
    if (migration.migrated) console.info(`Migrated ${migration.count} local library entries from the previous version.`);
    state.settings = await loadSettings();
    applyTheme();
    await refreshLibraryIndex();
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
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('./sw.js').catch(error => console.warn('Offline app-shell registration skipped:', error));
    }
  } catch (error) {
    console.error('Tokyo Manga Lab initialization failed:', error);
    root.innerHTML = `<section class="surface surface-pad"><h2>Local storage could not start</h2><p>${escapeHtml(error.message || 'Your browser could not open the local database.')}</p><p>Open this site through a web server or GitHub Pages and try again in a current browser.</p><button class="button" data-action="retry-screen">Retry</button></section>`;
  }
}

initialize();

(() => {
  'use strict';

  const API = 'https://tokyo-manga-lab-api2.haribp720.workers.dev';
  const ANILIST_API = 'https://graphql.anilist.co';
  const PAGE_SIZE = 24;
  const MAX_PAGE = 20;

  let results = [];
  let total = 0;
  let live = false;
  let loading = false;
  let timer = null;
  let requestId = 0;
  let currentPage = 1;
  let currentTerm = '';
  let anilistAvailable = true;

  try {
    const stored = JSON.parse(localStorage.getItem('tokyo-manga-lab-v1') || '{}');
    state.items = stored.items && typeof stored.items === 'object' ? stored.items : {};
  } catch (_) {
    state.items = {};
  }

  const slug = s => String(s || '').toLowerCase().trim()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const titleKey = s => String(s || '').toLowerCase().trim()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();

  function normalise(m) {
    const tags = Array.isArray(m.tags) ? m.tags : [];
    return {
      id: 'mdx-' + m.id,
      sourceId: m.id,
      title: m.title || 'Untitled manga',
      author: (m.authors || []).join(', ') || 'Unknown author',
      year: m.year || null,
      source: 'MangaDex',
      genres: tags.map(slug),
      tags: tags.slice(0, 6),
      summary: String(m.description || 'Open MangaDex for details.')
        .replace(/\s+/g, ' ').slice(0, 250),
      mangaDexCoverUrl: m.coverUrl || null,
      coverUrl: null,
      coverSource: '',
      mangaDexUrl: m.mangaDexUrl ||
        'https://mangadex.org/title/' + encodeURIComponent(m.id),
      glyph: '漫画',
      colors: ['#482c72', '#1e5871']
    };
  }

  function visible() {
    let pool;
    if (activeFilter === 'library') {
      pool = state.saved.map(id => state.items[id] || DEMO_TITLES.find(t => t.id === id)).filter(Boolean);
    } else {
      pool = live ? results : DEMO_TITLES;
      if (activeFilter !== 'all') {
        pool = pool.filter(t => (t.genres || []).includes(activeFilter) ||
          (t.tags || []).some(tag => slug(tag) === activeFilter));
      }
    }
    const q = String(query || '').toLowerCase();
    return pool.filter(t => [t.title, t.author, ...(t.genres || []), ...(t.tags || []), t.summary]
      .join(' ').toLowerCase().includes(q));
  }

  function ensurePagination() {
    let pager = document.getElementById('pagination');
    if (!pager) {
      pager = document.createElement('div');
      pager.id = 'pagination';
      pager.className = 'pagination';
      pager.setAttribute('aria-live', 'polite');
      const catalogue = document.getElementById('catalogue');
      catalogue.parentNode.insertBefore(pager, catalogue.nextSibling);
    }
    return pager;
  }

  function renderPagination() {
    const pager = ensurePagination();
    if (!live || loading || activeFilter === 'library' || total <= PAGE_SIZE) {
      pager.hidden = true;
      pager.innerHTML = '';
      return;
    }
    const pageCount = Math.max(1, Math.min(MAX_PAGE, Math.ceil(total / PAGE_SIZE)));
    pager.hidden = false;
    const prevDisabled = currentPage <= 1 ? 'disabled' : '';
    const nextDisabled = currentPage >= pageCount ? 'disabled' : '';
    pager.innerHTML = `
      <button class="page-btn" type="button" data-page="${Math.max(1, currentPage - 1)}" ${prevDisabled}>‹ Previous</button>
      <span class="page-status">Page ${currentPage} of ${pageCount}<br><small>${total.toLocaleString()} results</small></span>
      <button class="page-btn" type="button" data-page="${Math.min(pageCount, currentPage + 1)}" ${nextDisabled}>Next ›</button>`;
  }

  window.visibleTitles = visible;

  window.card = function(t) {
    const saved = state.saved.includes(t.id);
    const reading = state.reading.includes(t.id);
    const cover = t.coverUrl
      ? `<img class="cover-image" alt="Cover of ${esc(t.title)}" loading="lazy" src="${esc(t.coverUrl)}" data-cover-title="${esc(t.title)}">`
      : `<div class="cover-fallback"><span class="cover-fallback-glyph">${esc(t.glyph || '漫画')}</span><span class="cover-fallback-title">${esc(t.title)}</span><small>${t.source === 'MangaDex' ? 'Cover preview unavailable here' : 'Sample title'}</small></div>`;
    const tags = (t.tags || []).slice(0, 5).map(tag => `<span class="tag">${esc(tag)}</span>`).join('');
    const link = t.mangaDexUrl
      ? `<a class="source-link" href="${esc(t.mangaDexUrl)}" target="_blank" rel="noopener noreferrer">Open on MangaDex ↗</a>`
      : '';

    return `<article class="card">
      <div class="cover" style="--c1:${esc((t.colors || ['#482c72','#1e5871'])[0])};--c2:${esc((t.colors || ['#482c72','#1e5871'])[1])}">
        <span class="source-badge">${t.coverUrl ? 'COVER · ANILIST' : (t.source === 'MangaDex' ? 'MANGADEX' : 'DEMO DATA')}</span>
        ${cover}
      </div>
      <div class="card-body">
        <h4 class="card-title">${esc(t.title)}</h4>
        <div class="meta"><span>${esc(t.author)}</span><span>${esc(t.year || 'Year unknown')}</span></div>
        ${link}
        <p class="desc">${esc(t.summary || '')}</p>
        <div class="tags">${tags}</div>
        <div class="card-actions">
          <button class="add" data-action="save" data-id="${esc(t.id)}">${saved ? '✓ In library' : '+ Add to library'}</button>
          <button class="read" data-action="read" data-id="${esc(t.id)}">${reading ? 'Reading ✓' : 'Start reading'}</button>
        </div>
      </div>
    </article>`;
  };

  function attachImageFallbacks() {
    document.querySelectorAll('#catalogue img.cover-image').forEach(img => {
      img.addEventListener('error', () => {
        const cover = img.closest('.cover');
        if (!cover || img.dataset.fallbackDone === '1') return;
        img.dataset.fallbackDone = '1';
        const fallback = document.createElement('div');
        fallback.className = 'cover-fallback';
        const glyph = document.createElement('span');
        glyph.className = 'cover-fallback-glyph';
        glyph.textContent = '漫画';
        const title = document.createElement('span');
        title.className = 'cover-fallback-title';
        title.textContent = img.dataset.coverTitle || 'Cover unavailable';
        const note = document.createElement('small');
        note.textContent = 'Open source to view cover';
        fallback.append(glyph, title, note);
        img.replaceWith(fallback);
      }, { once: true });
    });
  }

  window.render = function() {
    const items = visible();
    const catalogue = document.getElementById('catalogue');
    if (loading && activeFilter !== 'library') {
      catalogue.innerHTML = '<div class="empty">Loading MangaDex catalogue…</div>';
    } else if (items.length) {
      catalogue.innerHTML = items.map(window.card).join('');
      attachImageFallbacks();
    } else {
      catalogue.innerHTML = '<div class="empty">No matching manga found. Try another search or filter.</div>';
    }

    document.getElementById('savedCount').textContent = state.saved.length;
    document.getElementById('readingCount').textContent = state.reading.length;
    document.getElementById('catalogueCount').textContent = activeFilter === 'library' ? state.saved.length :
      live ? total.toLocaleString() : DEMO_TITLES.length;
    document.getElementById('listTitle').textContent = activeFilter === 'library' ? 'My library' :
      activeFilter === 'all' ? (live ? 'Discover manga' : 'Sample manga') :
      activeFilter.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    document.getElementById('listSubtitle').textContent = activeFilter === 'library' ? 'Saved in this browser.' :
      live ? 'MangaDex catalogue results. Covers are matched from AniList when available; open MangaDex for source details.' :
      'Sample entries shown while the live catalogue is unavailable.';
    document.querySelectorAll('[data-filter]').forEach(b => b.classList.toggle('active', b.dataset.filter === activeFilter));
    renderPagination();
  };

  async function fetchAniListMedia(term) {
    const queryText = term.trim();
    const gql = queryText
      ? `query ($search: String) { Page(page: 1, perPage: 50) { media(type: MANGA, isAdult: false, search: $search, sort: SEARCH_MATCH) { id title { romaji english native } coverImage { extraLarge large medium } } } }`
      : `query { Page(page: 1, perPage: 50) { media(type: MANGA, isAdult: false, sort: POPULARITY_DESC) { id title { romaji english native } coverImage { extraLarge large medium } } } }`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6500);
    try {
      const response = await fetch(ANILIST_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ query: gql, variables: queryText ? { search: queryText } : {} }),
        signal: controller.signal
      });
      if (!response.ok) throw new Error('AniList HTTP ' + response.status);
      const payload = await response.json();
      return payload && payload.data && payload.data.Page && Array.isArray(payload.data.Page.media)
        ? payload.data.Page.media : [];
    } finally {
      clearTimeout(timeout);
    }
  }

  function matchCover(manga, mediaList) {
    const target = titleKey(manga.title);
    if (!target) return null;
    let best = null;
    let bestScore = 0;
    for (const media of mediaList) {
      const titles = media.title || {};
      const aliases = [titles.english, titles.romaji, titles.native].filter(Boolean).map(titleKey);
      let score = 0;
      if (aliases.includes(target)) score = 100;
      else if (aliases.some(alias => alias.length >= 5 && (target.startsWith(alias + ' ') || alias.startsWith(target + ' ')))) score = 82;
      else {
        const targetWords = new Set(target.split(' ').filter(x => x.length > 2));
        const aliasWords = new Set(aliases.flatMap(x => x.split(' ')).filter(x => x.length > 2));
        const overlap = [...targetWords].filter(x => aliasWords.has(x)).length;
        const ratio = targetWords.size ? overlap / targetWords.size : 0;
        if (ratio >= 0.8 && targetWords.size >= 2) score = 65;
      }
      const cover = media.coverImage && (media.coverImage.large || media.coverImage.extraLarge || media.coverImage.medium);
      if (score > bestScore && cover) {
        bestScore = score;
        best = cover;
      }
    }
    return bestScore >= 65 ? best : null;
  }

  async function loadManga(term, page = 1) {
    const request = ++requestId;
    currentTerm = term.trim();
    currentPage = Math.max(1, Math.min(MAX_PAGE, page));
    query = currentTerm;
    activeFilter = 'all';
    loading = true;
    window.render();

    try {
      const params = new URLSearchParams({ page: String(currentPage) });
      if (currentTerm) params.set('q', currentTerm);

      const response = await fetch(`${API}/manga?${params.toString()}`, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('MangaDex HTTP ' + response.status);
      const payload = await response.json();
      if (request !== requestId) return;
      if (!Array.isArray(payload.data)) throw new Error('Invalid MangaDex response');

      const normalized = payload.data.map(normalise);
      let mediaList = [];
      try {
        mediaList = await fetchAniListMedia(currentTerm);
        anilistAvailable = true;
      } catch (error) {
        anilistAvailable = false;
        console.warn('AniList cover lookup unavailable; using designed placeholders.', error);
      }
      if (request !== requestId) return;

      results = normalized.map(item => {
        const cover = matchCover(item, mediaList);
        return { ...item, coverUrl: cover, coverSource: cover ? 'AniList' : '' };
      });
      total = Number(payload.total) || results.length;
      live = true;
    } catch (error) {
      if (request !== requestId) return;
      live = false;
      console.warn('MangaDex request failed:', error);
      toast('MangaDex unavailable. Showing sample titles.');
    } finally {
      if (request === requestId) {
        loading = false;
        window.render();
      }
    }
  }

  function searchNow(term) {
    clearTimeout(timer);
    loadManga(term.trim(), 1);
  }

  // Create the pager before attaching its click handler.
  ensurePagination();

  document.getElementById('searchBtn').addEventListener('click', e => {
    e.preventDefault();
    e.stopImmediatePropagation();
    searchNow(document.getElementById('searchInput').value);
  }, true);

  document.getElementById('searchInput').addEventListener('input', e => {
    e.stopImmediatePropagation();
    clearTimeout(timer);
    const term = e.currentTarget.value;
    timer = setTimeout(() => loadManga(term.trim(), 1), 500);
  }, true);

  document.getElementById('searchInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopImmediatePropagation();
      searchNow(e.currentTarget.value);
    }
  }, true);

  document.getElementById('pagination').addEventListener('click', e => {
    const button = e.target.closest('[data-page]');
    if (!button || button.disabled) return;
    e.preventDefault();
    loadManga(currentTerm, Number(button.dataset.page) || 1);
    window.scrollTo({ top: document.querySelector('.sectionhead').offsetTop - 20, behavior: 'smooth' });
  });

  document.getElementById('catalogue').addEventListener('click', e => {
    const button = e.target.closest('[data-action]');
    if (!button || !button.dataset.id.startsWith('mdx-')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const id = button.dataset.id;
    const item = visible().find(t => t.id === id) || state.items[id] || results.find(t => t.id === id);
    if (!item) return;
    state.items[id] = { ...item };
    if (button.dataset.action === 'save') {
      state.saved = state.saved.includes(id) ? state.saved.filter(x => x !== id) : [...state.saved, id];
    } else {
      state.reading = state.reading.includes(id) ? state.reading.filter(x => x !== id) : [...state.reading, id];
    }
    saveState();
    window.render();
    toast('Library updated locally');
  }, true);

  const style = document.createElement('style');
  style.textContent = `
    .cover { position:relative; overflow:hidden; }
    .cover-image { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; z-index:1; }
    .cover:before,.cover:after { z-index:2; pointer-events:none; }
    .source-badge { z-index:3; }
    .cover-fallback { position:relative; z-index:1; width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; text-align:center; padding:14px; color:#fff; background:linear-gradient(145deg,var(--c1,#482c72),var(--c2,#1e5871)); }
    .cover-fallback-glyph { font-size:34px; font-weight:900; opacity:.88; text-shadow:0 5px 22px #0007; }
    .cover-fallback-title { font-weight:850; font-size:14px; line-height:1.25; text-shadow:0 3px 12px #0009; }
    .cover-fallback small { color:#ffffffbd; font-size:9px; line-height:1.2; }
    .source-link { display:inline-block; font-size:11px; margin:4px 0; text-decoration:none; color:var(--cyan); }
    .pagination { display:flex; justify-content:center; align-items:center; gap:15px; margin:20px 0 6px; padding:14px 10px; border:1px solid var(--line); border-radius:15px; background:#10101aab; }
    .pagination[hidden] { display:none; }
    .page-btn { border:1px solid #4d3c6b; border-radius:999px; padding:10px 15px; background:#21192f; color:var(--text); font:inherit; font-size:13px; }
    .page-btn:disabled { opacity:.35; cursor:not-allowed; }
    .page-status { min-width:95px; text-align:center; font-weight:750; font-size:13px; }
    .page-status small { color:var(--muted); font-weight:400; }
  `;
  document.head.appendChild(style);

  const searchLabel = document.getElementById('searchBtn');
  if (searchLabel) searchLabel.textContent = 'Search MangaDex';
  const note = document.querySelector('.notice');
  if (note) note.innerHTML = '<strong>Sources:</strong> Catalogue metadata from MangaDex. Covers are matched from AniList when available; when no matching embeddable cover is found, a designed title card is shown. Open MangaDex for its original page and chapter availability. Your library remains local to this browser.';

  ensurePagination();
  loadManga('');
})();

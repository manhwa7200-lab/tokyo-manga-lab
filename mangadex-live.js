(() => {
  'use strict';

  const API = 'https://tokyo-manga-lab-api2.haribp720.workers.dev';
  let results = [], total = 0, live = false, loading = false;
  let timer = null, requestId = 0;

  try {
    const stored = JSON.parse(
      localStorage.getItem('tokyo-manga-lab-v1') || '{}'
    );
    state.items = stored.items || {};
  } catch (_) {
    state.items = {};
  }

  const slug = s => String(s || '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

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
      coverUrl: m.coverUrl || null,
      mangaDexUrl: m.mangaDexUrl ||
        'https://mangadex.org/title/' + encodeURIComponent(m.id),
      glyph: '漫画',
      colors: ['#482c72', '#1e5871']
    };
  }

  function visible() {
    let pool;

    if (activeFilter === 'library') {
      pool = state.saved
        .map(id => state.items[id] ||
          DEMO_TITLES.find(t => t.id === id))
        .filter(Boolean);
    } else {
      pool = live ? results : DEMO_TITLES;

      if (activeFilter !== 'all') {
        pool = pool.filter(t =>
          (t.genres || []).includes(activeFilter) ||
          (t.tags || []).some(tag => slug(tag) === activeFilter)
        );
      }
    }

    const q = String(query || '').toLowerCase();
    return pool.filter(t =>
      [t.title, t.author, ...(t.genres || []),
        ...(t.tags || []), t.summary]
        .join(' ').toLowerCase().includes(q)
    );
  }

  window.visibleTitles = visible;

  window.card = function(t) {
    const saved = state.saved.includes(t.id);
    const reading = state.reading.includes(t.id);

    const cover = t.coverUrl
      ? `<img class="cover-image" alt="" loading="lazy"
             src="${esc(t.coverUrl)}">`
      : `<span class="cover-glyph">${esc(t.glyph || '漫画')}</span>`;

    const tags = (t.tags || []).slice(0, 5)
      .map(tag => `<span class="tag">${esc(tag)}</span>`).join('');

    const link = t.mangaDexUrl
      ? `<a class="source-link" href="${esc(t.mangaDexUrl)}"
           target="_blank" rel="noopener noreferrer">View on MangaDex ↗</a>`
      : '';

    return `<article class="card">
      <div class="cover" style="--c1:#482c72;--c2:#1e5871">
        <span class="source-badge">${t.source === 'MangaDex' ? 'MANGADEX' : 'DEMO DATA'}</span>
        ${cover}
      </div>
      <div class="card-body">
        <h4 class="card-title">${esc(t.title)}</h4>
        <div class="meta">
          <span>${esc(t.author)}</span>
          <span>${esc(t.year || 'Year unknown')}</span>
        </div>
        ${link}
        <p class="desc">${esc(t.summary || '')}</p>
        <div class="tags">${tags}</div>
        <div class="card-actions">
          <button class="add" data-action="save" data-id="${esc(t.id)}">
            ${saved ? '✓ In library' : '+ Add to library'}
          </button>
          <button class="read" data-action="read" data-id="${esc(t.id)}">
            ${reading ? 'Reading ✓' : 'Start reading'}
          </button>
        </div>
      </div>
    </article>`;
  };

  window.render = function() {
    const items = visible();
    const catalogue = document.getElementById('catalogue');

    if (loading && activeFilter !== 'library') {
      catalogue.innerHTML = '<div class="empty">Loading MangaDex…</div>';
    } else if (items.length) {
      catalogue.innerHTML = items.map(window.card).join('');
    } else {
      catalogue.innerHTML =
        '<div class="empty">No matching manga found. Try another search.</div>';
    }

    document.getElementById('savedCount').textContent = state.saved.length;
    document.getElementById('readingCount').textContent = state.reading.length;
    document.getElementById('catalogueCount').textContent =
      activeFilter === 'library' ? state.saved.length :
      live ? total.toLocaleString() : DEMO_TITLES.length;

    document.getElementById('listTitle').textContent =
      activeFilter === 'library' ? 'My library' :
      activeFilter === 'all' ? (live ? 'Discover manga' : 'Sample manga') :
      activeFilter.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    document.getElementById('listSubtitle').textContent =
      activeFilter === 'library' ? 'Saved in this browser.' :
      live ? 'MangaDex catalogue results. Open MangaDex for chapter availability.' :
      'Sample entries shown while the live catalogue is unavailable.';

    document.querySelectorAll('[data-filter]').forEach(b =>
      b.classList.toggle('active', b.dataset.filter === activeFilter)
    );
  };

  async function loadManga(term) {
    const id = ++requestId;
    query = term;
    activeFilter = 'all';
    loading = true;
    window.render();

    try {
      const params = new URLSearchParams({ page: '1' });
      if (term) params.set('q', term);

      const response = await fetch(
        `${API}/manga?${params.toString()}`,
        { headers: { Accept: 'application/json' } }
      );

      if (!response.ok) throw new Error('HTTP ' + response.status);

      const payload = await response.json();
      if (id !== requestId) return;
      if (!Array.isArray(payload.data)) throw new Error('Invalid API response');

      results = payload.data.map(normalise);
      total = Number(payload.total) || results.length;
      live = true;
    } catch (error) {
      if (id !== requestId) return;
      live = false;
      console.warn('MangaDex request failed:', error);
      toast('MangaDex unavailable. Showing sample titles.');
    } finally {
      if (id === requestId) {
        loading = false;
        window.render();
      }
    }
  }

  function searchNow(term) {
    clearTimeout(timer);
    loadManga(term.trim());
  }

  // Handle search before the sample-only listeners.
  document.getElementById('searchBtn').addEventListener('click', e => {
    e.preventDefault();
    e.stopImmediatePropagation();
    searchNow(document.getElementById('searchInput').value);
  }, true);

  document.getElementById('searchInput').addEventListener('input', e => {
    e.stopImmediatePropagation();
    clearTimeout(timer);
    const term = e.currentTarget.value;
    timer = setTimeout(() => loadManga(term.trim()), 450);
  }, true);

  document.getElementById('searchInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopImmediatePropagation();
      searchNow(e.currentTarget.value);
    }
  }, true);

  // Keep live manga metadata in the local library.
  document.getElementById('catalogue').addEventListener('click', e => {
    const b = e.target.closest('[data-action]');
    if (!b || !b.dataset.id.startsWith('mdx-')) return;

    e.preventDefault();
    e.stopImmediatePropagation();

    const id = b.dataset.id;
    const t = visible().find(item => item.id === id) ||
      state.items[id] || results.find(item => item.id === id);

    if (!t) return;
    state.items[id] = { ...t };

    if (b.dataset.action === 'save') {
      state.saved = state.saved.includes(id)
        ? state.saved.filter(x => x !== id)
        : [...state.saved, id];
    } else {
      state.reading = state.reading.includes(id)
        ? state.reading.filter(x => x !== id)
        : [...state.reading, id];
    }

    saveState();
    window.render();
    toast('Library updated locally');
  }, true);

  const style = document.createElement('style');
  style.textContent = `
    .cover { position:relative; overflow:hidden; }
    .cover-image { position:absolute; inset:0; width:100%;
                   height:100%; object-fit:cover; }
    .cover-glyph { position:relative; z-index:1; }
    .source-link { display:inline-block; font-size:11px; margin:4px 0;
                   text-decoration:none; color:var(--cyan); }
  `;
  document.head.appendChild(style);

  loadManga('');
})();

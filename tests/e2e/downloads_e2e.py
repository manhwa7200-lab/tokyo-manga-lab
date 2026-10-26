import json, os, re, time
from playwright.sync_api import sync_playwright
S = os.path.dirname(os.path.abspath(__file__))
os.makedirs(S + '/shots', exist_ok=True)
U = 'http://127.0.0.1:8011/index.html'
MID = '00000000-0000-4000-8000-000000000000'
CH = {n: f'aaaaaaaa-aaaa-4aaa-8aaa-{n:012d}' for n in (1, 2, 3, 4, 5)}
NUM = {1: '1', 2: '2', 3: '2.5', 4: '10', 5: '90'}
IMG = {n: open(f'{S}/pages/p{n}.png', 'rb').read() for n in (1, 2, 3)}
H = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*'}
st = {'pages': [], 'imgs': [], 'reports': [], 'offline': False, 'auth': []}

def chapter(n, pages=3):
    return {'sourceId': 'mangadex', 'externalId': CH[n], 'mangaExternalId': MID, 'chapterNumber': NUM[n], 'volumeNumber': None, 'title': f'Title {n}' if n == 4 else '',
            'language': 'en', 'pages': pages, 'publishedAt': '2025-01-01T00:00:00Z', 'scanlationGroups': ['Test Group'], 'sourceUrl': f'https://mangadex.org/chapter/{CH[n]}'}

def manga():
    return {'id': MID, 'title': 'Download Test', 'description': 'x', 'year': 2024, 'status': 'ongoing', 'contentRating': 'safe', 'authors': ['A'], 'tags': ['Action'], 'coverUrl': None, 'mangaDexUrl': 'https://mangadex.org/title/x'}

def worker(route):
    url = route.request.url
    if st['offline']:
        return route.abort()
    if route.request.method == 'OPTIONS':
        return route.fulfill(status=204, headers=H)
    if url.endswith('/health'):
        return route.fulfill(status=200, content_type='application/json', headers=H, body='{"ok":true}')
    if '/pages' in url:
        st['pages'].append(url)
        cid = re.search(r'chapters/([0-9a-f-]{36})/pages', url).group(1)
        body = {'data': {'chapterId': cid, 'mangaExternalId': MID, 'baseUrl': 'https://node-a.abc.mangadex.network:30000', 'hash': 'abc123def456',
                         'data': ['1.png', '2.png', '3.png'], 'dataSaver': ['s1.jpg', 's2.jpg', 's3.jpg'], 'validForSeconds': 900}}
        return route.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps(body))
    if '/chapters' in url:
        return route.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps({'data': [chapter(n) for n in (5, 4, 3, 2, 1)], 'pagination': {'page': 1, 'limit': 100, 'total': 5, 'hasNext': False}}))
    if '/api/v1/manga/' in url:
        m = manga(); m.update({'sourceId': 'mangadex', 'externalId': MID, 'contentType': 'manga'})
        return route.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps({'data': m}))
    return route.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps({'data': [manga()], 'total': 1, 'limit': 24, 'page': 1}))

def images(route):
    if st['offline']:
        return route.abort()
    st['imgs'].append(route.request.url)
    st['auth'].append(route.request.headers.get('authorization') or route.request.headers.get('cookie'))
    n = int(re.search(r'(\d)\.(png|jpg)$', route.request.url).group(1))
    return route.fulfill(status=200, content_type='image/png', headers={'access-control-allow-origin': '*'}, body=IMG[n])

def report(route):
    if route.request.method == 'OPTIONS':
        return route.fulfill(status=204, headers=H)
    st['reports'].append(json.loads(route.request.post_data))
    return route.fulfill(status=200, headers=H, body='')

def ok(cond, msg):
    print(('PASS ' if cond else 'FAIL ') + msg)
    if not cond:
        raise SystemExit(1)

def open_details(pg):
    pg.goto(U + '#discover'); pg.wait_for_selector('[data-action="details"]', timeout=8000)
    pg.click('[data-action="details"]'); pg.wait_for_selector('.chapter-row', timeout=8000)

def setup(ctx):
    ctx.add_init_script("localStorage.setItem('tml-reader-tips-seen','1')")
    ctx.route('**/*.workers.dev/**', worker)
    ctx.route('**/*.mangadex.network:30000/**', images)
    ctx.route('https://api.mangadex.network/**', report)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, service_workers='block')
    setup(ctx)
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('dialog', lambda d: d.accept())
    open_details(pg)

    # ---- picker -------------------------------------------------------------------------------
    pg.click('.chapter-download-btn'); pg.wait_for_selector('#downloadDialog[open] .dl-row')
    ok(pg.inner_text('#dlTitle') == 'Add to Download', 'picker has the Add to Download title')
    ok(pg.locator('.dl-row').count() == 5, 'one row per chapter')
    labels = [t.split('\n')[0] for t in pg.locator('.dl-row .dl-row-copy strong').all_inner_texts()]
    ok(labels == ['Ch. 90', 'Ch. 10', 'Ch. 2.5', 'Ch. 2', 'Ch. 1'], f'highest chapter first: {labels}')
    ok(pg.locator('#dlGo').is_disabled(), 'Download is disabled with nothing selected')
    ok(pg.inner_text('#dlCount') == '0 Selected', 'footer starts at 0 Selected')
    pg.screenshot(path=S + '/shots/dl-picker-empty.png')
    pg.click('.dl-row >> nth=0')
    ok(pg.inner_text('#dlCount') == '1 Selected' and pg.locator('#dlGo').is_enabled(), 'one tap selects a chapter and enables Download')
    ok(pg.locator('.dl-row >> nth=0').get_attribute('aria-checked') == 'true', 'row exposes checkbox state')
    pg.click('.dl-all')
    ok(pg.inner_text('#dlCount') == '5 Selected' and 'Select None' in pg.inner_text('.dl-all'), 'Select All picks every chapter')
    pg.click('.dl-all')
    ok(pg.inner_text('#dlCount') == '0 Selected', 'second tap clears the pick')
    pg.click('[data-action="download-sort"]')
    first = pg.locator('.dl-row .dl-row-copy strong').first.inner_text().split('\n')[0]
    ok(first == 'Ch. 1', f'sort arrow flips to lowest first: {first}')
    pg.click('[data-action="download-jump-toggle"]'); pg.fill('#dlJump', '10'); pg.press('#dlJump', 'Enter')
    ok(pg.locator('.dl-row.is-flash').count() == 1, 'jump to highlights the chapter')
    ok('Ch. 10' in pg.locator('.dl-row.is-flash').inner_text(), 'jump to found chapter 10')
    pg.click('[data-action="download-sort"]')
    # pick chapters 2 and 1 (rows 4 and 5 in highest-first order)
    pg.click('.dl-row >> nth=3'); pg.click('.dl-row >> nth=4')
    ok(pg.inner_text('#dlCount') == '2 Selected', 'two chapters selected')
    pg.screenshot(path=S + '/shots/dl-picker-selected.png')
    pg.click('#dlGo')
    pg.wait_for_function("() => !document.getElementById('downloadDialog').open")
    ok(pg.evaluate("() => document.getElementById('detailsDialog').open"), 'title sheet is still open behind the picker')
    pg.wait_for_selector('.chapter-saved, .chapter-row:has-text("In download queue")', timeout=8000)

    # ---- queue runs, one chapter at a time, quietly -------------------------------------------
    pg.click('.chapter-download-btn'); pg.wait_for_selector('#downloadDialog[open] .dl-row')
    ok(pg.locator('.dl-row[data-state]:not([data-state=""])').count() == 2, 'queued chapters are marked in the picker')
    ok(pg.locator('.dl-row[data-state="done"], .dl-row[data-state="queued"], .dl-row[data-state="downloading"]').count() == 2, 'marked as downloaded or queued')
    pg.click('.dl-row.is-locked >> nth=0', force=True)   # a locked row does not select
    ok(pg.inner_text('#dlCount') == '0 Selected', 'chapters already in the queue cannot be picked again')
    pg.click('[data-action="download-open-queue"]')
    pg.wait_for_function("() => location.hash === '#downloads'")
    ok(not pg.evaluate("() => document.getElementById('detailsDialog').open"), 'queue icon leaves the title sheet')
    pg.wait_for_selector('.dl-group', timeout=25000)
    pg.wait_for_function("() => document.querySelectorAll('.dl-job').length === 0", timeout=25000)
    ok('2 chapters saved' in pg.inner_text('.dl-summary'), 'summary shows 2 chapters saved')
    ok(len(st['pages']) == 2, f'one page-list request per chapter ({len(st["pages"])})')
    ok(len(st['imgs']) == 6 and all('/data-saver/' in u or 'data-saver' in u for u in st['imgs']), 'data saver pages were fetched by default')
    ok(all(a is None for a in st['auth']), 'image requests carry no cookies or auth headers')
    ok(len(st['reports']) == 6 and all(r['success'] for r in st['reports']), 'every image fetched from a MangaDex node was reported')
    pg.click('.dl-group summary')
    pg.screenshot(path=S + '/shots/dl-downloads.png')
    ok(pg.locator('.dl-chapter').count() == 2, 'both chapters are listed under the title')

    # ---- offline reading ----------------------------------------------------------------------
    st['offline'] = True
    calls, hits = len(st['pages']), len(st['imgs'])
    pg.click('.dl-chapter-open >> nth=0')
    pg.wait_for_selector('.reader-img', timeout=8000)
    pg.wait_for_function("() => [...document.querySelectorAll('.reader-img')].some(i => i.complete && i.naturalWidth > 0)", timeout=8000)
    srcs = pg.eval_on_selector_all('.reader-img', 'els => els.map(e => e.src)')
    ok(all(s.startswith('blob:') for s in srcs if s), 'reader shows saved pages from this phone')
    ok(len(st['pages']) == calls and len(st['imgs']) == hits, 'no network request was needed to read it')
    pg.screenshot(path=S + '/shots/dl-reader-offline.png')
    pg.click('[data-reader="close"]') if pg.locator('[data-reader="close"]').count() else pg.go_back()
    st['offline'] = False
    pg.goto(U + '#downloads'); pg.wait_for_selector('.dl-group')
    ok('#downloads' in pg.url, 'closing the reader returns to Downloads')

    # ---- delete -------------------------------------------------------------------------------
    pg.evaluate("() => document.querySelectorAll('details.dl-group').forEach(d => { d.open = true; })")
    pg.click('[data-action="download-delete"] >> nth=0')
    pg.wait_for_function("() => document.querySelectorAll('.dl-chapter').length === 1")
    pg.click('[data-action="download-delete-all"]')
    pg.wait_for_selector('.empty-state:has-text("Nothing downloaded yet")')
    ok('0 chapters saved' in pg.inner_text('.dl-summary'), 'delete all empties storage')
    ok(pg.evaluate("""async () => { const db = await new Promise(r => { const q = indexedDB.open('tokyo-manga-lab-pages', 1); q.onsuccess = () => r(q.result); });
        return await new Promise(r => { const q = db.transaction('pages').objectStore('pages').count(); q.onsuccess = () => r(q.result); }); }""") == 0, 'saved pages are gone from storage')
    ok(not errs, f'no page errors: {errs}')
    ctx.close()

    # ---- Wi-Fi only ---------------------------------------------------------------------------
    st['pages'].clear(); st['imgs'].clear()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, service_workers='block')
    ctx.add_init_script("Object.defineProperty(navigator, 'connection', { get: () => ({ type: 'cellular', effectiveType: '4g', addEventListener() {} }) })")
    setup(ctx)
    pg = ctx.new_page(); pg.on('dialog', lambda d: d.accept())
    open_details(pg)
    pg.click('.chapter-download-btn'); pg.wait_for_selector('#downloadDialog[open] .dl-row')
    pg.click('.dl-all'); pg.click('#dlGo')
    pg.wait_for_function("() => !document.getElementById('downloadDialog').open")
    pg.goto(U + '#downloads'); pg.wait_for_selector('.dl-job')
    ok('Waiting for Wi-Fi' in pg.inner_text('#downloadsBody'), 'Downloads says it is waiting for Wi-Fi')
    ok(len(st['pages']) == 0 and len(st['imgs']) == 0, 'nothing was fetched on mobile data')
    pg.goto(U + '#settings/downloads'); pg.wait_for_selector('[data-setting="downloadWifiOnly"]')
    pg.evaluate("() => document.querySelector('[data-setting=\"downloadWifiOnly\"]').click()")
    pg.goto(U + '#downloads')
    pg.wait_for_selector('.dl-group', timeout=30000)
    ok(len(st['imgs']) >= 3, 'turning Wi-Fi only off lets the queue run')
    ctx.close(); b.close()
print('downloads e2e ok')

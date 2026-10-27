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
    pg.goto(U + '#recent'); pg.wait_for_selector('.empty-state')
    ok('Nothing here yet' in pg.inner_text('.empty-state'), 'Recent starts empty')
    ok(pg.locator('.mobile-nav a[data-nav="recent"]').count() == 1, 'Recent has its own tab')
    open_details(pg)
    pg.click(f'[data-chapter="{CH[2]}"] [data-action="read-chapter"]')
    pg.wait_for_selector('.reader-img', timeout=8000)
    pg.wait_for_timeout(600)
    pg.go_back() if not pg.locator('[data-reader="close"]').count() else None
    pg.goto(U + '#recent'); pg.wait_for_selector('.recent-row')
    ok(pg.locator('.recent-row').count() == 1, 'the title you read is in Recent')
    text = pg.inner_text('.recent-row')
    ok('Download Test' in text and 'Read to Ch. 2' in text, f'row shows title and chapter: {text!r}')
    ok('today' in pg.inner_text('#appView').lower(), 'grouped under Today')
    pg.screenshot(path=S + '/shots/recent.png')
    # reading another chapter of the same title moves/updates the single row
    pg.click('.recent-open'); pg.wait_for_selector('#detailsDialog[open] .chapter-row')
    pg.click(f'[data-chapter="{CH[4]}"] [data-action="read-chapter"]')
    pg.wait_for_selector('.reader-img', timeout=8000); pg.wait_for_timeout(600)
    pg.goto(U + '#recent'); pg.wait_for_selector('.recent-row')
    ok(pg.locator('.recent-row').count() == 1 and 'Read to Ch. 10' in pg.inner_text('.recent-row'), 'one row per title, updated to the latest chapter')
    pg.click('[data-action="recent-remove"]'); pg.wait_for_selector('.empty-state')
    ok(True, 'a row can be removed')
    # progress is kept when history is cleared
    pg.evaluate("""async () => { const db = await new Promise(r => { const q = indexedDB.open('tokyo-manga-lab'); q.onsuccess = () => r(q.result); });
      return await new Promise(r => { const q = db.transaction('chapterProgress').objectStore('chapterProgress').count(); q.onsuccess = () => r(q.result); }); }""")
    ok(pg.evaluate("""async () => { const db = await new Promise(r => { const q = indexedDB.open('tokyo-manga-lab'); q.onsuccess = () => r(q.result); });
      return await new Promise(r => { const q = db.transaction('chapterProgress').objectStore('chapterProgress').count(); q.onsuccess = () => r(q.result); }); }""") >= 1, 'reading progress is untouched by Recent')
    ok(not errs, f'no page errors: {errs}')
    b.close()
print('recent e2e ok')

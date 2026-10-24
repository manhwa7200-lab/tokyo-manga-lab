import json
from playwright.sync_api import sync_playwright
import os
S = os.path.dirname(os.path.abspath(__file__))
os.makedirs(S + '/shots', exist_ok=True)
U = 'http://127.0.0.1:8011/index.html'
MID = '00000000-0000-4000-8000-000000000000'
C1 = '22222222-2222-4222-8222-222222222222'   # newest
C2 = '33333333-3333-4333-8333-333333333333'   # older
IMG = {n: open(f'{S}/pages/p{n}.png', 'rb').read() for n in (1, 2, 3)}
H = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*'}

state = {'pages_calls': [], 'reports': [], 'img_hits': [], 'fail_first_image': False, 'node': 'node-a', 'blocked': set()}

def manga():
    return {'id': MID, 'title': 'Reader Test', 'description': 'x', 'year': 2024, 'status': 'ongoing', 'contentRating': 'safe',
            'authors': ['A'], 'tags': ['Action'], 'coverUrl': None, 'mangaDexUrl': 'https://mangadex.org/title/x'}

def chapter(cid, num, pages=3):
    return {'sourceId': 'mangadex', 'externalId': cid, 'mangaExternalId': MID, 'chapterNumber': num, 'volumeNumber': None,
            'title': '', 'language': 'en', 'pages': pages, 'publishedAt': '2025-01-01T00:00:00Z', 'scanlationGroups': ['Test Group'],
            'sourceUrl': f'https://mangadex.org/chapter/{cid}'}

def worker(route):
    url = route.request.url
    if route.request.method == 'OPTIONS':
        return route.fulfill(status=204, headers=H)
    if url.endswith('/health'):
        return route.fulfill(status=200, content_type='application/json', headers=H, body='{"ok":true}')
    if '/pages' in url:
        state['pages_calls'].append(url)
        base = f"https://{state['node']}.example.network"
        n = len(state['pages_calls'])
        body = {'data': {'chapterId': C1 if C1 in url else C2, 'mangaExternalId': MID, 'baseUrl': base, 'hash': 'abc123def456',
                         'data': ['1.png', '2.png', '3.png'], 'dataSaver': ['1.jpg', '2.jpg', '3.jpg'], 'validForSeconds': 900}}
        return route.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps(body))
    if '/chapters' in url:
        return route.fulfill(status=200, content_type='application/json', headers=H,
                             body=json.dumps({'data': [chapter(C1, '2'), chapter(C2, '1')], 'pagination': {'page': 1, 'limit': 24, 'total': 2, 'hasNext': False}}))
    if '/api/v1/manga/' in url:
        m = manga(); m.update({'sourceId': 'mangadex', 'externalId': MID, 'contentType': 'manga'})
        return route.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps({'data': m}))
    return route.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps({'data': [manga()], 'total': 1, 'limit': 24, 'page': 1}))

def images(route):
    url = route.request.url
    state['img_hits'].append(url)
    name = url.rsplit('/', 1)[1]
    n = int(name.split('.')[0])
    if state['node'] == 'node-b' and 'node-a' in url:
        return route.fulfill(status=403, body='expired')
    if 'node-a' in url and state['fail_first_image']:
        return route.fulfill(status=403, body='expired')
    return route.fulfill(status=200, content_type='image/png', headers={'access-control-allow-origin': '*'}, body=IMG[n])

def report(route):
    if route.request.method == 'OPTIONS':
        return route.fulfill(status=204, headers=H)
    state['reports'].append({'body': json.loads(route.request.post_data), 'ctype': route.request.headers.get('content-type'),
                             'auth': route.request.headers.get('authorization')})
    return route.fulfill(status=200, headers=H, body='')

def ok(cond, msg):
    print(('PASS ' if cond else 'FAIL ') + msg)
    if not cond:
        raise SystemExit(1)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, service_workers='block')
    ctx.add_init_script("localStorage.setItem('tml-reader-tips-seen','1')")
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    ctx.route('**/*.workers.dev/**', worker)
    ctx.route('**/*.example.network/**', images)
    ctx.route('https://api.mangadex.network/**', report)

    pg.goto(U + '#discover'); pg.wait_for_selector('[data-action="details"]', timeout=8000)
    pg.click('[data-action="details"]'); pg.wait_for_selector('.chapter-row', timeout=8000)
    ok(pg.locator('[data-action="read-chapter"]').count() == 2, 'Read buttons shown for both chapters')
    pg.screenshot(path=S + '/shots/reader-chapters.png')

    # ---- scroll mode (default)
    pg.click(f'[data-action="read-chapter"][data-chapter-id="{C1}"]')
    pg.wait_for_selector('.reader-img', timeout=8000)
    ok(pg.evaluate("location.hash") == f'#read/{C1}', 'hash is #read/<chapter>')
    ok(pg.evaluate("document.body.dataset.route") == 'read', 'body route=read (app chrome hidden)')
    ok(not pg.locator('.topbar').is_visible(), 'topbar hidden while reading')
    pg.wait_for_function("document.querySelectorAll('.reader-img[data-state=done]').length >= 1", timeout=8000)
    pg.wait_for_timeout(600)
    pg.screenshot(path=S + '/shots/reader-scroll.png')
    ok(len(state['pages_calls']) == 1, 'one pages request on open')
    ok(all('/data/abc123def456/' in u for u in state['img_hits']), 'original quality URLs use baseUrl/data/hash/file')
    ok(len(state['reports']) >= 1 and all(r['body']['success'] for r in state['reports']), 'success reports sent to api.mangadex.network')
    ok(all(r['ctype'].startswith('application/json') and r['auth'] is None for r in state['reports']), 'reports are JSON with no auth header')
    ok(set(state['reports'][0]['body']) == {'url', 'success', 'cached', 'bytes', 'duration'}, 'report body has exactly the documented fields')
    ok(pg.evaluate("document.querySelector('.reader-img').referrerPolicy") == 'no-referrer', 'images use no-referrer')

    # scroll to the end: progress + end card
    pg.evaluate("document.querySelector('.reader-stage').scrollTo(0, 1e6)")
    pg.wait_for_timeout(1200)
    ok('End of' in pg.locator('.reader-end').inner_text(), 'end card at bottom of scroll mode')
    pg.wait_for_timeout(900)
    prog = pg.evaluate("""() => new Promise(res=>{const r=indexedDB.open('tokyo-manga-lab');r.onsuccess=()=>{const g=r.result.transaction('chapterProgress').objectStore('chapterProgress').getAll();g.onsuccess=()=>{res(g.result);r.result.close()}}})""")
    ok(any(x['sourceChapterId'] == C1 and x['readingState'] == 'completed' for x in prog), 'finishing the chapter saved readingState=completed')

    # ---- paged RTL
    pg.click('[data-reader="sheet-open"]'); pg.click('[data-reader="set-mode"][data-value="rtl"]'); pg.wait_for_selector('.reader-stage[data-mode="rtl"]')
    pg.click('.reader-sheet [data-reader="sheet-close"]'); pg.wait_for_selector('.reader-sheet', state='detached')
    ok(pg.locator('.reader-img').count() == 1, 'paged mode shows a single page')
    pg.wait_for_function("document.querySelector('.reader-img').dataset.state === 'done'")
    pg.evaluate("() => { const r = document.querySelector('[data-reader=seek]'); r.value = '1'; r.dispatchEvent(new Event('input', {bubbles: true})); }")
    pg.wait_for_function("document.getElementById('readerCount').textContent.startsWith('1 /')")
    pg.wait_for_function("document.querySelector('.reader-img').dataset.state === 'done'")
    start = pg.evaluate("document.getElementById('readerCount').textContent")
    pg.keyboard.press('ArrowLeft')   # rtl: left = next
    pg.wait_for_timeout(300)
    ok(pg.evaluate("document.getElementById('readerCount').textContent") != start, 'ArrowLeft advances in right-to-left mode')
    pg.screenshot(path=S + '/shots/reader-rtl.png')
    setting = pg.evaluate("""() => new Promise(res=>{const r=indexedDB.open('tokyo-manga-lab');r.onsuccess=()=>{const g=r.result.transaction('appSettings').objectStore('appSettings').get('readerMode');g.onsuccess=()=>{res(g.result&&g.result.value);r.result.close()}}})""")
    ok(setting == 'rtl', 'mode choice persisted to settings')
    # past the last page -> end card -> next chapter is the *older* one in this list? (list is newest first: C1 has no newer)
    pg.keyboard.press('ArrowLeft'); pg.keyboard.press('ArrowLeft'); pg.wait_for_selector('.reader-end')
    ok('End of' in pg.locator('.reader-end').inner_text(), 'end card shown after the last page in paged mode')

    # ---- quality toggle
    pg.click('[data-reader="close"]')
    pg.wait_for_timeout(500)
    ok(pg.evaluate("location.hash") == '#discover', 'closing returns to the previous screen')
    pg.wait_for_selector('.chapter-row', timeout=5000)
    ok(True, 'title sheet reopened after closing the reader')

    # ---- expired URL -> refresh and retry once, reported as failure first
    state['reports'].clear(); state['img_hits'].clear(); state['pages_calls'].clear()
    state['fail_first_image'] = True
    pg.click(f'[data-action="read-chapter"][data-chapter-id="{C2}"]')
    pg.wait_for_selector('.reader-stage', timeout=8000)
    pg.wait_for_timeout(1500)
    ok(any(not r['body']['success'] for r in state['reports']), 'a 403 is reported as success=false')
    ok(len(state['pages_calls']) == 2, 'pages endpoint called again once after the 403 (URL refresh)')
    # (refresh returns node-a again here, so the image stays failed and offers a manual retry)
    ok(pg.locator('.reader-retry').count() >= 1, 'a manual retry button is offered when refresh cannot help')
    state['fail_first_image'] = False; state['node'] = 'node-b'
    pg.click('.reader-retry button >> nth=0')
    pg.wait_for_timeout(1500)
    ok(any('node-b' in u for u in state['img_hits']), 'manual retry fetches a fresh node URL')
    pg.screenshot(path=S + '/shots/reader-retry.png')
    ok(errs == [], 'no page errors: ' + '; '.join(errs))
    b.close()
print('ALL READER E2E CHECKS PASSED')

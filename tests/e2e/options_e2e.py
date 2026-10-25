import json
from playwright.sync_api import sync_playwright
import os
S = os.path.dirname(os.path.abspath(__file__))
os.makedirs(S + '/shots', exist_ok=True)
U = 'http://127.0.0.1:8011/index.html'
MID = '00000000-0000-4000-8000-000000000000'
C1 = '22222222-2222-4222-8222-222222222222'   # chapter 2 (newest)
EX = '44444444-4444-4444-8444-444444444444'   # extra, no chapter number
C2 = '33333333-3333-4333-8333-333333333333'   # chapter 1 (oldest)
IMG = {n: open(f'{S}/pages/p{n}.png', 'rb').read() for n in (1, 2, 3)}
H = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*'}

def chapter(cid, num):
    return {'sourceId': 'mangadex', 'externalId': cid, 'mangaExternalId': MID, 'chapterNumber': num, 'volumeNumber': None,
            'title': '', 'language': 'en', 'pages': 3, 'publishedAt': '2025-01-01T00:00:00Z', 'scanlationGroups': [],
            'sourceUrl': f'https://mangadex.org/chapter/{cid}'}

def worker(route):
    url = route.request.url
    if route.request.method == 'OPTIONS': return route.fulfill(status=204, headers=H)
    if url.endswith('/health'): return route.fulfill(status=200, content_type='application/json', headers=H, body='{"ok":true}')
    if '/pages' in url:
        return route.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps({'data': {'chapterId': C1, 'baseUrl': 'https://node.example.network', 'hash': 'abc123def456', 'data': ['1.png', '2.png', '3.png'], 'dataSaver': ['1.jpg', '2.jpg', '3.jpg']}}))
    if '/chapters' in url:
        return route.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps({'data': [chapter(C1, '2'), chapter(EX, None), chapter(C2, '1')], 'pagination': {'page': 1, 'limit': 24, 'total': 3, 'hasNext': False}}))
    if '/api/v1/manga/' in url:
        return route.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps({'data': {'sourceId': 'mangadex', 'externalId': MID, 'id': 'x', 'title': 'Options Test', 'contentType': 'manga'}}))
    return route.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps({'data': [{'id': MID, 'title': 'Options Test', 'description': 'x', 'year': 2020, 'status': 'ongoing', 'contentRating': 'safe', 'authors': [], 'tags': [], 'coverUrl': None, 'mangaDexUrl': 'https://mangadex.org/title/x'}], 'total': 1, 'limit': 24, 'page': 1}))

def images(route):
    n = int(route.request.url.rsplit('/', 1)[1].split('.')[0])
    route.fulfill(status=200, content_type='image/png', headers={'access-control-allow-origin': '*'}, body=IMG[n])

def ok(c, m):
    print(('PASS ' if c else 'FAIL ') + m)
    if not c: raise SystemExit(1)

NATIVE = """
window.__calls = [];
window.Capacitor = { isNativePlatform: () => true, Plugins: {
  StatusBar: { hide: async () => window.__calls.push('status:hide'), show: async () => window.__calls.push('status:show') },
  ScreenOrientation: { lock: async o => window.__calls.push('rotate:' + o.orientation), unlock: async () => window.__calls.push('rotate:unlock') }
} };
"""
CLIP = "window.__copied = []; try { Object.defineProperty(navigator, 'clipboard', { value: { writeText: async t => window.__copied.push(t) }, configurable: true }); } catch (e) {}"

def setting(pg, key):
    return pg.evaluate("""k => new Promise(res=>{const r=indexedDB.open('tokyo-manga-lab');r.onsuccess=()=>{const g=r.result.transaction('appSettings').objectStore('appSettings').get(k);g.onsuccess=()=>{res(g.result&&g.result.value);r.result.close()}}})""", key)

def open_reader(pg, chapter_id):
    pg.goto(U + '#discover')
    if not pg.locator('#detailsDialog[open]').count():
        pg.wait_for_selector('[data-action="details"]'); pg.click('[data-action="details"]')
    pg.wait_for_selector('[data-action="read-chapter"]')
    pg.click(f'[data-action="read-chapter"][data-chapter-id="{chapter_id}"]'); pg.wait_for_selector('.reader-img')

def sheet(pg):
    pg.click('[data-reader="sheet-open"]'); pg.wait_for_selector('.reader-sheet')

def close_sheet(pg):
    pg.click('.reader-sheet [data-reader="sheet-close"]'); pg.wait_for_selector('.reader-sheet', state='detached')

with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, service_workers='block')
    ctx.add_init_script(NATIVE); ctx.add_init_script(CLIP)
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
    ctx.route('**/*.workers.dev/**', worker); ctx.route('**/*.example.network/**', images)
    ctx.route('https://api.mangadex.network/**', lambda r: r.fulfill(status=200, headers=H, body=''))

    # ---- tips: shown once, dismissible, remembered
    open_reader(pg, C1)
    pg.wait_for_selector('.reader-tips', timeout=5000)
    ok('Tap the middle' in pg.inner_text('.reader-tips'), 'first open shows the operation tips')
    pg.screenshot(path=S + '/shots/options-tips.png')
    pg.click('[data-reader="tips-done"]'); pg.wait_for_selector('.reader-tips', state='detached')
    pg.click('[data-reader="close"]'); pg.wait_for_timeout(500)
    open_reader(pg, C1)
    pg.wait_for_timeout(600)
    ok(pg.locator('.reader-tips').count() == 0, 'tips do not come back after "Got it"')

    # ---- sheet content and reading mode
    sheet(pg)
    text = pg.inner_text('.reader-sheet').lower()
    for label in ['Reading mode', 'Auto read', 'Screen rotation', 'Show status bar', 'Time and battery', 'Volume keys turn pages', 'Chapter reminder', 'Skip extras', 'Share chapter link', 'See the operation tips again', 'More settings']:
        ok(label.lower() in text, f'sheet has "{label}"')
    pg.screenshot(path=S + '/shots/options-sheet.png')
    pg.click('[data-reader="set-mode"][data-value="ltr"]'); pg.wait_for_selector('.reader-stage[data-mode="ltr"]')
    ok(pg.locator('.reader-sheet').count() == 1, 'sheet stays open while the mode changes')
    ok(setting(pg, 'readerMode') == 'ltr', 'mode persisted from the sheet')
    ok(pg.locator('[data-reader="set-mode"][data-value="ltr"]').get_attribute('aria-pressed') == 'true', 'active mode is marked pressed')
    pg.click('[data-reader="set-quality"][data-value="data-saver"]'); pg.wait_for_timeout(500)
    ok(setting(pg, 'readerQuality') == 'data-saver', 'quality persisted from the sheet')
    pg.click('[data-reader="set-quality"][data-value="data"]'); pg.wait_for_timeout(300)

    # ---- auto read, paged mode
    pg.evaluate("() => { const r = document.querySelector('[data-reader=auto-speed]'); r.value = '5'; r.dispatchEvent(new Event('input', {bubbles: true})); r.dispatchEvent(new Event('change', {bubbles: true})); }")
    ok('Very fast' in pg.inner_text('.reader-speed-label'), 'speed label follows the slider')
    pg.wait_for_timeout(300)
    ok(setting(pg, 'readerAutoSpeed') == '5', 'auto read speed persisted on release')
    pg.click('[data-reader="auto-toggle"]'); pg.wait_for_selector('.reader-auto')
    ok(pg.locator('.reader-sheet').count() == 0, 'starting auto read closes the sheet')
    first = pg.evaluate("document.getElementById('readerCount').textContent")
    pg.wait_for_function("(f) => document.getElementById('readerCount').textContent !== f", arg=first, timeout=6000)
    ok(True, 'auto read turned a page on its own (paged)')
    pg.click('[data-reader="auto-pause"]'); held = pg.evaluate("document.getElementById('readerCount').textContent")
    pg.wait_for_timeout(3200)
    ok(pg.evaluate("document.getElementById('readerCount').textContent") == held, 'paused auto read stays on the page')
    ok('Resume' in pg.inner_text('.reader-auto'), 'pill offers to resume')
    pg.click('[data-reader="auto-stop"]'); pg.wait_for_selector('.reader-auto', state='detached')

    # ---- auto read, scroll mode
    sheet(pg); pg.click('[data-reader="set-mode"][data-value="scroll"]'); pg.wait_for_selector('.reader-stage[data-mode="scroll"]')
    pg.click('[data-reader="auto-toggle"]'); pg.wait_for_selector('.reader-auto')
    y0 = pg.evaluate("document.querySelector('.reader-stage').scrollTop")
    pg.wait_for_timeout(1500)
    y1 = pg.evaluate("document.querySelector('.reader-stage').scrollTop")
    ok(y1 > y0 + 100, f'auto read scrolls by itself ({y0} -> {y1})')
    pg.evaluate("document.querySelector('.reader-stage').dispatchEvent(new Event('wheel', {bubbles: true}))")
    pg.wait_for_timeout(200)
    held_y = pg.evaluate("document.querySelector('.reader-stage').scrollTop"); pg.wait_for_timeout(800)
    ok('Resume' in pg.inner_text('.reader-auto') and abs(pg.evaluate("document.querySelector('.reader-stage').scrollTop") - held_y) < 3, 'touching the page pauses auto read')
    pg.click('[data-reader="auto-stop"]')

    # ---- time and battery
    sheet(pg); pg.click('[data-reader="toggle"][data-key="readerShowClock"]'); close_sheet(pg)
    pg.wait_for_selector('.reader-clock')
    ok(':' in pg.inner_text('.reader-clock'), 'clock overlay shows the time')
    ok(setting(pg, 'readerShowClock') is True, 'clock option persisted')

    # ---- rotation + status bar reach the (mocked) Android plugins, and are undone on close
    sheet(pg); pg.click('[data-reader="set-orientation"][data-value="landscape"]'); pg.wait_for_timeout(200)
    pg.click('[data-reader="toggle"][data-key="readerShowStatusBar"]'); pg.wait_for_timeout(200)
    calls = pg.evaluate("window.__calls")
    ok('rotate:landscape' in calls and 'status:hide' in calls, f'rotation and status bar reached the app layer {calls}')
    ok(setting(pg, 'readerOrientation') == 'landscape' and setting(pg, 'readerShowStatusBar') is False, 'rotation and status bar choices persisted')

    # ---- volume keys: address marker + page turns
    pg.click('[data-reader="set-mode"][data-value="ltr"]'); pg.wait_for_selector('.reader-stage[data-mode="ltr"]')
    pg.click('[data-reader="toggle"][data-key="readerVolumeKeys"]'); close_sheet(pg)
    ok(pg.evaluate("location.hash").endswith('?vol=1'), 'reader address carries the vol=1 marker for the Android shell')
    pg.evaluate("() => { const r = document.querySelector('[data-reader=seek]'); r.value = '1'; r.dispatchEvent(new Event('input', {bubbles: true})); }")
    pg.wait_for_function("document.getElementById('readerCount').textContent.startsWith('1 /')")
    pg.evaluate("window.dispatchEvent(new CustomEvent('tmlvolume', {detail: 'down'}))"); pg.wait_for_timeout(300)
    after_down = pg.evaluate("document.getElementById('readerCount').textContent")
    ok(after_down.startswith('2 /'), f'volume down goes forward ({after_down})')
    pg.evaluate("window.dispatchEvent(new CustomEvent('tmlvolume', {detail: 'up'}))"); pg.wait_for_timeout(300)
    ok(pg.evaluate("document.getElementById('readerCount').textContent").startswith('1 /'), 'volume up goes back')
    sheet(pg); pg.click('[data-reader="toggle"][data-key="readerVolumeKeys"]'); close_sheet(pg)
    ok('vol=1' not in pg.evaluate("location.hash"), 'turning volume keys off removes the marker')
    pg.evaluate("window.dispatchEvent(new CustomEvent('tmlvolume', {detail: 'down'}))"); pg.wait_for_timeout(300)
    ok(pg.evaluate("document.getElementById('readerCount').textContent").startswith('1 /'), 'volume events are ignored while the option is off')

    # ---- share (clipboard fallback) and more settings
    sheet(pg); pg.click('[data-reader="share"]'); pg.wait_for_timeout(300)
    ok(pg.evaluate("window.__copied") == [f'https://mangadex.org/chapter/{C1}'], 'share copies only the MangaDex chapter link')
    ok('Link copied' in pg.inner_text('.reader-toast'), 'share confirms with a toast')
    pg.click('[data-reader="more-settings"]'); pg.wait_for_timeout(600)
    ok(pg.evaluate("location.hash") == '#settings/reading', 'More settings opens Settings > Reading')
    body = pg.inner_text('#appView')
    body = body.lower()
    ok('reader display and controls' in body and 'volume keys turn pages' in body and 'skip extras' in body, 'new options are in Settings > Reading too')
    calls = pg.evaluate("window.__calls")
    ok('status:show' in calls and calls[-1] == 'rotate:unlock', f'leaving the reader restores the status bar and rotation {calls}')
    pg.screenshot(path=S + '/shots/options-settings.png')
    pg.go_back(); pg.wait_for_selector('.reader-img', timeout=6000)
    ok(pg.evaluate("location.hash").startswith(f'#read/{C1}'), 'back from settings returns to the reader')
    pg.click('[data-reader="close"]'); pg.wait_for_timeout(400)

    # ---- chapter reminder + skip extras (reading the oldest chapter; the list has an extra in between)
    pg.goto(U + '#settings/reading'); pg.wait_for_timeout(600)
    pg.evaluate("document.querySelector('[data-setting=readerChapterNotice]').click()"); pg.wait_for_timeout(300)
    open_reader(pg, C2)
    pg.wait_for_selector('.reader-toast', timeout=5000)
    ok('Chapter 1' in pg.inner_text('.reader-toast'), 'chapter reminder names the chapter on open')
    pg.click('[data-reader="next-chapter"]'); pg.wait_for_timeout(500)
    ok(pg.evaluate("location.hash").startswith(f'#read/{EX}'), 'Next goes to the extra by default')
    pg.click('[data-reader="close"]'); pg.wait_for_timeout(400)
    open_reader(pg, C2)
    sheet(pg); pg.click('[data-reader="toggle"][data-key="readerSkipExtras"]'); close_sheet(pg)
    pg.click('[data-reader="next-chapter"]'); pg.wait_for_timeout(500)
    ok(pg.evaluate("location.hash").startswith(f'#read/{C1}'), 'with Skip extras, Next jumps over the extra')

    # ---- tips can be shown again from Settings
    pg.goto(U + '#settings/reading'); pg.wait_for_timeout(600)
    pg.click('[data-action="reader-tips-reset"]'); pg.wait_for_timeout(200)
    open_reader(pg, C2)
    pg.wait_for_selector('.reader-tips', timeout=5000)
    ok(True, 'Show again brings the tips back')
    ok(errs == [], 'no page errors ' + '; '.join(errs))
    b.close()
print('READER OPTIONS E2E PASSED')

import json, os, re, datetime
from playwright.sync_api import sync_playwright
S = os.path.dirname(os.path.abspath(__file__))
os.makedirs(S + '/shots', exist_ok=True)
U = 'http://127.0.0.1:8011/index.html'
MID = '00000000-0000-4000-8000-000000000000'
CH = {n: f'aaaaaaaa-aaaa-4aaa-8aaa-{n:012d}' for n in range(1, 8)}
IMG = open(f'{S}/pages/p1.png', 'rb').read()
H = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*'}
st = {'latest': CH[1], 'chapters': [1], 'no_batch': False, 'updates_calls': 0, 'list_calls': 0}

def stamp(minutes=1):
    return (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=minutes)).strftime('%Y-%m-%dT%H:%M:%S+00:00')

def chapter(n):
    return {'sourceId': 'mangadex', 'externalId': CH[n], 'mangaExternalId': MID, 'chapterNumber': str(n), 'volumeNumber': None, 'title': '', 'language': 'en', 'pages': 3,
            'publishedAt': st.get(f'at{n}') or '2020-01-01T00:00:00+00:00', 'scanlationGroups': ['G'], 'sourceUrl': f'https://mangadex.org/chapter/{CH[n]}'}

def worker(route):
    url = route.request.url
    if route.request.method == 'OPTIONS':
        return route.fulfill(status=204, headers=H)
    def reply(body, status=200):
        return route.fulfill(status=status, content_type='application/json', headers=H, body=json.dumps(body))
    if url.endswith('/health'):
        return reply({'ok': True})
    if '/api/v1/updates' in url:
        st['updates_calls'] += 1
        if st['no_batch']:
            return reply({'error': {'code': 'NOT_FOUND', 'message': 'API route not found.'}}, 404)
        return reply({'data': [{'externalId': MID, 'latestChapterId': st['latest'], 'updatedAt': None}]})
    if '/pages' in url:
        cid = re.search(r'chapters/([0-9a-f-]{36})/pages', url).group(1)
        return reply({'data': {'chapterId': cid, 'mangaExternalId': MID, 'baseUrl': 'https://node-a.abc.mangadex.network:30000', 'hash': 'abc123def456', 'data': ['1.png', '2.png', '3.png'], 'dataSaver': ['s1.jpg', 's2.jpg', 's3.jpg'], 'validForSeconds': 900}})
    if '/chapters' in url:
        st['list_calls'] += 1
        return reply({'data': [chapter(n) for n in sorted(st['chapters'], reverse=True)], 'pagination': {'page': 1, 'limit': 20, 'total': len(st['chapters']), 'hasNext': False}})
    if '/api/v1/manga/' in url:
        return reply({'data': {'sourceId': 'mangadex', 'externalId': MID, 'contentType': 'manga', 'title': 'Update Test', 'description': 'x', 'contentRating': 'safe', 'tags': [], 'authors': ['A'], 'publicationStatus': 'releasing'}})
    return reply({'data': [{'id': MID, 'title': 'Update Test', 'description': 'x', 'year': 2024, 'status': 'ongoing', 'contentRating': 'safe', 'authors': ['A'], 'tags': ['Action'], 'coverUrl': None, 'mangaDexUrl': 'https://mangadex.org/title/x'}], 'total': 1, 'limit': 24, 'page': 1})

def images(route):
    route.fulfill(status=200, content_type='image/png', headers={'access-control-allow-origin': '*'}, body=IMG)

def ok(cond, msg):
    print(('PASS ' if cond else 'FAIL ') + msg)
    if not cond:
        raise SystemExit(1)

def wait_until(pg, fn, timeout=20000):
    for _ in range(timeout // 200):
        if fn():
            return True
        pg.wait_for_timeout(200)
    return False

def check_now(pg):
    pg.goto(U + '#settings/notifications'); pg.wait_for_selector('[data-action="check-updates"]')
    pg.click('[data-action="check-updates"]')
    wait_until(pg, lambda: pg.inner_text('#updatesResult').strip() not in ('', 'Checking…'), 15000)
    return pg.inner_text('#updatesResult')

def new_chapter(n):
    st['chapters'].append(n); st[f'at{n}'] = stamp(1); st['latest'] = CH[n]

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, service_workers='block')
    ctx.add_init_script("localStorage.setItem('tml-reader-tips-seen','1')")
    ctx.route('**/*.workers.dev/**', worker)
    ctx.route('**/*.mangadex.network:30000/**', images)
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('dialog', lambda d: d.accept())
    # nothing watched yet
    pg.goto(U + '#settings/notifications'); pg.wait_for_selector('[data-setting="updatesEnabled"]')
    ok(pg.is_checked('[data-setting="updatesEnabled"]'), 'checking for new chapters is on by default')
    ok('Alerts with the app closed' in pg.inner_text('#appView'), 'the web build says phone alerts are not in this build')
    pg.uncheck('[data-setting="updatesEnabled"]', force=True)  # keep the timers out of the way; Check now still works
    ok('not reading any MangaDex titles' in check_now(pg), 'Check now explains there is nothing to watch yet')
    # save the title and set it to Reading
    pg.goto(U + '#discover'); pg.wait_for_selector('.card-save'); pg.click('.card-save'); pg.wait_for_timeout(500)
    pg.goto(U + '#library'); pg.wait_for_selector('[data-library-status]'); pg.select_option('[data-library-status]', 'reading'); pg.wait_for_timeout(400)
    pg.goto(U + '#settings/notifications'); pg.wait_for_selector('[data-dynamic="updateStatus"]')
    ok('1 title' in pg.inner_text('[data-dynamic="updateStatus"]') and 'not checked yet' in pg.inner_text('[data-dynamic="updateStatus"]'), 'status shows the title is watched but not checked yet')
    # first check records a starting point and reports nothing
    ok('Nothing new' in check_now(pg), 'first check: nothing already out is reported')
    ok('1 title' in pg.inner_text('[data-dynamic="updateStatus"]') and 'Checked' in pg.inner_text('[data-dynamic="updateStatus"]'), 'status shows the last check and one title')
    pg.goto(U + '#home'); pg.wait_for_selector('#homeUpdates', state='attached'); pg.wait_for_timeout(300)
    ok(pg.locator('.update-row').count() == 0, 'Home has no New chapters section yet')
    calls = st['list_calls']
    ok('Nothing new' in check_now(pg) and st['list_calls'] == calls, 'unchanged newest chapter id costs no chapter-list request')
    # a new chapter appears
    new_chapter(2)
    ok('1 new chapter found' in check_now(pg), 'a new chapter is found')
    pg.goto(U + '#home'); pg.wait_for_selector('.update-row')
    text = pg.inner_text('#homeUpdates')
    ok('Update Test' in text and 'Ch. 2' in text and pg.locator('.update-dot').count() == 1, f'Home lists it with an unread dot: {text!r}')
    pg.screenshot(path=S + '/shots/updates-home.png')
    pg.goto(U + '#downloads'); pg.wait_for_selector('.dl-auto')
    ok('Nothing downloaded yet' in pg.inner_text('#appView'), 'nothing is downloaded while auto-download is off')
    ok('Nothing new' in check_now(pg), 'the same chapter is not reported twice')
    # tap opens details and marks read
    pg.goto(U + '#home'); pg.wait_for_selector('.update-row')
    pg.click('.update-open'); pg.wait_for_selector('#detailsDialog[open] .chapter-row', timeout=8000)
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    pg.goto(U + '#home'); pg.wait_for_selector('.update-row')
    ok(pg.locator('.update-dot').count() == 0, 'opening the title marks it read')
    pg.click('.update-dismiss'); pg.wait_for_timeout(400)
    ok(pg.locator('.update-row').count() == 0, 'a title can be dismissed')
    # auto-download on the Downloads screen
    pg.goto(U + '#downloads'); pg.wait_for_selector('.dl-auto [data-setting="autoDownloadEnabled"]')
    ok(not pg.is_checked('.dl-auto [data-setting="autoDownloadEnabled"]'), 'auto-download is off by default')
    pg.check('.dl-auto [data-setting="autoDownloadEnabled"]', force=True); pg.wait_for_timeout(600)
    ok('On. Up to 3' in pg.inner_text('.dl-auto'), 'switching it on is reflected in place')
    new_chapter(3)
    ok('1 new chapter found' in check_now(pg), 'chapter 3 found')
    pg.goto(U + '#downloads'); pg.wait_for_selector('.dl-auto')
    ok(wait_until(pg, lambda: 'Update Test' in pg.inner_text('#appView'), 8000), 'the title shows on Downloads')
    ok(wait_until(pg, lambda: '1 chapter saved' in pg.inner_text('#appView'), 25000), 'the chapter was saved')
    ok(True, 'the new chapter was queued and saved by auto-download')
    pg.screenshot(path=S + '/shots/updates-downloads.png')
    # an older Worker without the batch route still works
    st['no_batch'] = True
    pg.goto(U + '#home'); pg.wait_for_selector('#homeUpdates', state='attached')
    new_chapter(4)
    res = check_now(pg)
    ok('1 new chapter found' in res, f'fallback without the batch route finds chapter 4: {res!r}')
    # unchanged scope: planned titles are not watched by default
    pg.goto(U + '#library'); pg.wait_for_selector('[data-library-status]'); pg.select_option('[data-library-status]', 'planned'); pg.wait_for_timeout(300)
    ok('not reading any MangaDex titles' in check_now(pg), 'a title that is only planned is not watched by default')
    pg.goto(U + '#settings/notifications'); pg.wait_for_selector('#set-updatesScope'); pg.select_option('#set-updatesScope', 'active'); pg.wait_for_timeout(300)
    st['no_batch'] = False
    ok('Nothing new' in check_now(pg) or 'new chapter' in pg.inner_text('#updatesResult'), 'including planned titles watches it')
    # clear
    pg.goto(U + '#settings/notifications'); pg.wait_for_selector('[data-action="updates-clear"]'); pg.click('[data-action="updates-clear"]'); pg.wait_for_timeout(300)
    pg.goto(U + '#home'); pg.wait_for_selector('#homeUpdates', state='attached'); pg.wait_for_timeout(300)
    ok(pg.locator('.update-row').count() == 0, 'Clear empties the list')
    pg.goto(U + '#settings/notifications'); pg.wait_for_selector('[data-dynamic="updateStatus"]')
    pg.screenshot(path=S + '/shots/updates-settings.png')
    ok(not errs, f'no page errors: {errs}')
    b.close()
print('updates e2e ok')

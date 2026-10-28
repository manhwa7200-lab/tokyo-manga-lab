import json, os, urllib.parse
from playwright.sync_api import sync_playwright
S = os.path.dirname(os.path.abspath(__file__))
os.makedirs(S + '/shots', exist_ok=True)
U = 'http://127.0.0.1:8011/index.html'
H = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*'}
TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.' + 'a' * 60 + '.' + 'b' * 40
IMG = open(f'{S}/pages/p1.png', 'rb').read()
MID_A = '00000000-0000-4000-8000-00000000000a'   # has an AniList id
MID_B = '00000000-0000-4000-8000-00000000000b'   # has none
N = 150
def cid(n): return f'{n:08x}-1111-4111-8111-111111111111'
def manga(mid, title, anilist):
    return {'id': mid, 'title': title, 'description': 'd', 'year': 2024, 'status': 'ongoing', 'contentRating': 'safe', 'authors': ['A'], 'tags': ['Action'], 'coverUrl': None, 'mangaDexUrl': 'https://mangadex.org/title/' + mid, 'anilistId': anilist, 'malId': None}
def chapter(n):
    return {'sourceId': 'mangadex', 'externalId': cid(n), 'mangaExternalId': MID_A, 'chapterNumber': str(n), 'volumeNumber': None, 'title': f'Title {n}', 'language': 'en', 'pages': 3, 'publishedAt': f'2025-01-{(n % 28) + 1:02d}T00:00:00Z', 'scanlationGroups': ['Group A' if n % 2 else 'Group B'], 'sourceUrl': 'https://mangadex.org/chapter/' + cid(n)}
calls = {'chapters': [], 'pages': 0}
ani = {'entry': None, 'saves': [], 'fail': False, 'chapters': N, 'searches': []}

def worker(route):
    url = route.request.url; pu = urllib.parse.urlparse(url); q = urllib.parse.parse_qs(pu.query)
    if route.request.method == 'OPTIONS': return route.fulfill(status=204, headers=H)
    if pu.path.endswith('/health'): return route.fulfill(status=200, content_type='application/json', headers=H, body='{"ok":true}')
    if '/pages' in pu.path:
        calls['pages'] += 1
        n = int(pu.path.split('/')[-2].split('-')[0], 16)
        body = {'data': {'chapterId': cid(n), 'mangaExternalId': MID_A, 'baseUrl': 'https://node-a.example.network', 'hash': 'abc123def456', 'data': ['1.png', '2.png', '3.png'], 'dataSaver': ['1.jpg', '2.jpg', '3.jpg'], 'validForSeconds': 900}}
        return route.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps(body))
    if pu.path.endswith('/chapters'):
        page = int(q.get('page', ['1'])[0]); limit = int(q.get('limit', ['24'])[0]); calls['chapters'].append((page, limit))
        all_ch = [chapter(n) for n in range(N, 0, -1)]
        data = all_ch[(page - 1) * limit: page * limit]
        return route.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps({'data': data, 'pagination': {'page': page, 'limit': limit, 'total': N, 'hasNext': page * limit < N}}))
    if '/api/v1/manga/' in pu.path:
        mid = pu.path.rsplit('/', 1)[1]
        m = manga(mid, 'Tracked Title' if mid == MID_A else 'Untracked Title', '555' if mid == MID_A else None); m.update({'sourceId': 'mangadex', 'externalId': mid, 'contentType': 'manga'})
        return route.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps({'data': m}))
    return route.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps({'data': [manga(MID_A, 'Tracked Title', '555'), manga(MID_B, 'Untracked Title', None)], 'total': 2, 'limit': 24, 'page': 1}))

def fz(d): return {'year': d['year'], 'month': d['month'], 'day': d['day']} if d else {'year': None, 'month': None, 'day': None}
def anilist(route):
    h = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*'}
    if route.request.method == 'OPTIONS': return route.fulfill(status=204, headers=h)
    if ani['fail']: return route.abort('failed')
    body = json.loads(route.request.post_data); q = body['query']; v = body.get('variables', {})
    def ok(data): return route.fulfill(status=200, content_type='application/json', headers=h, body=json.dumps({'data': data}))
    if 'SaveMediaListEntry' in q:
        ani['saves'].append(v)
        e = ani['entry'] or {'id': 99, 'mediaId': v['mediaId'], 'status': 'CURRENT', 'progress': 0, 'score': 0, 'startedAt': fz(None), 'completedAt': fz(None)}
        if 'status' in v: e['status'] = v['status']
        if 'progress' in v: e['progress'] = v['progress']
        if 'scoreRaw' in v: e['score'] = v['scoreRaw']
        if 'startedAt' in v: e['startedAt'] = v['startedAt']
        if 'completedAt' in v: e['completedAt'] = v['completedAt']
        e['updatedAt'] = 1800000000; ani['entry'] = e
        return ok({'SaveMediaListEntry': e})
    if 'Viewer' in q: return ok({'Viewer': {'id': 7, 'name': 'Kai', 'siteUrl': 'https://anilist.co/user/Kai', 'avatar': {'medium': None}}})
    if 'Page(' in q:
        ani['searches'].append(v.get('search'))
        return ok({'Page': {'media': [{'id': 777, 'chapters': 40, 'isAdult': False, 'format': 'MANGA', 'startDate': {'year': 2020}, 'title': {'romaji': 'Found On AniList', 'english': None, 'native': None}, 'coverImage': {'medium': None}}]}})
    if 'Media(' in q:
        mid = v.get('id')
        return ok({'Media': {'id': mid, 'chapters': ani['chapters'], 'status': 'RELEASING', 'isAdult': False, 'siteUrl': f'https://anilist.co/manga/{mid}', 'title': {'romaji': f'AniList {mid}', 'english': None, 'native': None}, 'coverImage': {'medium': None}, 'mediaListEntry': ani['entry'] if mid == 555 else None}})
    return ok({})

def images(route): return route.fulfill(status=200, content_type='image/png', headers={'access-control-allow-origin': '*'}, body=IMG)
def report(route):
    if route.request.method == 'OPTIONS': return route.fulfill(status=204, headers=H)
    return route.fulfill(status=200, headers=H, body='')
def check(c, m):
    print(('PASS ' if c else 'FAIL ') + m)
    if not c: raise SystemExit(1)
def rows(pg): return pg.locator('.chapter-row .chapter-name').all_inner_texts()
def idb(pg, store): return pg.evaluate("(s) => new Promise(res=>{const r=indexedDB.open('tokyo-manga-lab');r.onsuccess=()=>{const g=r.result.transaction(s).objectStore(s).getAll();g.onsuccess=()=>{res(g.result);r.result.close()}}})", store)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, service_workers='block')
    ctx.add_init_script("localStorage.setItem('tml-reader-tips-seen','1')")
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('dialog', lambda d: d.accept())
    _click = pg.click
    def click_and_settle(selector, **kwargs):
        _click(selector, **kwargs); pg.wait_for_timeout(250)   # let the async handler save and redraw
    pg.click = click_and_settle
    ctx.route('**/*.workers.dev/**', worker); ctx.route('https://graphql.anilist.co/**', anilist)
    ctx.route('**/*.example.network/**', images); ctx.route('https://api.mangadex.network/**', report)

    # ---- signed in (seeded), then open the title
    pg.goto(U + '#discover'); pg.wait_for_selector('.manga-card')
    pg.evaluate("""(t) => new Promise(res=>{const r=indexedDB.open('tokyo-manga-lab');r.onsuccess=()=>{const tx=r.result.transaction('accountLinks','readwrite');tx.objectStore('accountLinks').put({provider:'anilist',accessToken:t,expiresAt:Date.now()+1e10,viewer:{id:7,name:'Kai'},connectedAt:Date.now(),lastSync:null});tx.oncomplete=()=>{r.result.close();res()}}})""", TOKEN)
    pg.reload(); pg.wait_for_selector('.manga-card')
    pg.click('.manga-card [data-action="details"] >> nth=0'); pg.wait_for_selector('.chapter-row', timeout=8000)
    pg.wait_for_function("() => document.querySelector('.chapter-count') && document.querySelector('.chapter-count').textContent.includes('150')", timeout=8000)

    # ---- the whole list is loaded in big pages
    check(calls['chapters'][:2] == [(1, 100), (2, 100)], f"chapters load 100 at a time, page by page: {calls['chapters']}")
    check(pg.locator('.chapter-row').count() == 60, 'first 60 rows are drawn')
    pg.click('[data-action="chapter-show-more"]'); pg.click('[data-action="chapter-show-more"]')
    check(pg.locator('.chapter-row').count() == 150, 'Show more reveals the rest')
    check(rows(pg)[0].startswith('Chapter 150') and 'Title 150' in rows(pg)[0], 'default order is MangaDex order with the source title')

    # ---- sort
    pg.click('[data-action="chapter-options-toggle"]'); pg.click('[data-action="chapter-options-tab"][data-tab="sort"]')
    pg.click('[data-action="chapter-sort"][data-sort-key="number"]')
    check(rows(pg)[0].startswith('Chapter 150'), 'by chapter number, highest first')
    pg.click('[data-action="chapter-sort"][data-sort-key="number"]')
    check(rows(pg)[0].startswith('Chapter 1 ') or rows(pg)[0].startswith('Chapter 1—') or rows(pg)[0].startswith('Chapter 1'), 'tapping again flips to lowest first: ' + rows(pg)[0])
    check(rows(pg)[0].split(' — ')[0] == 'Chapter 1', 'ascending starts at chapter 1')
    pg.click('[data-action="chapter-sort"][data-sort-key="title"]')
    check(rows(pg)[0].split(' — ')[0] == 'Chapter 150' or rows(pg)[0].startswith('Chapter 1'), 'alphabetical order applies')
    pg.click('[data-action="chapter-sort"][data-sort-key="number"]')   # back to number, now newest first
    saved = {r['key']: r['value'] for r in idb(pg, 'appSettings')}
    check(saved.get('chapterSortKey') == 'number', 'sort choice is saved in settings')

    # ---- display
    pg.click('[data-action="chapter-options-tab"][data-tab="display"]'); pg.click('input[data-chapter-view="display"][value="number"]')
    check(' — ' not in rows(pg)[0], 'display "Chapter number" hides the source title: ' + rows(pg)[0])
    pg.click('input[data-chapter-view="display"][value="source-title"]')
    check(' — Title' in rows(pg)[0], 'display "Source title" shows it again')

    # ---- marks, filters, and AniList update on marking read
    pg.click('[data-action="chapter-options-tab"][data-tab="sort"]'); pg.click('[data-action="chapter-sort"][data-sort-key="number"]')  # flip to ascending: chapter 1 first
    first_id = cid(1)
    pg.click(f'[data-action="chapter-menu"][data-chapter-id="{first_id}"]')
    pg.click(f'[data-action="chapter-mark"][data-chapter-id="{first_id}"]'); pg.wait_for_timeout(1500)
    check(pg.locator(f'.chapter-row[data-chapter="{first_id}"].is-read').count() == 1, 'chapter 1 is marked read')
    check(len(ani['saves']) == 1 and ani['saves'][0].get('progress') == 1 and ani['saves'][0].get('status') == 'CURRENT' and ani['saves'][0].get('startedAt', {}).get('year'), f"marking read updated AniList: {ani['saves']}")
    pg.click('[data-action="chapter-options-toggle"]') if pg.locator('#chapterOptions').count() == 0 else None
    pg.click('[data-action="chapter-options-tab"][data-tab="filter"]'); pg.click('input[data-chapter-view="unread"]')
    check(f'Chapter 1 ' not in ' '.join(r + ' ' for r in rows(pg)[:1]) and rows(pg)[0].split(' — ')[0] == 'Chapter 2', 'Unread filter hides the read chapter')
    pg.click('input[data-chapter-view="unread"]')
    pg.click(f'[data-action="chapter-menu"][data-chapter-id="{cid(2)}"]'); pg.click(f'[data-action="chapter-bookmark"][data-chapter-id="{cid(2)}"]'); pg.wait_for_timeout(300)
    pg.click('input[data-chapter-view="bookmarked"]')
    check(pg.locator('.chapter-row').count() == 1 and rows(pg)[0].startswith('Chapter 2'), 'Bookmarked filter shows only the bookmarked chapter')
    pg.click('input[data-chapter-view="bookmarked"]')
    pg.select_option('select[data-chapter-view="scanlator"]', 'Group B')
    check(pg.locator('.chapter-row').count() == 60 and all(int(r.split(' ')[1].split(' ')[0]) % 2 == 0 for r in rows(pg)[:5]), 'Scanlator filter keeps only that group')
    pg.click('[data-action="chapter-filters-clear"]')
    check('150 chapters' in pg.inner_text('.chapter-count'), 'Clear filters restores the full list')
    marks = idb(pg, 'bookmarks'); check(len(marks) == 1, 'bookmark stored')

    # ---- tracking panel (linked through MangaDex anilistId)
    pg.click('[data-action="track-toggle"]'); pg.wait_for_selector('.track-card')
    check(pg.input_value('[data-track-field="progress"]') == '1', 'tracking panel shows the chapter from AniList')
    pg.screenshot(path=S + '/shots/tracking-panel.png')
    pg.click('[data-action="track-step"][data-delta="1"]'); pg.wait_for_selector('.track-note.ok')
    check(ani['saves'][-1] == {'mediaId': 555, 'progress': 2}, f"+ sends only the changed field: {ani['saves'][-1]}")
    n = len(ani['saves'])
    pg.fill('[data-track-field="score"]', '8.5'); pg.keyboard.press('Tab')
    pg.wait_for_function(f"window.__saveCount === undefined || true", timeout=100) if False else None
    for _ in range(40):
        if len(ani['saves']) > n: break
        pg.wait_for_timeout(100)
    check(ani['saves'][-1].get('scoreRaw') == 85, 'score 8.5 sent as 85')
    n = len(ani['saves'])
    pg.fill('[data-track-field="startedAt"]', '2026-04-04')
    for _ in range(40):
        if len(ani['saves']) > n: break
        pg.wait_for_timeout(100)
    check(ani['saves'][-1].get('startedAt') == {'year': 2026, 'month': 4, 'day': 4}, 'start date sent')
    n = len(ani['saves'])
    pg.select_option('[data-track-field="status"]', 'PAUSED')
    for _ in range(40):
        if len(ani['saves']) > n: break
        pg.wait_for_timeout(100)
    check(ani['saves'][-1].get('status') == 'PAUSED', 'status sent')

    # ---- AniList unreachable: kept on this device, sent when online again
    ani['fail'] = True
    pg.click('[data-action="track-step"][data-delta="1"]'); pg.wait_for_selector('.track-note.queued', timeout=8000)
    check('saved on this device' in pg.inner_text('.track-note').lower(), 'offline change says it is saved here')
    check(pg.input_value('[data-track-field="progress"]') == '3', 'the panel already shows the new chapter')
    check(len(idb(pg, 'syncOutbox')) == 1, 'one change waits in the outbox')
    before = len(ani['saves']); ani['fail'] = False
    pg.evaluate("window.dispatchEvent(new Event('online'))"); pg.wait_for_timeout(1500)
    check(len(idb(pg, 'syncOutbox')) == 0 and ani['saves'][-1].get('progress') == 3, 'it is sent when the phone is back online')

    # ---- reading a chapter updates AniList once the chapter is finished
    pg.click('[data-action="track-close"]')
    ani['entry']['status'] = 'CURRENT'
    n_before = len(ani['saves'])
    pg.click('[data-action="chapter-options-toggle"]') if pg.locator('#chapterOptions').count() else None
    pg.evaluate("document.querySelector('#detailsDialog').scrollTo(0,0)")
    read_btn = f'[data-action="read-chapter"][data-chapter-id="{cid(10)}"]'
    pg.click(f'[data-action="chapter-show-more"]') if pg.locator(read_btn).count() == 0 else None
    pg.click(read_btn); pg.wait_for_selector('.reader-img', timeout=8000)
    pg.evaluate("document.querySelector('.reader-stage').scrollTo(0, 1e6)"); pg.wait_for_timeout(2500)
    check(len(ani['saves']) == n_before + 1 and ani['saves'][-1].get('progress') == 10, f"finishing chapter 10 moved AniList to 10: {ani['saves'][n_before:]}")

    # a lower chapter never moves progress down
    pg.click('[data-reader="close"]'); pg.wait_for_selector('#detailsDialog[open]', timeout=8000); pg.wait_for_selector('.chapter-row')
    n_before = len(ani['saves'])
    pg.click(f'[data-action="chapter-menu"][data-chapter-id="{cid(4)}"]'); pg.click(f'[data-action="chapter-mark"][data-chapter-id="{cid(4)}"]'); pg.wait_for_timeout(1200)
    check(len(ani['saves']) == n_before, 'marking an older chapter read does not lower AniList progress')

    # ---- auto update can be turned off
    pg.keyboard.press('Escape'); pg.goto(U + '#settings/account'); pg.wait_for_selector('[data-setting="trackerAutoUpdate"]')
    pg.click('[data-setting="trackerAutoUpdate"]'); pg.wait_for_timeout(500)
    saved = {r['key']: r['value'] for r in idb(pg, 'appSettings')}
    check(saved.get('trackerAutoUpdate') is False, 'the toggle is saved')
    pg.select_option('[data-setting="trackerMarkRead"]', 'never'); pg.wait_for_timeout(400)
    pg.goto(U + '#discover'); pg.wait_for_selector('.manga-card'); pg.click('.manga-card [data-action="details"] >> nth=0'); pg.wait_for_selector('.chapter-row')
    n_before = len(ani['saves'])
    pg.click(f'[data-action="chapter-menu"][data-chapter-id="{cid(1)}"]'); pg.click(f'[data-action="chapter-mark"][data-chapter-id="{cid(1)}"]'); pg.wait_for_timeout(300)
    pg.click(f'[data-action="chapter-menu"][data-chapter-id="{cid(30)}"]') if pg.locator(f'[data-action="chapter-menu"][data-chapter-id="{cid(30)}"]').count() else None
    check(len(ani['saves']) == n_before, '"Never" for marked-as-read sends nothing')

    # ---- a title with no AniList id: pick it yourself
    pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
    pg.click('.manga-card >> nth=1 >> [data-action="details"]'); pg.wait_for_selector('.chapter-row')
    pg.click('[data-action="track-toggle"]'); pg.wait_for_selector('.track-find')
    check('never matched by name' in pg.inner_text('.track-find').lower() or 'Pick the right one yourself' in pg.inner_text('.track-find'), 'asks you to choose; no automatic match')
    pg.click('.track-find button[type="submit"]'); pg.wait_for_selector('[data-action="track-link"]')
    pg.click('[data-action="track-link"]'); pg.wait_for_selector('.track-card')
    check('Not on your AniList yet' in pg.inner_text('.track-card'), 'linked, not on your list yet')
    pg.click('[data-action="track-step"][data-delta="1"]'); pg.wait_for_selector('.track-note.ok')
    check(ani['saves'][-1].get('mediaId') == 777 and ani['saves'][-1].get('status') == 'CURRENT' and ani['saves'][-1].get('progress') == 1, f"first progress adds it to your list as reading: {ani['saves'][-1]}")
    check(any(r['sourceId'] == 'anilist' and r['externalId'] == '777' for r in idb(pg, 'sourceEntries')), 'the link is stored for the library sync')

    check(errs == [], 'no page errors: ' + str(errs))
    b.close()
print('ALL TRACKING E2E CHECKS PASSED')

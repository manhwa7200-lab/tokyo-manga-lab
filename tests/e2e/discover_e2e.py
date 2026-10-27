import json, os
from playwright.sync_api import sync_playwright
S = os.path.dirname(os.path.abspath(__file__))
os.makedirs(S + '/shots', exist_ok=True)
U = 'http://127.0.0.1:8011/index.html'
H = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*'}
ACTION = '391b0423-d847-456f-aff0-8b0cfc03066b'
ROMANCE = '423e2eae-a7a2-4a8b-ac03-a8351462d71d'
TAGS = [{'id': ACTION, 'name': 'Action', 'group': 'genre'}, {'id': ROMANCE, 'name': 'Romance', 'group': 'genre'}, {'id': 'b13b2a48-c720-44a9-9c77-39c9979373fb', 'name': 'Doujinshi', 'group': 'format'}]
seen = []
st = {'tags_fail': False}

def mid(n):
    return f'0000000{n}-0000-4000-8000-000000000000'

def row(n, title, status='ongoing', last=None):
    return {'id': mid(n), 'title': title, 'description': 'x', 'year': 2024, 'status': status, 'contentRating': 'safe', 'authors': ['A'], 'tags': ['Action'], 'coverUrl': None, 'lastChapter': last, 'mangaDexUrl': 'https://mangadex.org/title/x'}

def worker(route):
    url = route.request.url
    if route.request.method == 'OPTIONS':
        return route.fulfill(status=204, headers=H)
    if url.endswith('/health'):
        return route.fulfill(status=200, content_type='application/json', headers=H, body='{"ok":true}')
    if '/api/v1/tags' in url:
        seen.append(url)
        if st['tags_fail']:
            return route.fulfill(status=404, content_type='application/json', headers=H, body='{"error":"nope"}')
        return route.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps({'data': TAGS}))
    if '/api/v1/latest' in url:
        seen.append(url)
        items = [{'sourceId': 'mangadex', 'externalId': mid(n), 'title': f'Fresh {n}', 'publicationStatus': 'releasing', 'contentRating': 'safe', 'tags': [], 'authors': [], 'latestChapter': {'number': str(10 + n), 'publishedAt': '2020-01-05T10:00:00+00:00'}} for n in (1, 2)]
        return route.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps({'data': items, 'pagination': {'page': 1, 'limit': 100, 'total': 100, 'hasNext': False}}))
    seen.append(url)
    q = url.split('?', 1)[1] if '?' in url else ''
    if 'status=completed' in q:
        data = [row(3, 'Finished One', 'completed', '50')]
    else:
        data = [row(1, 'Running One', 'ongoing', '12'), row(2, 'Running Two', 'ongoing', None)]
    return route.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps({'data': data, 'total': len(data), 'limit': 24, 'page': 1}))

def ok(cond, msg):
    print(('PASS ' if cond else 'FAIL ') + msg)
    if not cond:
        raise SystemExit(1)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, service_workers='block')
    ctx.route('**/*.workers.dev/**', worker)
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(U + '#discover'); pg.wait_for_selector('.manga-card', timeout=8000)
    ok(pg.locator('.dc-tab').count() == 2 and pg.locator('.dc-pill').count() == 3, 'ALL / LATEST tabs and Genre / Status / Sort by buttons are there')
    text = pg.inner_text('#discoverResults')
    ok('Up to Ch. 12' in text and 'Ongoing' in text, 'cards show "Up to Ch. N" or the status')
    pg.screenshot(path=S + '/shots/discover.png')
    # Status: completed
    pg.click('[data-action="filter-open"][data-kind="status"]'); pg.wait_for_selector('#filterDialog[open] .fs-chip')
    pg.click('#filterDialog [data-value="completed"]'); pg.click('[data-action="filter-done"]')
    pg.wait_for_selector('text=Finished One')
    ok('status=completed' in seen[-1], 'status goes to the Worker')
    ok('Completed' in pg.inner_text('.card-note') and pg.locator('.dc-pill.is-on').inner_text().strip() == 'Completed', 'Completed card note and active status button')
    # Genre: two picks, then Done
    pg.click('[data-action="filter-open"][data-kind="genre"]'); pg.wait_for_selector('#filterDialog .fs-chip')
    ok(pg.locator('#filterDialog .fs-chip').count() == 3, 'genre sheet lists the genres')
    pg.click(f'#filterDialog [data-value="{ACTION}"]'); pg.click(f'#filterDialog [data-value="{ROMANCE}"]')
    pg.screenshot(path=S + '/shots/discover-genre.png')
    pg.click('[data-action="filter-done"]'); pg.wait_for_timeout(500)
    ok(f'genre={ACTION}%2C{ROMANCE}' in seen[-1], 'both genres go to the Worker')
    ok('Action +1' in pg.inner_text('.dc-pills'), 'genre button shows "Action +1"')
    # closing the sheet without Done discards the choice
    pg.click('[data-action="filter-open"][data-kind="sort"]'); pg.wait_for_selector('#filterDialog[open] .fs-chip')
    pg.click('#filterDialog [data-value="popular"]'); pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    ok('sort=' not in seen[-1] and 'Sort by' in pg.inner_text('.dc-pills'), 'Escape discards the sheet choice')
    pg.click('[data-action="filter-open"][data-kind="sort"]'); pg.wait_for_selector('#filterDialog[open] .fs-chip')
    pg.click('#filterDialog [data-value="new"]'); pg.click('[data-action="filter-done"]'); pg.wait_for_timeout(500)
    ok('sort=new' in seen[-1], 'sort goes to the Worker')
    # clear
    pg.click('[data-action="filter-clear"]'); pg.wait_for_selector('text=Running One')
    ok(pg.locator('.dc-pill.is-on').count() == 0 and 'genre=' not in seen[-1], 'Clear removes every filter')
    # Latest
    pg.click('[data-action="discover-tab"][data-tab="latest"]'); pg.wait_for_selector('.card-date')
    ok(pg.locator('.dc-pill').count() == 0, 'filter buttons are hidden on LATEST')
    ok(pg.locator('.card-date').count() == 2 and 'Jan 5' in pg.inner_text('.card-date >> nth=0'), 'Latest cards carry a date')
    ok('Up to Ch. 11' in pg.inner_text('#discoverResults'), 'Latest cards show the newest chapter')
    pg.screenshot(path=S + '/shots/discover-latest.png')
    pg.click('[data-action="discover-tab"][data-tab="all"]'); pg.wait_for_selector('text=Running One')
    # a Worker without the genre route: friendly message and Retry
    st['tags_fail'] = True
    pg2 = ctx.new_page(); pg2.on('pageerror', lambda e: errs.append(str(e)))
    pg2.goto(U + '#discover'); pg2.wait_for_selector('.manga-card')
    pg2.click('[data-action="filter-open"][data-kind="genre"]'); pg2.wait_for_selector('[data-action="filter-tags-retry"]')
    ok(True, 'genre sheet shows an error and Retry when the list is unavailable')
    st['tags_fail'] = False
    pg2.click('[data-action="filter-tags-retry"]'); pg2.wait_for_selector('#filterDialog .fs-chip')
    ok(True, 'Retry loads the list')
    ok(not errs, f'no page errors: {errs}')
    b.close()
print('discover e2e ok')

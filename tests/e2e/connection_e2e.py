"""Connection stability: a dropped request is retried quietly, the status pill goes offline when the API is down for
good, and the catalogue fills in by itself once the API is back."""
import json, os, sys, urllib.parse
from playwright.sync_api import sync_playwright
S = os.path.dirname(os.path.abspath(__file__)); U = os.environ.get('E2E_URL', 'http://127.0.0.1:8011/index.html')
H = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*'}
fails = []
def ok(c, m):
    print(('PASS ' if c else 'FAIL ') + m)
    if not c: fails.append(m)
def title(i, t): return {'id': f'00000000-0000-4000-8000-{i:012d}', 'title': t, 'description': 'x', 'year': 2023, 'status': 'ongoing', 'contentRating': 'safe', 'authors': ['A'], 'tags': [], 'coverUrl': None, 'mangaDexUrl': 'https://mangadex.org/title/x', 'anilistId': None, 'malId': None}
mode = {'v': 'flaky', 'calls': 0}
def worker(r):
    u = urllib.parse.urlparse(r.request.url)
    if r.request.method == 'OPTIONS': return r.fulfill(status=204, headers=H)
    mode['calls'] += 1
    if mode['v'] == 'down': return r.abort('connectionrefused')
    if mode['v'] == 'flaky' and mode['calls'] % 2 == 1: return r.abort('connectionreset')
    if u.path.endswith('/health'): return r.fulfill(status=200, content_type='application/json', headers=H, body='{"ok":true}')
    return r.fulfill(status=200, content_type='application/json', headers=H, body=json.dumps({'data': [title(1, 'Recovered Title')], 'total': 1, 'limit': 24, 'page': 1}))
with sync_playwright() as p:
    b = p.chromium.launch(); c = b.new_context(viewport={'width': 390, 'height': 844}, service_workers='block')
    c.route('**/*.workers.dev/**', worker); pg = c.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    # 1. every other request drops: retries hide it, the title list still loads and the pill says online
    pg.goto(U + '#discover'); pg.wait_for_selector('.manga-card', timeout=15000)
    ok('Recovered Title' in pg.inner_text('#appView'), 'dropped requests are retried and the list loads')
    ok(pg.get_attribute('#connectionStatus', 'data-state') == 'online', 'pill is online after the retry')
    # 2. API down for good: pill goes offline
    mode['v'] = 'down'
    pg.fill('#discoverSearch', 'zzz'); pg.wait_for_function("() => document.getElementById('connectionStatus').dataset.state==='offline'", timeout=30000)
    ok(True, 'pill goes offline when the API is down')
    # 3. back up: the browser reports online and the app re-checks straight away
    mode['v'] = 'up'
    pg.evaluate("window.dispatchEvent(new Event('online'))")
    pg.wait_for_function("() => document.getElementById('connectionStatus').dataset.state==='online'", timeout=15000)
    ok(True, 'pill returns to online by itself')
    pg.wait_for_timeout(1500)
    ok(pg.query_selector('.manga-card') is not None and 'Recovered Title' in pg.inner_text('#appView'), 'the catalogue fills in again without a manual retry')
    ok(not errs, 'no page errors')
    b.close()
if fails: sys.exit('FAILED: ' + '; '.join(fails))
print('CONNECTION E2E PASSED')

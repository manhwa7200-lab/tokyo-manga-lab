import json, urllib.parse
from playwright.sync_api import sync_playwright
U='http://127.0.0.1:8011/index.html'
H={'access-control-allow-origin':'*','access-control-allow-headers':'*'}
PNG=open('pages/p1.png','rb').read()
def md(i,t,cover): return {'id':f'00000000-0000-4000-8000-{i:012d}','title':t,'description':'d','year':2020,'status':'ongoing','contentRating':'safe','authors':['A'],'tags':[],'coverUrl':cover,'mangaDexUrl':'https://mangadex.org/title/x','anilistId':None,'malId':None}
ITEMS=[md(1,'Good','https://uploads.mangadex.org/covers/a/good.jpg.256.jpg'),
       md(2,'Flaky','https://uploads.mangadex.org/covers/a/flaky.jpg.256.jpg'),
       md(3,'Dead','https://uploads.mangadex.org/covers/a/dead.jpg.256.jpg'),
       md(4,'Evil','https://evil.example/x.jpg'),
       md(5,'NoCover',None)]
def worker(route):
    pu=urllib.parse.urlparse(route.request.url)
    if route.request.method=='OPTIONS': return route.fulfill(status=204,headers=H)
    if pu.path.endswith('/health'): return route.fulfill(status=200,content_type='application/json',headers=H,body='{"ok":true}')
    return route.fulfill(status=200,content_type='application/json',headers=H,body=json.dumps({'data':ITEMS,'total':5,'limit':24,'page':1}))
hits={}
def covers(route):
    u=route.request.url; hits.setdefault(u,0); hits[u]+=1
    if 'good' in u or ('flaky' in u and 'tmlretry' in u): return route.fulfill(status=200,content_type='image/png',body=PNG,headers=H)
    return route.fulfill(status=404,body='no')
evil=[]
def ok(c,m):
    print(('PASS ' if c else 'FAIL ')+m)
    if not c: raise SystemExit(1)
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':390,'height':844},service_workers='block')
    pg=ctx.new_page(); csp=[]; errs=[]
    pg.on('console',lambda m: csp.append(m.text) if 'Content Security Policy' in m.text or 'Refused to' in m.text else None)
    pg.on('pageerror',lambda e:errs.append(str(e)))
    ctx.route('**/*.workers.dev/**',worker); ctx.route('**/uploads.mangadex.org/**',covers)
    ctx.route('**/evil.example/**',lambda r:(evil.append(r.request.url),r.fulfill(status=200,content_type='image/png',body=PNG)))
    pg.goto(U+'#discover'); pg.wait_for_selector('.manga-card'); pg.wait_for_timeout(2500)
    cards=pg.query_selector_all('.manga-card')
    ok(len(cards)==5,'five cards')
    srcset=pg.evaluate("document.querySelector('.manga-card img').getAttribute('srcset')")
    ok(srcset and '512w' in srcset and '.512.jpg' in srcset,'MangaDex cover has a 512 variant: '+str(srcset))
    ok(pg.evaluate("[...document.querySelectorAll('.manga-card')][0].querySelector('img') && !document.querySelectorAll('.manga-card')[0].querySelector('img').hasAttribute('data-cover-loading')"),'good cover finished loading (shimmer cleared)')
    flaky=pg.evaluate("(()=>{const i=document.querySelectorAll('.manga-card')[1].querySelector('img');return i?{src:i.src,loading:i.hasAttribute('data-cover-loading')}:null})()")
    ok(flaky and 'tmlretry=1' in flaky['src'] and not flaky['loading'],'flaky cover recovered on the one automatic retry')
    ok(pg.evaluate("!!document.querySelectorAll('.manga-card')[2].querySelector('.cover-placeholder')"),'dead cover ends on the placeholder')
    retries=[u for u in hits if 'dead' in u]
    ok(len(retries)<=3,'dead cover is asked for a bounded number of times: '+str(len(hits)))
    ok(evil==[],'cover from a foreign host is never requested')
    ok(pg.evaluate("!!document.querySelectorAll('.manga-card')[3].querySelector('.cover-placeholder')"),'foreign cover shows the placeholder')
    ok(pg.evaluate("!!document.querySelectorAll('.manga-card')[4].querySelector('.cover-placeholder')"),'no cover shows the placeholder')
    for h in ['#home','#library','#downloads','#profile','#settings']:
        pg.goto(U+h); pg.wait_for_timeout(700)
    ok(csp==[],'no CSP violations while visiting every screen: '+str(csp[:2]))
    ok(errs==[],'no page errors')
    # compact cover size applies to Home rails + library list
    pg.evaluate("document.documentElement.dataset.coverSize='compact'")
    pg.goto(U+'#discover'); pg.wait_for_timeout(300)
    b.close()
print('ALL COVER E2E CHECKS PASSED')

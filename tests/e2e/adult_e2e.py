import json
from playwright.sync_api import sync_playwright
U='http://127.0.0.1:8011/index.html'
H={'access-control-allow-origin':'*','access-control-allow-headers':'*'}
seen=[]
def m(i,rating):
    return {'id':f'00000000-0000-4000-8000-{i:012d}','title':f'T{i}','description':'x','year':2020,'status':'ongoing','contentRating':rating,'authors':[],'tags':[],'coverUrl':None,'mangaDexUrl':'https://mangadex.org/title/x'}
def worker(route):
    url=route.request.url; seen.append(url)
    if route.request.method=='OPTIONS': return route.fulfill(status=204,headers=H)
    if url.endswith('/health'): return route.fulfill(status=200,content_type='application/json',headers=H,body='{"ok":true}')
    return route.fulfill(status=200,content_type='application/json',headers=H,body=json.dumps({'data':[m(1,'safe'),m(2,'erotica')] if 'adult=1' in url else [m(1,'safe')],'total':1,'limit':24,'page':1}))
def ok(c,msg):
    print(('PASS ' if c else 'FAIL ')+msg)
    if not c: raise SystemExit(1)
def toggle(pg):
    pg.goto(U+'#settings/content'); pg.wait_for_selector('[data-setting="adultContentEnabled"]')
    pg.evaluate("document.querySelector('[data-setting=adultContentEnabled]').click()")
    pg.wait_for_timeout(700)
with sync_playwright() as p:
    b=p.chromium.launch()
    # --- web build
    ctx=b.new_context(viewport={'width':390,'height':844},service_workers='block'); pg=ctx.new_page(); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e))); dialogs=[]
    pg.on('dialog',lambda d:(dialogs.append(d.message),d.accept()))
    ctx.route('**/*.workers.dev/**',worker)
    toggle(pg)
    ok(pg.evaluate("document.querySelector('[data-setting=adultContentEnabled]').checked")==False,'web: toggle refuses to turn on')
    ok(not dialogs,'web: no confirmation shown (nothing to confirm)')
    ok(not any('adult=1' in u for u in seen),'web: no request ever carries adult=1')
    ok('Safe and suggestive' in pg.inner_text('#appView'),'web: ratings row says safe and suggestive')
    ctx.close()
    # --- simulated Android app
    seen.clear()
    ctx=b.new_context(viewport={'width':390,'height':844},service_workers='block'); pg=ctx.new_page(); dialogs=[]
    pg.add_init_script("window.Capacitor={isNativePlatform:()=>true,Plugins:{}}")
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.on('dialog',lambda d:(dialogs.append(d.message),d.dismiss()))
    ctx.route('**/*.workers.dev/**',worker)
    toggle(pg)
    ok(len(dialogs)==1 and 'not age verification' in dialogs[0],'app: confirmation explains it is not age verification')
    ok(pg.evaluate("document.querySelector('[data-setting=adultContentEnabled]').checked")==False,'app: declining the confirmation keeps it off')
    ok(not any('adult=1' in u for u in seen),'app: still no adult=1 after declining')
    pg.remove_listener('dialog',pg.listeners('dialog')[0]) if hasattr(pg,'listeners') else None
    ctx.close()
    ctx=b.new_context(viewport={'width':390,'height':844},service_workers='block'); pg=ctx.new_page(); seen.clear()
    pg.add_init_script("window.Capacitor={isNativePlatform:()=>true,Plugins:{}}")
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.on('dialog',lambda d:d.accept())
    ctx.route('**/*.workers.dev/**',worker)
    toggle(pg)
    ok(pg.evaluate("document.querySelector('[data-setting=adultContentEnabled]').checked")==True,'app: accepting turns it on')
    ok(any('adult=1' in u for u in seen),'app: requests now carry adult=1')
    ok('Includes adult' in pg.inner_text('#appView'),'app: ratings row updates')
    # turning it off again hides cached adult titles and stops sending the flag
    seen.clear()
    pg.evaluate("document.querySelector('[data-setting=adultContentEnabled]').click()"); pg.wait_for_timeout(900)
    ok(not any('adult=1' in u for u in seen),'app: turning it off stops adult=1')
    ok(errs==[],'no page errors '+'; '.join(errs))
    b.close()
print('ADULT GATE E2E PASSED')

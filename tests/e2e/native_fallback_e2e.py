
import json, base64
from playwright.sync_api import sync_playwright
import os
S = os.path.dirname(os.path.abspath(__file__))
os.makedirs(S + '/shots', exist_ok=True)
U='http://127.0.0.1:8011/index.html'
MID='00000000-0000-4000-8000-000000000000'; C1='22222222-2222-4222-8222-222222222222'
H={'access-control-allow-origin':'*','access-control-allow-headers':'*'}
PNG=open(S+'/pages/p1.png','rb').read(); B64=base64.b64encode(PNG).decode()
reports=[]; mode={'native':'ok'}
def worker(route):
    url=route.request.url
    if route.request.method=='OPTIONS': return route.fulfill(status=204,headers=H)
    if url.endswith('/health'): return route.fulfill(status=200,content_type='application/json',headers=H,body='{"ok":true}')
    if '/pages' in url: return route.fulfill(status=200,content_type='application/json',headers=H,body=json.dumps({'data':{'chapterId':C1,'baseUrl':'https://node.example.network:30000','hash':'abc123def456','data':['1.png','2.png'],'dataSaver':['1.jpg','2.jpg']}}))
    if '/chapters' in url:
        ch={'sourceId':'mangadex','externalId':C1,'mangaExternalId':MID,'chapterNumber':'1','volumeNumber':None,'title':'','language':'en','pages':2,'publishedAt':'2025-01-01T00:00:00Z','scanlationGroups':[],'sourceUrl':'https://mangadex.org/chapter/'+C1}
        return route.fulfill(status=200,content_type='application/json',headers=H,body=json.dumps({'data':[ch],'pagination':{'page':1,'limit':24,'total':1,'hasNext':False}}))
    if '/api/v1/manga/' in url:
        return route.fulfill(status=200,content_type='application/json',headers=H,body=json.dumps({'data':{'sourceId':'mangadex','externalId':MID,'id':'x','title':'T','contentType':'manga'}}))
    return route.fulfill(status=200,content_type='application/json',headers=H,body=json.dumps({'data':[{'id':MID,'title':'T','description':'x','year':2020,'status':'ongoing','contentRating':'safe','authors':[],'tags':[],'coverUrl':None,'mangaDexUrl':'https://mangadex.org/title/x'}],'total':1,'limit':24,'page':1}))
def report(route):
    if route.request.method=='OPTIONS': return route.fulfill(status=204,headers=H)
    reports.append(json.loads(route.request.post_data)); return route.fulfill(status=200,headers=H,body='')
def ok(c,m):
    print(('PASS ' if c else 'FAIL ')+m)
    if not c: raise SystemExit(1)
INIT="""
window.__nativeMode='ok';
window.Capacitor={isNativePlatform:()=>true,Plugins:{CapacitorHttp:{get:async(o)=>{
  window.__nativeCalls=(window.__nativeCalls||0)+1;
  if(window.__nativeMode==='ok') return {status:200,data:'%s',headers:{'Content-Type':'image/png','X-Cache':'HIT'}};
  if(window.__nativeMode==='403') return {status:403,data:'',headers:{}};
  throw new Error('Unable to resolve host');
}}}};
""" % B64
with sync_playwright() as p:
    b=p.chromium.launch(); errs=[]
    for scenario in ('ok','403','down'):
        reports.clear()
        ctx=b.new_context(viewport={'width':390,'height':844},service_workers='block'); pg=ctx.new_page()
        pg.on('pageerror',lambda e:errs.append(str(e)))
        ctx.add_init_script("localStorage.setItem('tml-reader-tips-seen','1')")
        pg.add_init_script(INIT.replace("window.__nativeMode='ok'","window.__nativeMode='%s'"%scenario))
        ctx.route('**/*.workers.dev/**',worker)
        ctx.route('**/*.example.network:30000/**',lambda r:r.abort('failed'))   # the WebView cannot load these images
        ctx.route('https://api.mangadex.network/**',report)
        pg.goto(U+'#discover'); pg.wait_for_selector('[data-action="details"]'); pg.click('[data-action="details"]')
        pg.wait_for_selector('[data-action="read-chapter"]'); pg.click('[data-action="read-chapter"]'); pg.wait_for_selector('.reader-img')
        pg.wait_for_timeout(2500)
        if scenario=='ok':
            src=pg.evaluate("document.querySelector('.reader-img').src")
            ok(src.startswith('blob:'),'ok: page shown from app-network copy (blob URL)')
            ok(pg.evaluate("document.querySelector('.reader-img').naturalWidth")>0,'ok: image actually decoded')
            ok(pg.locator('.reader-retry').count()==0,'ok: no failure box')
            good=[r for r in reports if r['success']]
            ok(good and good[0]['bytes']==len(PNG) and good[0]['cached'] is True,'ok: report carries real byte size and X-Cache=HIT')
            ok(any(not r['success'] for r in reports),'ok: the WebView failure was reported too')
            pg.screenshot(path=S+'/shots/native-ok.png')
        else:
            txt=pg.locator('.reader-retry').first.inner_text()
            if scenario=='403': ok('403' in txt and 'refused' in txt,'403: failure box names the status')
            else: ok('Could not connect' in txt and 'Unable to resolve host' in txt,'down: failure box says the server was unreachable and why')
            ok('node.example.network:30000' in txt,'%s: failure box names the host and port' % scenario)
            pg.screenshot(path=S+'/shots/native-%s.png'%scenario)
            # manual retry with native working again
            pg.evaluate("window.__nativeMode='ok'"); pg.click('.reader-retry >> button >> nth=0'); pg.wait_for_timeout(1500)
            ok(pg.evaluate("document.querySelector('.reader-img').src").startswith('blob:'),'%s: manual retry recovers once the network does' % scenario)
        ctx.close()
    ok(errs==[],'no page errors '+'; '.join(errs))
    b.close()
print('NATIVE FALLBACK E2E PASSED')

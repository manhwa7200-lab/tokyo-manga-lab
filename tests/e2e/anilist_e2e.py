import json
from playwright.sync_api import sync_playwright
import os
S = os.path.dirname(os.path.abspath(__file__))
os.makedirs(S + '/shots', exist_ok=True)
U='http://127.0.0.1:8011/index.html'
TOKEN='eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.'+'a'*60+'.'+'b'*40
UUID='32d76d19-8a05-4db0-9fc2-e0b0648fe9d0'
def manga(i,al=None):
    return {'id':f'00000000-0000-4000-8000-{i:012d}','title':['One Piece','Frieren','Chainsaw Man'][i],'description':'x','year':1997,'status':'ongoing','contentRating':'safe','authors':['A'],'tags':['Action'],'coverUrl':None,'mangaDexUrl':'https://mangadex.org/title/x','anilistId':al,'malId':None}
remote={'entries':[
  {'id':1,'mediaId':100,'status':'CURRENT','progress':12,'updatedAt':1700000000,'media':{'id':100,'siteUrl':'https://anilist.co/manga/100','isAdult':False,'genres':['Action'],'startDate':{'year':2020},'title':{'romaji':'Linked Title','english':'Linked Title','native':None},'coverImage':{'large':None},'description':'d','externalLinks':[{'site':'MangaDex','url':f'https://mangadex.org/title/{UUID}'}]}},
  {'id':2,'mediaId':101,'status':'PLANNING','progress':0,'updatedAt':1700000001,'media':{'id':101,'siteUrl':'https://anilist.co/manga/101','isAdult':False,'genres':[],'startDate':{'year':2018},'title':{'romaji':'Only On AniList','english':None,'native':None},'coverImage':{'large':None},'description':'','externalLinks':[]}},
  {'id':3,'mediaId':102,'status':'COMPLETED','progress':5,'updatedAt':1700000002,'media':{'id':102,'siteUrl':'https://anilist.co/manga/102','isAdult':True,'genres':[],'startDate':{'year':2019},'title':{'romaji':'Adult Title','english':None,'native':None},'coverImage':{'large':None},'description':'','externalLinks':[]}}]}
saves=[]; viewer_calls=[]
def handler(route):
    url=route.request.url; h={'access-control-allow-origin':'*','access-control-allow-headers':'*'}
    if route.request.method=='OPTIONS': return route.fulfill(status=204,headers=h)
    if 'graphql.anilist.co' in url:
        body=json.loads(route.request.post_data); q=body['query']; v=body.get('variables',{})
        auth=route.request.headers.get('authorization','')
        if 'Viewer' in q:
            viewer_calls.append(auth)
            return route.fulfill(status=200,content_type='application/json',headers=h,body=json.dumps({'data':{'Viewer':{'id':7,'name':'Kai','siteUrl':'https://anilist.co/user/Kai','avatar':{'medium':None}}}}))
        if 'MediaListCollection' in q:
            return route.fulfill(status=200,content_type='application/json',headers=h,body=json.dumps({'data':{'MediaListCollection':{'hasNextChunk':False,'lists':[{'entries':remote['entries']}]}}}))
        if 'SaveMediaListEntry' in q:
            saves.append(v)
            for e in remote['entries']:
                if e['mediaId']==v['mediaId']: e['status']=v['status']; break
            else:
                remote['entries'].append({'id':900+v['mediaId'],'mediaId':v['mediaId'],'status':v['status'],'progress':0,'updatedAt':1800000000,'media':{'id':v['mediaId'],'siteUrl':'x','isAdult':False,'genres':[],'startDate':{},'title':{'romaji':'Pushed','english':None,'native':None},'coverImage':{},'description':'','externalLinks':[]}})
            return route.fulfill(status=200,content_type='application/json',headers=h,body=json.dumps({'data':{'SaveMediaListEntry':{'id':900+v['mediaId'],'mediaId':v['mediaId'],'status':v['status'],'progress':0,'updatedAt':1800000000}}}))
    if 'workers.dev' in url:
        if url.endswith('/health'): return route.fulfill(status=200,content_type='application/json',headers=h,body='{"ok":true}')
        return route.fulfill(status=200,content_type='application/json',headers=h,body=json.dumps({'data':[manga(0,'30013'),manga(1,None)],'total':2,'limit':24,'page':1}))
    return route.continue_()
def ok(cond,msg):
    print(('PASS ' if cond else 'FAIL ')+msg)
    if not cond: raise SystemExit(1)
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,service_workers='block')
    pg=ctx.new_page(); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    ctx.route('**/*',lambda r: handler(r) if ('anilist.co' in r.request.url or 'workers.dev' in r.request.url) else r.continue_())
    dialogs=[]
    def on_dialog(d):
        dialogs.append((d.type,d.message))
        d.accept(TOKEN if d.type=='prompt' else None)
    pg.on('dialog',on_dialog)

    # --- DB upgrade v1 -> v2 keeps existing data
    pg.goto('http://127.0.0.1:8011/manifest.webmanifest')
    pg.evaluate("""() => new Promise((res,rej)=>{const r=indexedDB.open('tokyo-manga-lab',1);r.onupgradeneeded=e=>{const db=e.target.result;const s=db.createObjectStore('appSettings',{keyPath:'key'});s.createIndex('updatedAt','updatedAt');s.put({key:'coverSize',value:'compact',updatedAt:'x'});for(const n of ['contentItems','sourceEntries','libraryEntries','collections','collectionItems','readingProgress','chapterProgress','bookmarks','localFiles','sourceSettings','readingSessions','activityEvents','downloadJobs','syncOutbox','schemaMeta','apiCache','savedViews','chapterRecords','chapterAssets','downloadedAssets','statisticsCache']) db.createObjectStore(n,{keyPath: n==='schemaMeta'||n==='appSettings'?'key':n==='sourceSettings'?'sourceId':n==='apiCache'?'cacheKey':n==='statisticsCache'?'key':'id'});};r.onsuccess=()=>{r.result.close();res()};r.onerror=()=>rej(r.error)})""")
    pg.goto(U+'#settings/account'); pg.wait_for_timeout(1500)
    stores=pg.evaluate("""() => new Promise(res=>{const r=indexedDB.open('tokyo-manga-lab');r.onsuccess=()=>{res({v:r.result.version,s:[...r.result.objectStoreNames]});r.result.close()}})""")
    ok(stores['v']==2 and 'accountLinks' in stores['s'] and 'syncLinks' in stores['s'],'DB upgraded to v2 with new stores')
    ok(pg.evaluate("document.documentElement.dataset.coverSize")=='compact','existing v1 setting survived the upgrade')

    # --- Paste-token connect, push opt-in prompt
    pg.screenshot(path=S+'/shots/anilist-disconnected.png')
    pg.click('[data-action="anilist-paste-token"]'); pg.wait_for_timeout(1200)
    ok(any(t=='prompt' for t,_ in dialogs),'token prompt shown')
    ok(any(t=='confirm' and 'AniList' in m for t,m in dialogs),'push opt-in asked after connect')
    ok(viewer_calls and viewer_calls[0]==f'Bearer {TOKEN}','Viewer call carried bearer token')
    ok('Connected as Kai' in pg.inner_text('.row.is-info'),'settings shows connected account')
    ok(pg.is_checked('[data-setting="anilistPushEnabled"]'),'push toggle on after accepting')

    # --- Save a MangaDex title locally (has anilistId 30013) and mark it, before syncing
    pg.goto(U+'#discover'); pg.wait_for_timeout(1000)
    pg.click('.card-save >> nth=0'); pg.wait_for_timeout(1500)
    ok(any(sv['mediaId']==30013 and sv['status']=='PLANNING' for sv in saves),'saving a linked title queued and pushed PLANNING to AniList')

    # --- Full sync
    saves_before=len(saves)
    pg.goto(U+'#settings/account'); pg.wait_for_timeout(600)
    pg.click('[data-action="anilist-sync"]'); pg.wait_for_timeout(4000)
    res=pg.inner_text('#anilistResult'); print('SYNC RESULT:',res)
    ok('2 updated here' in res,'pulled the 2 safe titles')
    ok('1 adult title skipped' in res,'adult title skipped while adult setting is off')
    pg.goto(U+'#library'); pg.wait_for_timeout(900)
    txt=pg.inner_text('#appView'); pg.screenshot(path=S+'/shots/anilist-library.png')
    ok('Linked Title' in txt and 'Only On AniList' in txt and 'Adult Title' not in txt,'library has the pulled titles, not the adult one')
    ok('AniList · ch. 12' in txt,'library card shows AniList progress')
    # linked item opens MangaDex-backed details; anilist-only opens AniList link
    # --- Second sync: nothing to do
    pg.goto(U+'#settings/account'); pg.wait_for_timeout(500)
    pg.click('[data-action="anilist-sync"]'); pg.wait_for_timeout(2500)
    res2=pg.inner_text('#anilistResult'); print('SYNC 2:',res2)
    ok('updated here' not in res2 and 'sent to AniList' not in res2,'second sync changes nothing')

    # --- Local status change -> outbox push
    n=len(saves)
    pg.goto(U+'#library'); pg.wait_for_timeout(700)
    pg.select_option('[data-library-status] >> nth=0','completed'); pg.wait_for_timeout(2500)
    ok(len(saves)>n and saves[-1]['status']=='COMPLETED','local status change was pushed as COMPLETED')

    # --- Remote change -> pulled
    for e in remote['entries']:
        if e['mediaId']==101: e['status']='CURRENT'
    pg.goto(U+'#settings/account'); pg.wait_for_timeout(500)
    pg.click('[data-action="anilist-sync"]'); pg.wait_for_timeout(2500)
    res3=pg.inner_text('#anilistResult'); print('SYNC 3:',res3)
    ok('1 updated here' in res3,'remote status change pulled into library')

    # --- Backup must not contain the token
    leak=pg.evaluate("""async()=>{const m=await import('/src/data/repositories/library-repository.js');return JSON.stringify(await m.exportBackup())}""")
    ok(TOKEN not in leak and 'accessToken' not in leak,'backup export contains no AniList token')

    # --- Sign out
    pg.goto(U+'#settings/account'); pg.wait_for_timeout(500)
    pg.click('[data-action="anilist-disconnect"]'); pg.wait_for_timeout(800)
    ok('Not connected' in pg.inner_text('.row.is-info'),'signed out')
    pg.goto(U+'#library'); pg.wait_for_timeout(600)
    ok('Linked Title' in pg.inner_text('#appView'),'library kept after sign-out')

    # --- One-tap flow with a fake Capacitor shell
    ctx2=b.new_context(viewport={'width':390,'height':844},service_workers='block')
    ctx2.add_init_script("""window.__cb=null;window.__opened=null;window.Capacitor={isNativePlatform:()=>true,Plugins:{App:{addListener:async(n,cb)=>{window.__cb=cb},getLaunchUrl:async()=>null},Browser:{open:async({url})=>{window.__opened=url},close:async()=>{window.__closed=true}}}};""")
    ctx2.route('**/*',lambda r: handler(r) if ('anilist.co' in r.request.url or 'workers.dev' in r.request.url) else r.continue_())
    p2=ctx2.new_page(); p2.on('dialog',lambda d:d.accept())
    p2.goto(U+'#settings/account'); p2.wait_for_timeout(1200)
    p2.click('[data-action="anilist-connect"]'); p2.wait_for_timeout(500)
    ok('toast' and p2.evaluate("window.__opened")is None,'no sign-in without a client id')
    p2.fill('[data-setting="anilistClientId"]','12345'); p2.keyboard.press('Tab'); p2.wait_for_timeout(500)
    p2.click('[data-action="anilist-connect"]'); p2.wait_for_timeout(600)
    opened=p2.evaluate("window.__opened"); print('OPENED',opened)
    ok(opened and 'client_id=12345' in opened and 'response_type=token' in opened,'sign-in opens AniList authorize page')
    p2.evaluate("window.__cb({url:'https://evil.example/#access_token=x'})"); p2.wait_for_timeout(300)
    ok('Not connected' in p2.inner_text('.row.is-info'),'foreign links are ignored')
    p2.evaluate(f"window.__cb({{url:'tokyomangalab://anilist-auth#access_token={TOKEN}&token_type=Bearer&expires_in=31536000'}})"); p2.wait_for_timeout(1200)
    ok('Connected as Kai' in p2.inner_text('.row.is-info'),'app link completes sign-in')
    p2.evaluate("window.__cb({url:'tokyomangalab://anilist-auth#access_token=%s'})" % ('z'*50)); p2.wait_for_timeout(500)
    ok('Connected as Kai' in p2.inner_text('.row.is-info'),'unsolicited token link does not replace the account')
    p2.screenshot(path=S+'/shots/anilist-connected.png')
    print('ERRORS',errs)
    b.close()
print('ALL E2E CHECKS PASSED')

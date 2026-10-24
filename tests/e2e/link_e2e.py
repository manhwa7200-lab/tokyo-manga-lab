import json, urllib.parse
from playwright.sync_api import sync_playwright
import os
S = os.path.dirname(os.path.abspath(__file__))
os.makedirs(S + '/shots', exist_ok=True)
U='http://127.0.0.1:8011/index.html'
U_EXACT='32d76d19-8a05-4db0-9fc2-e0b0648fe9d0'
U_A='4d5e6f70-1a2b-4c3d-8e9f-a0b1c2d3e4f5'   # no AniList id on MangaDex
U_B='5e6f7081-2b3c-4d4e-9fa0-b1c2d3e4f506'   # other AniList id
U_C='6f708192-3c4d-4e5f-8fa0-c2d3e4f50617'   # found by manual search
C1='22222222-2222-4222-8222-222222222222'
H={'access-control-allow-origin':'*','access-control-allow-headers':'*'}
log={'search':[], 'chapters':[], 'details':[]}

def md(i,title,al=None,rating='safe'):
    return {'id':i,'title':title,'description':'MD synopsis','year':2001,'status':'ongoing','contentRating':rating,'authors':['Author'],'tags':['Action'],'coverUrl':None,'mangaDexUrl':f'https://mangadex.org/title/{i}','anilistId':al,'malId':None}

def worker(route):
    url=route.request.url; pu=urllib.parse.urlparse(url); q=urllib.parse.parse_qs(pu.query)
    if route.request.method=='OPTIONS': return route.fulfill(status=204,headers=H)
    if pu.path.endswith('/health'): return route.fulfill(status=200,content_type='application/json',headers=H,body='{"ok":true}')
    if pu.path.endswith('/chapters'):
        mid=pu.path.split('/')[-2]; log['chapters'].append(mid)
        ch={'sourceId':'mangadex','externalId':C1,'mangaExternalId':mid,'chapterNumber':'7','volumeNumber':None,'title':'','language':'en','pages':3,'publishedAt':'2025-01-01T00:00:00Z','scanlationGroups':['G'],'sourceUrl':f'https://mangadex.org/chapter/{C1}'}
        return route.fulfill(status=200,content_type='application/json',headers=H,body=json.dumps({'data':[ch],'pagination':{'page':1,'limit':24,'total':1,'hasNext':False}}))
    if '/api/v1/manga/' in pu.path:
        log['details'].append(pu.path); return route.fulfill(status=404,content_type='application/json',headers=H,body='{}')
    if pu.path.endswith('/manga'):
        text=(q.get('q') or [''])[0]; log['search'].append(text)
        t=text.lower()
        if t=='exact title': data=[md(U_A,'Exact Title (fan version)'),md(U_EXACT,'Exact Title','100')]
        elif t=='only on anilist': data=[md(U_A,'Only On AniList'),md(U_B,'Only On Anilist Remake','999'),md('7a8b9c0d-4d5e-4f60-8a1b-d3e4f5061728','Adult one',None,'erotica')]
        elif t=='manual name': data=[md(U_C,'Manual Result')]
        else: data=[]
        return route.fulfill(status=200,content_type='application/json',headers=H,body=json.dumps({'data':data,'total':len(data),'limit':24,'page':1}))
    return route.fulfill(status=200,content_type='application/json',headers=H,body='{"data":[]}')

def ok(c,m):
    print(('PASS ' if c else 'FAIL ')+m)
    if not c: raise SystemExit(1)

SEED="""async (items) => { const db = await new Promise((res,rej)=>{const r=indexedDB.open('tokyo-manga-lab'); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error)});
 const tx = db.transaction(['contentItems','sourceEntries','libraryEntries'],'readwrite'); const now = new Date().toISOString();
 for (const it of items) {
  tx.objectStore('contentItems').put({id:it.id,sourceId:'anilist',externalId:it.mid,contentType:'manga',title:it.title,alternateTitles:[],description:it.desc,coverUrl:null,authors:[],artists:[],genres:[],tags:[],publicationStatus:'unknown',releaseYear:2020,language:null,sourceUrl:'https://anilist.co/manga/'+it.mid,contentRating:'unknown',createdAt:now,updatedAt:now});
  tx.objectStore('sourceEntries').put({id:'anilist:'+it.mid,contentItemId:it.id,sourceId:'anilist',externalId:it.mid,sourceUrl:'https://anilist.co/manga/'+it.mid,sourceTitle:it.title,language:null,availabilityStatus:'available',lastCheckedAt:now});
  tx.objectStore('libraryEntries').put({id:'local-default:'+it.id,profileId:'local-default',contentItemId:it.id,personalStatus:'planned',isFavorite:false,userRating:null,customTitle:null,notes:null,addedAt:now,updatedAt:now});
 }
 await new Promise((res,rej)=>{tx.oncomplete=res; tx.onerror=()=>rej(tx.error)}); db.close(); }"""
ROWS="""() => new Promise(res=>{const r=indexedDB.open('tokyo-manga-lab');r.onsuccess=()=>{const g=r.result.transaction('sourceEntries').objectStore('sourceEntries').getAll();g.onsuccess=()=>{res(g.result);r.result.close()}}})"""

def open_title(pg, title):
    pg.goto(U+'#library'); pg.wait_for_selector('.library-card', timeout=8000)
    if pg.locator('#detailsDialog[open]').count(): pg.click('[data-action="close-details"]')
    pg.locator('.library-card', has_text=title).locator('[data-action="details"]').click()
    pg.wait_for_selector('#detailsDialog[open]')

with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,service_workers='block')
    ctx.add_init_script("localStorage.setItem('tml-reader-tips-seen','1')")
    pg=ctx.new_page(); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    ctx.route('**/*.workers.dev/**',worker)
    dialogs=[]
    pg.on('dialog',lambda d:(dialogs.append((d.type,d.message)),d.accept()))
    pg.goto(U+'#settings'); pg.wait_for_timeout(1200)
    pg.evaluate(SEED,[{'id':'item-exact','mid':'100','title':'Exact Title','desc':'AniList synopsis for exact'},
                      {'id':'item-pick','mid':'101','title':'Only On AniList','desc':'AniList synopsis for pick'}])

    # ---- A. exact AniList ID match links automatically
    open_title(pg,'Exact Title')
    pg.wait_for_selector('.link-banner', timeout=8000); pg.wait_for_selector('.chapter-row', timeout=8000)
    ok('Exact Title' in log['search'], 'MangaDex searched with the AniList title')
    ok(log['chapters']==[U_EXACT], 'chapters loaded for the MangaDex record whose anilistId matched')
    ok('matched by AniList ID' in pg.inner_text('.link-banner'), 'banner says it was matched by AniList ID')
    ok('AniList synopsis for exact' in pg.inner_text('#detailsContent'), 'AniList description kept')
    ok(pg.locator('.link-candidate').count()==0, 'no picker shown for an exact match')
    rows=pg.evaluate(ROWS); link=[r for r in rows if r.get('linkRole')]
    ok(len(link)==1 and link[0]['externalId']==U_EXACT and link[0]['linkKind']=='anilist-id' and link[0]['contentItemId']=='item-exact', 'link row stored on the AniList item')
    ok(any(r['id']=='anilist:100' and r['contentItemId']=='item-exact' for r in rows) and not any(r['id']==f'mangadex:{U_EXACT}' for r in rows), 'identity mapping untouched; no mangadex:<id> row hijacked')
    pg.screenshot(path=S+'/shots/link-exact.png')

    # ---- reader works from the linked chapter list
    ok(pg.locator('[data-action="read-chapter"]').count()==1, 'Read button available on linked chapters')
    pg.click('[data-action="read-chapter"]'); pg.wait_for_function("location.hash.startsWith('#read/')")
    ok(pg.evaluate("location.hash")==f'#read/{C1}', 'reader route opened for the MangaDex chapter')
    pg.goto(U+'#library'); pg.wait_for_selector('.library-card')

    # ---- B. no exact match: picker, nothing linked until chosen
    searches_before=len(log['search'])
    open_title(pg,'Only On AniList')
    pg.wait_for_selector('.link-candidate', timeout=8000)
    ok(pg.locator('.link-candidate').count()==2, 'two visible candidates (adult-rated one filtered out)')
    ok(pg.locator('.link-banner').count()==0 and log['chapters']==[U_EXACT], 'no chapter request and no link before choosing')
    ok(not [r for r in pg.evaluate(ROWS) if r.get('contentItemId')=='item-pick' and r.get('linkRole')], 'no link row written for similar-looking titles')
    texts=pg.inner_text('.link-candidates')
    ok('No AniList ID on MangaDex' in texts and 'lists AniList #999' in texts, 'candidates show how MangaDex relates them to AniList IDs')
    ok(pg.locator('.link-candidate >> text=Link anyway').count()==1, 'candidate tied to another AniList ID needs "Link anyway"')
    ok(pg.locator('.link-candidate-open').first.get_attribute('rel')=='noopener noreferrer', 'preview links use rel=noopener noreferrer')
    ok('AniList synopsis for pick' in pg.inner_text('#detailsContent'), 'AniList description visible while picking')
    pg.screenshot(path=S+'/shots/link-picker.png')

    # manual search inside the picker
    pg.fill('#linkQuery','manual name'); pg.press('#linkQuery','Enter'); pg.wait_for_selector('.link-candidate >> text=Manual Result')
    ok('manual name' in log['search'] and pg.locator('.link-candidate').count()==1, 'manual search shows its own candidates')
    pg.fill('#linkQuery','Only On AniList'); pg.press('#linkQuery','Enter'); pg.wait_for_selector('.link-candidate >> nth=1')

    # choose candidate A
    pg.locator('.link-candidate', has_text='Only On AniList').first.locator('[data-action="link-select"]').click()
    pg.wait_for_selector('.link-banner'); pg.wait_for_selector('.chapter-row')
    ok(log['chapters'][-1]==U_A, 'chapters now come from the selected MangaDex record')
    ok('chosen by you' in pg.inner_text('.link-banner'), 'banner says the link was chosen by the user')
    link=[r for r in pg.evaluate(ROWS) if r.get('contentItemId')=='item-pick' and r.get('linkRole')]
    ok(len(link)==1 and link[0]['linkKind']=='user-selected' and link[0]['externalId']==U_A, 'user-selected link stored')
    ok('AniList synopsis for pick' in pg.inner_text('#detailsContent') and 'MD synopsis' not in pg.inner_text('#detailsContent'), 'AniList description still shown (MangaDex only a fallback)')
    ok('Filled in from MangaDex' in pg.inner_text('#detailsContent'), 'blanks (authors/tags) are filled from MangaDex and disclosed')
    pg.screenshot(path=S+'/shots/link-chosen.png')

    # ---- C. reopening uses the stored link with no new search
    n=len(log['search'])
    open_title(pg,'Only On AniList'); pg.wait_for_selector('.chapter-row')
    ok(len(log['search'])==n and log['chapters'][-1]==U_A, 'stored link is reused without searching again')

    # ---- D. change match, then unlink
    pg.click('[data-action="link-change"]'); pg.wait_for_selector('.link-candidate')
    ok(pg.locator('[data-action="link-cancel"]').count()==1, 'change flow offers to keep the current link')
    pg.click('[data-action="link-cancel"]'); pg.wait_for_selector('.link-banner')
    pg.click('[data-action="link-remove"]'); pg.wait_for_selector('.link-candidate')
    ok(any(t=='confirm' and 'Unlink' in m for t,m in dialogs), 'unlink asks for confirmation')
    ok(not [r for r in pg.evaluate(ROWS) if r.get('contentItemId')=='item-pick' and r.get('linkRole')], 'link row removed on unlink')
    lib=pg.evaluate("""() => new Promise(res=>{const r=indexedDB.open('tokyo-manga-lab');r.onsuccess=()=>{const g=r.result.transaction('libraryEntries').objectStore('libraryEntries').get('local-default:item-pick');g.onsuccess=()=>{res(g.result);r.result.close()}}})""")
    ok(lib and lib['personalStatus']=='planned', 'library entry untouched by unlink')

    # ---- E. search disabled: clear message, no request
    pg.evaluate("""async () => { const db = await new Promise(r=>{const q=indexedDB.open('tokyo-manga-lab');q.onsuccess=()=>r(q.result)}); const tx=db.transaction('appSettings','readwrite'); tx.objectStore('appSettings').put({key:'enableOnlineSearch',value:false,updatedAt:new Date().toISOString()}); await new Promise(r=>tx.oncomplete=r); db.close(); }""")
    n=len(log['search'])
    pg.goto(U+'#library'); pg.reload(); pg.wait_for_selector('.library-card')
    pg.locator('.library-card', has_text='Only On AniList').locator('[data-action="details"]').click()
    pg.wait_for_selector('.link-panel .notice')
    ok('turned off' in pg.inner_text('.link-panel .notice') and len(log['search'])==n, 'online search off: explains it and makes no request')

    ok(errs==[], 'no page errors: '+'; '.join(errs))
    b.close()
print('ALL LINK E2E CHECKS PASSED')

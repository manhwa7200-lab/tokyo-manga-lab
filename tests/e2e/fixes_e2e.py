import json, urllib.parse
from playwright.sync_api import sync_playwright
U='http://127.0.0.1:8011/index.html'
H={'access-control-allow-origin':'*','access-control-allow-headers':'*'}
C1='22222222-2222-4222-8222-222222222222'
searches=[]; chapter_calls=[]
def md(i,t,rating='safe'): return {'id':f'00000000-0000-4000-8000-{i:012d}','title':t,'description':'d','year':2020,'status':'ongoing','contentRating':rating,'authors':['A'],'tags':['Action'],'coverUrl':None,'mangaDexUrl':'https://mangadex.org/title/x','anilistId':None,'malId':None}
def worker(route):
    pu=urllib.parse.urlparse(route.request.url)
    if route.request.method=='OPTIONS': return route.fulfill(status=204,headers=H)
    if pu.path.endswith('/health'): return route.fulfill(status=200,content_type='application/json',headers=H,body='{"ok":true}')
    if pu.path.endswith('/chapters'):
        chapter_calls.append(pu.path)
        ch={'sourceId':'mangadex','externalId':C1,'mangaExternalId':'x','chapterNumber':'1','volumeNumber':None,'title':'','language':'en','pages':3,'publishedAt':'2025-01-01T00:00:00Z','scanlationGroups':[],'sourceUrl':f'https://mangadex.org/chapter/{C1}'}
        return route.fulfill(status=200,content_type='application/json',headers=H,body=json.dumps({'data':[ch],'pagination':{'page':1,'limit':24,'total':1,'hasNext':False}}))
    if '/api/v1/manga/' in pu.path: return route.fulfill(status=404,content_type='application/json',headers=H,body='{}')
    q=urllib.parse.parse_qs(pu.query).get('q',[''])[0]; searches.append(q)
    return route.fulfill(status=200,content_type='application/json',headers=H,body=json.dumps({'data':[md(1,'Result '+q)],'total':1,'limit':24,'page':1}))
def ok(c,m):
    print(('PASS ' if c else 'FAIL ')+m)
    if not c: raise SystemExit(1)
SEED="""async (items) => { const db = await new Promise((res,rej)=>{const r=indexedDB.open('tokyo-manga-lab'); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error)});
 const tx = db.transaction(['contentItems','libraryEntries'],'readwrite'); const now = new Date().toISOString();
 for (const it of items) {
  tx.objectStore('contentItems').put({id:it.id,sourceId:'mangadex',externalId:it.mid,contentType:'manga',title:it.title,alternateTitles:[],description:'',coverUrl:null,authors:[],artists:[],genres:[],tags:[],publicationStatus:'unknown',releaseYear:2020,language:null,sourceUrl:'https://mangadex.org/title/'+it.mid,contentRating:it.rating,createdAt:now,updatedAt:now});
  tx.objectStore('libraryEntries').put({id:'local-default:'+it.id,profileId:'local-default',contentItemId:it.id,personalStatus:'reading',isFavorite:false,userRating:null,customTitle:null,notes:null,addedAt:now,updatedAt:now});
 }
 await new Promise((res,rej)=>{tx.oncomplete=res; tx.onerror=()=>rej(tx.error)}); db.close(); }"""
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(viewport={'width':390,'height':844},service_workers='block')
    ctx.add_init_script("localStorage.setItem('tml-reader-tips-seen','1')")
    pg=ctx.new_page(); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    ctx.route('**/*.workers.dev/**',worker)

    # 1. search keeps focus while typing
    pg.goto(U+'#discover'); pg.wait_for_selector('.manga-card')
    pg.click('#discoverSearch'); pg.keyboard.type('naruto',delay=100); pg.wait_for_timeout(1600)
    ok(pg.evaluate("document.activeElement && document.activeElement.id")=='discoverSearch','discover: search box keeps focus after the debounce')
    ok('naruto' in searches,'discover: debounced search ran')
    ok('Result naruto' in pg.inner_text('#discoverResults'),'discover: results area updated without redrawing the form')
    pg.keyboard.type(' one',delay=60); pg.wait_for_timeout(1500)
    ok(pg.evaluate("document.getElementById('discoverSearch').value")=='naruto one' and pg.evaluate("document.activeElement.id")=='discoverSearch','discover: typing after a refresh continues in the same box')
    pg.goto(U+'#home'); pg.wait_for_selector('#homeSearch'); pg.click('#homeSearch'); pg.keyboard.type('bleach',delay=80); pg.wait_for_timeout(2200)
    ok(pg.evaluate("location.hash")=='#discover','home: typing hands over to Discover')

    # 2. sheet + Back button
    pg.goto(U+'#discover'); pg.wait_for_selector('.manga-card')
    n=pg.evaluate("history.length")
    pg.click('[data-action="details"]'); pg.wait_for_selector('#detailsDialog[open]')
    ok(pg.evaluate("history.length")==n+1,'sheet adds a history entry')
    pg.go_back(); pg.wait_for_timeout(500)
    ok(not pg.evaluate("document.getElementById('detailsDialog').open"),'Back closes the sheet')
    ok(pg.evaluate("location.hash")=='#discover','Back did not change the page behind the sheet')
    pg.click('[data-action="details"]'); pg.wait_for_selector('#detailsDialog[open]'); pg.keyboard.press('Escape'); pg.wait_for_timeout(500)
    ok(not pg.evaluate("document.getElementById('detailsDialog').open") and pg.evaluate("location.hash")=='#discover','Esc closes the sheet and stays on the page')
    pg.click('[data-action="details"]'); pg.wait_for_selector('#detailsDialog[open]'); pg.click('[data-action="close-details"]'); pg.wait_for_timeout(500)
    ok(not pg.evaluate("document.getElementById('detailsDialog').open") and pg.evaluate("history.length")>=n,'close button closes through history')
    pg.click('[data-action="details"]'); pg.wait_for_selector('#detailsDialog[open]'); pg.wait_for_selector('.chapter-row')
    pg.click('[data-action="read-chapter"]'); pg.wait_for_function("location.hash.startsWith('#read/')"); pg.wait_for_timeout(400)
    pg.go_back(); pg.wait_for_timeout(700)
    ok(pg.evaluate("location.hash")=='#discover','Back from the reader returns to the page the sheet was opened from')

    # 3. adult titles hidden while the preference is off
    pg.goto(U+'#settings'); pg.wait_for_timeout(600)
    pg.evaluate(SEED,[{'id':'lib-safe','mid':'s1','title':'Safe Saved','rating':'safe'},{'id':'lib-adult','mid':'a1','title':'Adult Saved','rating':'erotica'}])
    pg.goto(U+'#library'); pg.reload(); pg.wait_for_selector('.library-card')
    txt=pg.inner_text('#appView')
    ok('Safe Saved' in txt and 'Adult Saved' not in txt,'library hides adult-rated titles while the preference is off')
    ok('1 saved title is hidden' in txt,'library says how many are hidden (neutral wording)')
    pg.goto(U+'#home'); pg.wait_for_timeout(800)
    ok('Adult Saved' not in pg.inner_text('#appView'),'home Continue reading hides them too')

    # 4. collection sheet
    pg.goto(U+'#library'); pg.wait_for_selector('.library-card')
    pg.click('[data-action="create-collection"]'); pg.wait_for_selector('#sheetDialog[open]')
    ok(pg.evaluate("document.activeElement.id")=='collectionName','collection sheet focuses the name field')
    pg.fill('#collectionName','Weekend reads'); pg.press('#collectionName','Enter'); pg.wait_for_timeout(700)
    ok(not pg.evaluate("document.getElementById('sheetDialog').open") and 'Weekend reads' in pg.inner_text('#appView'),'collection created from the sheet')
    pg.click('[data-action="select-collection"][data-id=""]'); pg.wait_for_selector('.library-card')
    pg.click('[data-action="add-collection"]', timeout=4000); pg.wait_for_selector('#sheetDialog[open]')
    ok(pg.locator('[data-action="collection-add"]').count()==1,'existing collections are listed as buttons')
    pg.fill('#collectionName','weekend reads'); pg.press('#collectionName','Enter'); pg.wait_for_timeout(400)
    ok('already exists' in pg.inner_text('#collectionError'),'duplicate name shows an inline error')
    pg.click('[data-action="collection-add"]'); pg.wait_for_timeout(700)
    ok(not pg.evaluate("document.getElementById('sheetDialog').open"),'adding to an existing collection closes the sheet')
    ok(errs==[],'no page errors: '+'; '.join(errs))

    # 5. native backup export
    ctx2=b.new_context(viewport={'width':390,'height':844},service_workers='block')
    pg2=ctx2.new_page(); errs2=[]
    pg2.on('pageerror',lambda e:errs2.append(str(e)))
    ctx2.route('**/*.workers.dev/**',worker)
    ctx2.add_init_script("""window.__shared=[];window.__written=[];
window.Capacitor={isNativePlatform:()=>true,Plugins:{Filesystem:{writeFile:async a=>{window.__written.push(a);return {uri:'file:///cache/'+a.path}}},Share:{share:async a=>{window.__shared.push(a)}}}};""")
    pg2.goto(U+'#settings/library'); pg2.wait_for_selector('[data-action="export-backup"]')
    pg2.click('[data-action="export-backup"]'); pg2.wait_for_timeout(800)
    ok(pg2.evaluate("window.__written.length")==1 and pg2.evaluate("window.__shared.length")==1,'app: backup goes through Filesystem + Share sheet')
    ok(json.loads(pg2.evaluate("window.__written[0].data"))['app']=='Tokyo Manga Lab','app: written file is a valid backup')
    ok('Choose where to save' in pg2.inner_text('#toast'),'app: toast tells the person to pick a place')
    ok(errs2==[],'no page errors (app mode): '+'; '.join(errs2))
    b.close()
print('ALL FIXES E2E CHECKS PASSED')

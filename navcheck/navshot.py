import asyncio, sys, json
from playwright.async_api import async_playwright
prefix = sys.argv[1]
SIZES = [(1920,1080,1),(1366,768,1),(1024,768,1),(768,1024,2),(600,900,2),(561,900,2),(560,900,2),(414,896,3),(390,844,3),(360,780,3),(320,568,2)]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
        out = {}
        for w,h,dpr in SIZES:
            for page in ['index.html','replay.html','help.html']:
                pg = await b.new_page(viewport={'width':w,'height':h}, device_scale_factor=dpr)
                await pg.goto('http://localhost:8765/'+page)
                await pg.wait_for_timeout(300)
                info = await pg.evaluate("""() => {
                  const nav=document.querySelector('.site-nav'); const r=nav.getBoundingClientRect();
                  const items=[...document.querySelectorAll('.nav-links a, .nav-brand')].map(a=>{const q=a.getBoundingClientRect();return {t:a.textContent.trim(),x:Math.round(q.left),r:Math.round(q.right),w:Math.round(q.width),h:Math.round(q.height),fs:getComputedStyle(a).fontSize}});
                  const overflow = document.documentElement.scrollWidth > innerWidth;
                  const links=document.querySelector('.nav-links').getBoundingClientRect();
                  const brand=document.querySelector('.nav-brand').getBoundingClientRect();
                  return {h:Math.round(r.height), overflow, overlap: brand.right > links.left, linksRight: Math.round(links.right), vw: innerWidth, items};
                }""")
                out[f'{w}:{page}'] = info
                if page == 'index.html':
                    await (await pg.query_selector('.site-nav')).screenshot(path=f'{prefix}_{w}.png')
                await pg.close()
        await b.close()
        bad = [k for k,v in out.items() if v['overflow'] or v['overlap'] or v['linksRight'] > v['vw']]
        for k in ['1920:index.html','1366:index.html','768:index.html','561:index.html','560:index.html','390:index.html','320:index.html']:
            v=out[k]; print(k, 'navH', v['h'], [(i['t'],i['w'],i['h'],i['fs']) for i in v['items']])
        print('problems:', bad)
asyncio.run(main())

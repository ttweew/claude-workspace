import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell')
        for name, vp, scheme in [('phone',{'width':390,'height':844},'light'),('laptop',{'width':1280,'height':900},'dark')]:
            pg = await b.new_page(viewport=vp, color_scheme=scheme)
            errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto('file:///tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad/recording-guide.html')
            await pg.wait_for_timeout(500)
            sw = await pg.evaluate('document.documentElement.scrollWidth')
            await pg.click('#tabLaptop')
            vis = await pg.evaluate("[document.getElementById('panelPhone').hidden, document.getElementById('panelLaptop').hidden]")
            await pg.screenshot(path=f'rg2_{name}.png', full_page=True)
            print(name, 'scrollWidth', sw, 'hidden phone/laptop', vis, errs)
        await b.close()
asyncio.run(main())

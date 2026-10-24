import { test, expect } from '../../frontend/node_modules/@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test('admin architecture filters flows and exposes component details on mobile and desktop', async ({page}, info) => {
  const root=process.cwd();
  await page.route('**/*', async route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/admin/architecture')return route.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'backend/app/cloud_web/architecture.html'),'utf8')});
    if(url.pathname==='/api/admin/architecture')return route.fulfill({contentType:'application/json',body:fs.readFileSync(path.join(root,'backend/app/architecture.json'),'utf8')});
    if(url.pathname.startsWith('/assets/')){
      const file=path.join(root,'backend/app/cloud_web',path.basename(url.pathname));
      if(fs.existsSync(file))return route.fulfill({path:file});
    }
    return route.fulfill({status:404,body:''});
  });
  await page.goto('/admin/architecture');
  await expect(page.getByRole('heading',{name:'Ett hjem. Flere lag som spiller sammen.'})).toBeVisible();
  await expect(page.locator('.architecture-node')).toHaveCount(17);
  await page.getByRole('button',{name:'Fjernaksess',exact:true}).click();
  await expect(page.locator('#connections path.active')).not.toHaveCount(0);
  await page.locator('.architecture-node').filter({hasText:'Fjernaksess-relé'}).click();
  await expect(page.locator('#component-detail')).toContainText('krypterte bytes');
  await expect(page.locator('#component-detail')).toContainText('trafikkhistorikk');
  await page.getByRole('button',{name:'Vis hele kartet'}).click();
  await expect(page.locator('.architecture-node[aria-pressed=true]')).toHaveCount(0);
  await page.getByRole('button',{name:'Energi',exact:true}).click();
  await expect(page.locator('#component-detail')).toContainText('HTTPS: priser og tariffer');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:`/tmp/smarti-architecture-${info.project.name}.png`,fullPage:true});
});

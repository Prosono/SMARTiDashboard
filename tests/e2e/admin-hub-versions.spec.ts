import { test, expect } from "../../frontend/node_modules/@playwright/test";
import fs from "node:fs";
import path from "node:path";

test("hub cards and details show installed versions", async ({page}) => {
  await page.route("**/*", async route => {
    const u = new URL(route.request().url());
    if(u.pathname === '/admin/hubs') return route.fulfill({path:'backend/app/cloud_web/onboarding.html'});
    if(u.pathname === '/api/session') return route.fulfill({json:{csrf:'test',portal_admin:true}});
    if(u.pathname === '/api/admin/hubs') return route.fulfill({json:[{
      id:'hub-one',serial:'SMART-001',model:'Hub One',hardware:'Zigbee',phase:'claimed',
      health:{},online:true,linked:true,setup_status:'completed',created:1793000000,
      versions:{os:{version:'17.0',reported:1793000000},core:{version:'2026.10.1',reported:Date.now()/1000}}
    }]});
    if(u.pathname === '/api/admin/traffic') return route.fulfill({json:{available:false}});
    const f=path.join(process.cwd(),'backend/app/cloud_web',path.basename(u.pathname));
    if(u.pathname.startsWith('/assets/') && fs.existsSync(f)) return route.fulfill({path:f});
    return route.fulfill({status:404,body:''});
  });
  await page.goto('/admin/hubs');
  const card=page.locator('.hub-record');
  await expect(card.getByText('17.0',{exact:true})).toBeVisible();
  await expect(card.getByText('Ikke rapportert',{exact:true})).toHaveCount(2);
  await expect(card.getByText(/Eldre rapport/)).toBeVisible();
  await card.getByRole('button',{name:'Se detaljer',exact:true}).click();
  await expect(page.getByRole('dialog').getByText('17.0',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Lukk',exact:true}).click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

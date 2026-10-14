import { test, expect } from '../../frontend/node_modules/@playwright/test';
import path from 'node:path';
const now=Date.now()/1000;
const system={demo:false,unavailable:[],history:[0,30,60].map((n,i)=>({time:now-60+n,cpu:10+i*5,memory:30+i,storage:24+i/10})),host:{hostname:'Hub',disk_total:64,disk_used:24.2,disk_free:39.8},core:{cpu_percent:20,memory_percent:32,memory_usage:536870912,memory_limit:2147483648},network:[{interface:'eth0',type:'ethernet',connected:true,primary:true,addresses:['192.168.1.20/24']}],backups:[]};
test.beforeEach(async({page})=>{
 await page.route('**/api/manage/settings/**',async route=>{const url=route.request().url();if(url.endsWith('/system'))return route.fulfill({json:system});if(url.endsWith('/home'))return route.fulfill({json:{location_name:'Mitt hjem',latitude:58,longitude:8,elevation:1,time_zone:'Europe/Oslo'}});if(url.endsWith('/people'))return route.fulfill({json:{people:[],trackers:[]}});return route.fallback();});
 await page.route('**/api/manage/accounts',r=>r.fulfill({json:[]}));
 await page.route('**/api/manage/accounts/pending',r=>r.fulfill({json:[]}));
 await page.goto('/');await page.getByLabel('Brukernavn',{exact:true}).fill('tester');await page.getByLabel('Passord',{exact:true}).fill('test-password-not-for-live');await page.getByRole('button',{name:'Logg inn',exact:true}).click();await page.getByRole('navigation').getByRole('button',{name:'Mer',exact:true}).click();
});
test('system charts precede settings and automation cards are absent',async({page})=>{
 await expect(page.locator('.system-graph')).toHaveCount(3);
 await page.locator('.system-graph').first().focus();await page.keyboard.press('ArrowLeft');await expect(page.locator('.system-graph output').first()).toContainText('%');
 const positions=await page.evaluate(()=>({metrics:document.querySelector('.system-metrics')!.getBoundingClientRect().top,appearance:document.querySelector('select')!.getBoundingClientRect().top}));expect(positions.metrics).toBeLessThan(positions.appearance);
 await expect(page.getByRole('heading',{name:'Automasjoner',exact:true})).toHaveCount(0);
 await page.locator('.system-metrics').screenshot({path:`test-results/system-charts-${test.info().project.name}.png`});
});
test('backup requires saved password and keeps activity after closing',async({page})=>{
 let requests=0, operation:any;
 await page.route('**/api/manage/settings/operations',r=>r.fulfill({json:operation?[operation]:[]}));
 await page.route('**/api/manage/settings/backups',route=>{requests++;const body=route.request().postDataJSON();expect(body.password).toBe('backup-test-password');operation={request_id:body.request_id,kind:'backup',created:Date.now()/1000,status:'accepted',job_id:'job1'};return route.fulfill({json:operation});});
 await page.route('**/api/manage/settings/operations/*',r=>r.fulfill({json:{status:'completed',job_id:'job1',progress:100}}));
 await page.getByRole('button',{name:'Ny sikkerhetskopi',exact:true}).click();const d=page.getByRole('dialog',{name:'Ny sikkerhetskopi'});
 await d.getByLabel('Passord for sikkerhetskopien').fill('backup-test-password');await d.getByLabel('Gjenta passord').fill('backup-test-password');
 await expect(d.getByRole('button',{name:'Start sikkerhetskopiering'})).toBeDisabled();
 await d.getByRole('checkbox').check();await d.getByRole('button',{name:'Start sikkerhetskopiering'}).click();await d.getByRole('button',{name:'Vis aktivitet'}).click();await expect(page.locator('.backup-activity')).toContainText('Fullført');expect(requests).toBe(1);
});
test('network requires review before applying static configuration',async({page})=>{
 let changes=0;
 await page.route('**/api/manage/settings/network/eth0',route=>{if(route.request().method()==='PUT'){changes++;expect(route.request().postDataJSON().ipv4).toEqual({method:'static',address:['192.168.1.50/24'],gateway:'192.168.1.1',nameservers:['1.1.1.1']});return route.fulfill({json:{status:'accepted'}});}return route.fulfill({json:{interface:'eth0',type:'ethernet',revision:'a'.repeat(64),ipv4:{method:'auto',address:[],gateway:'',nameservers:[]}}});});
 await page.getByRole('button',{name:'Endre nettverk'}).click();const d=page.getByRole('dialog',{name:'Nettverk · eth0'});await d.getByLabel('IP-oppsett').selectOption('static');await d.getByLabel('IP-adresse med nettmaske').fill('192.168.1.50/24');await d.getByLabel('Gateway',{exact:true}).fill('192.168.1.1');await d.getByLabel('DNS-servere').fill('1.1.1.1');await d.getByRole('button',{name:'Se over endringen'}).click();expect(changes).toBe(0);await expect(d).toContainText('Dette kan koble fra SMARTi');await d.getByRole('button',{name:'Bekreft og endre nettverk'}).click();await expect(d).toContainText('Endringen er sendt');expect(changes).toBe(1);
});
test('paired account onboarding includes photo role review and no premature creation',async({page})=>{
 let creates=0;
 await page.route('**/api/manage/accounts',route=>{if(route.request().method()==='POST'){creates++;const b=route.request().postDataJSON();expect(b.name).toBe('ola');expect(b.role).toBe('user');expect(b.photo.length).toBeGreaterThan(100);return route.fulfill({json:{status:'completed',name:'ola',local_id:2,ha_user_id:'ha2'}});}return route.fulfill({json:[]});});
 await page.getByRole('button',{name:'Legg til bruker',exact:true}).click();const d=page.getByRole('dialog',{name:'En ny bruker i hjemmet'});
 await d.getByLabel('Navn som vises').fill('Ola');await d.getByLabel('Brukernavn',{exact:true}).fill('ola');await d.getByLabel('Passord (minst 12 tegn)',{exact:true}).fill('test-account-password');await d.getByLabel('Gjenta passord').fill('test-account-password');await d.getByRole('button',{name:'Neste',exact:true}).click();
 await d.getByLabel('Last opp profilbilde').setInputFiles(path.resolve('public/brand/smarti-logo.png'));await expect(d.getByAltText('Forhåndsvisning av profilbilde')).toBeVisible();await d.getByRole('button',{name:'Neste',exact:true}).click();expect(creates).toBe(0);await page.screenshot({path:`test-results/account-onboarding-${test.info().project.name}.png`});await d.getByRole('button',{name:'Opprett bruker',exact:true}).click();await expect(d).toContainText('Brukeren er klar');expect(creates).toBe(1);
});
test('restore reviews contents and download remains a direct file link',async({page})=>{
 const backup={slug:'copy1',name:'Min kopi',date:'2026-10-14T09:00:00Z',size:120,type:'full',protected:true};let writes=0;
 await page.route('**/api/manage/settings/system',r=>r.fulfill({json:{...system,backups:[backup]}}));
 await page.route('**/api/manage/settings/backups/copy1/info',r=>r.fulfill({json:{...backup,homeassistant:{version:'1'},addons:[{slug:'smarti',name:'SMARTi'}],folders:['share']}}));
 await page.route('**/api/manage/settings/backups/copy1/restore',r=>{writes++;expect(r.request().postDataJSON().confirm_slug).toBe('copy1');return r.fulfill({json:{status:'accepted',job_id:'restore1'}});});
 await page.getByRole('button',{name:'Oppdater',exact:true}).click();
 await expect(page.getByRole('link',{name:'Last ned',exact:true})).toHaveAttribute('href','api/manage/settings/backups/copy1/download');
 await page.getByRole('button',{name:'Gjenopprett',exact:true}).click();const d=page.getByRole('dialog',{name:'Gjenopprett hjemmet'});
 await expect(d).toContainText('SMARTi kjerne og innstillinger');await expect(d).toContainText('share');
 await d.getByLabel('Passord for sikkerhetskopien').fill('saved-secret');expect(writes).toBe(0);await expect(d.getByRole('button',{name:'Bekreft gjenoppretting'})).toBeDisabled();await d.getByRole('checkbox').check();await d.getByRole('button',{name:'Bekreft gjenoppretting'}).click();await expect(d).toContainText('Forespørselen er registrert');expect(writes).toBe(1);
});
test('updates hide current and non-installable entries',async({page})=>{
 await page.route('**/api/manage/updates',r=>r.fulfill({json:[{entity_id:'update.old',name:'Allerede oppdatert',state:'off',can_install:true},{entity_id:'update.unsupported',name:'Kan ikke installeres',state:'on',can_install:false},{entity_id:'update.new',name:'Ny firmware',state:'on',can_install:true,installed_version:'1',latest_version:'2'}]}));
 await page.getByRole('button',{name:'Oppdateringer',exact:true}).click();await expect(page.getByRole('heading',{name:'Ny firmware',exact:true})).toBeVisible();await expect(page.getByText('Allerede oppdatert',{exact:true})).toHaveCount(0);await expect(page.getByText('Kan ikke installeres',{exact:true})).toHaveCount(0);
});
test('linked household account and person share one row',async({page})=>{
 await page.route('**/api/manage/accounts',r=>r.fulfill({json:[{id:2,name:'ola',display_name:'Ola',role:'admin',linked:true,ha_user_id:'ha2',photo:false}]}));
 await page.route('**/api/manage/settings/people',r=>r.fulfill({json:{people:[{id:'ola',name:'Ola',user_id:'ha2',editable:true,device_trackers:['device_tracker.phone']}],trackers:[{id:'device_tracker.phone',name:'Telefon'}]}}));
 await page.reload();await page.getByRole('navigation').getByRole('button',{name:'Mer',exact:true}).click();
 const household=page.locator('.account-management');await expect(household.getByText('Ola',{exact:true})).toHaveCount(1);await expect(household).toContainText('Administrator');await household.getByRole('button',{name:/Person og tilstedeværelse/}).click();const d=page.getByRole('dialog',{name:'Rediger person'});await expect(d.getByLabel('Telefon',{exact:true})).toBeChecked();
});
test('personal panels precede hub, real profile photo and usage levels',async({page})=>{
 await page.route('https://www.openstreetmap.org/**',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:'<p>OpenStreetMap · test</p>'}));
 await page.route('**/api/manage/accounts',r=>r.fulfill({json:[{id:2,name:'ola',display_name:'Ola',role:'admin',linked:true,ha_user_id:'ha2',photo:true}]}));
 await page.route('**/api/manage/accounts/2/photo*',r=>r.fulfill({path:path.resolve('public/brand/smarti-logo.png'),contentType:'image/png'}));
 let cpu=39.9,memory=40,used=71;
 await page.route('**/api/manage/settings/system',r=>r.fulfill({json:{...system,core:{...system.core,cpu_percent:cpu,memory_percent:memory},host:{...system.host,disk_total:100,disk_used:used,disk_free:100-used}}}));
 await page.reload();await page.getByRole('navigation').getByRole('button',{name:'Mer',exact:true}).click();
 await expect(page.locator('.account-person img')).toHaveAttribute('src',/accounts\/2\/photo/);
 await expect(page.locator('iframe[title="Kart · Mitt hjem"]')).toHaveAttribute('src',/marker=58%2C8/);
 await expect(page.frameLocator('iframe[title="Kart · Mitt hjem"]').getByText('OpenStreetMap · test')).toBeVisible();
 await expect(page.locator('[data-metric="cpu"]')).toHaveClass(/metric-good/);await expect(page.locator('[data-metric="memory"]')).toHaveClass(/metric-moderate/);await expect(page.locator('[data-metric="storage"]')).toHaveClass(/metric-high/);
 const positions=await page.evaluate(()=>({personal:document.querySelector('.settings-personal-grid')!.getBoundingClientRect().bottom,hub:document.querySelector('.hub-overview')!.getBoundingClientRect().top,columns:getComputedStyle(document.querySelector('.settings-personal-grid')!).gridTemplateColumns.split(' ').length}));expect(positions.personal).toBeLessThan(positions.hub);expect(positions.columns).toBe(test.info().project.name==='mobile'?1:2);
 await page.locator('.home-settings').screenshot({path:`test-results/personal-hub-${test.info().project.name}.png`});
 cpu=40;memory=70;used=0;await page.getByRole('button',{name:'Oppdater',exact:true}).click();await expect(page.locator('[data-metric="cpu"]')).toHaveClass(/metric-moderate/);await expect(page.locator('[data-metric="memory"]')).toHaveClass(/metric-moderate/);await expect(page.locator('[data-metric="storage"]')).toHaveClass(/metric-good/);
});

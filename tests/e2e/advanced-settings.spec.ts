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
test('backup starts once and shows completed job',async({page})=>{
 let requests=0;
 await page.route('**/api/manage/settings/backups',route=>{requests++;expect(route.request().postDataJSON().password).toBe('backup-test-password');return route.fulfill({json:{status:'accepted',job_id:'job1'}});});
 await page.route('**/api/manage/settings/operations/*',r=>r.fulfill({json:{status:'completed',job_id:'job1',progress:100}}));
 await page.getByRole('button',{name:'Ta sikkerhetskopi',exact:true}).click();const d=page.getByRole('dialog',{name:'Ny sikkerhetskopi'});
 await d.getByLabel('Passord for sikkerhetskopien').fill('backup-test-password');await d.getByRole('button',{name:'Start sikkerhetskopiering'}).click();await expect(d).toContainText('Sikkerhetskopien er fullført');expect(requests).toBe(1);
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

import {test,expect} from '../../frontend/node_modules/@playwright/test';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const web=path.resolve('../backend/app/cloud_web');
async function portal(page:any, verified:boolean){
 await page.addInitScript(()=>{(window as any).webkit={messageHandlers:{smartiOnboarding:{postMessage:(message:string)=>{(window as any).discoveryMessage=message;}}}};});
 await page.route('**/assets/**',async (route:any)=>{const name=new URL(route.request().url()).pathname.split('/').pop()!;try{await route.fulfill({body:await readFile(path.join(web,name)),contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'image/svg+xml'});}catch{await route.fulfill({status:404});}});
 await page.route(/\/activate(?:\?.*)?$/,async (route:any)=>route.fulfill({body:await readFile(path.join(web,'onboarding.html')),contentType:'text/html'}));
 await page.route('**/api/session',async (route:any)=>route.fulfill({json:{csrf:'test',portal_admin:false}}));
 await page.route('**/api/customer/profile',async (route:any)=>route.fulfill({json:{profile:{full_name:'Åse Hansen',email:'ase@example.test',verified},mail_configured:true}}));
}
test('verified customer sees one discovery action and network explanation',async({page})=>{
 await portal(page,true);await page.goto('/activate');
 await expect(page.getByRole('button',{name:'Finn huben på nettverket ditt'})).toBeVisible();
 await expect(page.getByRole('img',{name:/Telefon på Wi-Fi/})).toBeVisible();
 await expect(page.locator('#identify')).not.toBeVisible();
 await page.getByRole('button',{name:'Finn huben på nettverket ditt'}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).discoveryMessage)).toBe('discover');
 await expect(page.locator('#hub-username')).toHaveValue('Åse');
 await page.screenshot({path:`/tmp/smarti-discovery-${test.info().project.name}.png`,fullPage:true});
});
test('unverified customer is held at email verification before discovery',async({page})=>{
 await portal(page,false);await page.goto('/activate');
 await expect(page.getByRole('heading',{name:'Bekreft e-postadressen din.'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Finn huben på nettverket ditt'})).not.toBeVisible();
});

for(const sameDocument of [false,true])test(`QR scan continues to setup (${sameDocument?'existing page':'new page'})`,async({page})=>{
 await portal(page,true);
 const hub='11111111-1111-4111-8111-111111111111',device='22222222-2222-4222-8222-222222222222';
 const code='v2.'+'a'.repeat(64);
 const claims:any[]=[];
 await page.route('**/api/activation/'+hub+'/identify',r=>r.fulfill({json:{model:'SMARTi',serial:'test',online:true}}));
 await page.route('**/api/activation/'+hub+'/claim',async r=>{claims.push(r.request().postDataJSON());await r.fulfill({json:{id:hub}});});
 await page.route('**/api/onboarding/'+hub,r=>r.fulfill({json:{model:'SMARTi',serial:'test',online:true,health:{users:0},plan:null}}));
 await page.goto('/activate?device='+device+(sameDocument?'':'#'+hub+'.'+code));
 if(sameDocument){
  await expect(page.locator('#scan-title')).toHaveText('Huben er funnet.');
  await expect(page.locator('body')).not.toHaveClass(/is-working/);
  await page.evaluate(fragment=>{location.hash=fragment;},hub+'.'+code);
 }
 await expect(page.locator('#setup')).toBeVisible();
 expect(claims).toEqual([{home:hub,code,pin:'',device}]);
 await expect(page).toHaveURL(new RegExp('/activate\\?home='+hub+'$'));
});

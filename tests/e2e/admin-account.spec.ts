import {test,expect} from '../../frontend/node_modules/@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
test('administrator can change password with validation and feedback',async({page},info)=>{
 let attempts=0;
 await page.route('**/*',r=>{
  const u=new URL(r.request().url());
  if(u.pathname==='/admin/account')return r.fulfill({path:path.join(process.cwd(),'backend/app/cloud_web/admin-account.html'),contentType:'text/html'});
  if(u.pathname==='/api/session')return r.fulfill({json:{csrf:'test-csrf',portal_admin:true}});
  if(u.pathname==='/api/admin/account')return r.fulfill({json:{username:'test-admin'}});
  if(u.pathname==='/api/admin/account/password'){
   attempts++;expect(r.request().headers()['x-csrf-token']).toBe('test-csrf');
   if(attempts===1)return r.fulfill({status:400,json:{detail:'current_password_incorrect'}});
   return r.fulfill({json:{changed:true}});
  }
  const f=path.join(process.cwd(),'backend/app/cloud_web',path.basename(u.pathname));
  if(u.pathname.startsWith('/assets/')&&fs.existsSync(f))return r.fulfill({path:f});
  return r.fulfill({status:404,body:''});
 });
 await page.goto('/admin/account');
 await expect(page.getByRole('link',{name:'Konto',exact:true})).toBeVisible();
 await page.getByLabel('Dagens passord',{exact:true}).fill('old-test-password');
 await page.getByLabel('Nytt passord',{exact:true}).fill('new-test-password');
 await page.getByLabel('Gjenta nytt passord',{exact:true}).fill('does-not-match');
 await page.getByRole('button',{name:'Lagre nytt passord'}).click();expect(attempts).toBe(0);
 await page.getByLabel('Gjenta nytt passord',{exact:true}).fill('new-test-password');
 await page.getByRole('button',{name:'Lagre nytt passord'}).click();
 await expect(page.getByRole('status')).toContainText('Dagens passord er ikke riktig');
 await page.getByRole('button',{name:'Lagre nytt passord'}).click();
 await expect(page.getByRole('status')).toContainText('Passordet er endret');
 await expect(page.getByLabel('Nytt passord',{exact:true})).toHaveValue('');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 const nav=await page.locator('.masthead').boundingBox();
 const main=await page.locator('main').boundingBox();
 if(info.project.name==='desktop'){
  expect(nav!.width).toBe(244);expect(main!.x).toBeGreaterThanOrEqual(244);
  const links=await page.locator('.masthead nav a:visible').all();
  for(const link of links)expect((await link.boundingBox())!.x).toBeLessThan(244);
 }else{expect(main!.y).toBeGreaterThanOrEqual(nav!.y+nav!.height);}
 await page.screenshot({path:`/tmp/smarti-admin-account-${info.project.name}.png`,fullPage:true});
});

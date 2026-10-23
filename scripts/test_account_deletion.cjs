// Isolated confirmation UI: never sends requests to production.
const {chromium,expect}=require('../frontend/node_modules/@playwright/test');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch();const page=await browser.newPage();let blocked=false,calls=0;
 await page.route('https://home.smarti.dev/**',async route=>{
  const request=route.request();
  if(request.url().includes('/api/')){
   if(request.method()==='DELETE'){calls++;expect(request.postDataJSON()).toEqual({confirmation:'DELETE',understood:true});return route.fulfill({json:{deleted:true,self:false}});}
   return route.fulfill({json:{can_delete:!blocked,reason:blocked?'account_has_hubs':null}});
  }
  await route.fulfill({contentType:'text/html',body:'<html><body><button id="open">Slett konto</button></body></html>'});
 });
 await page.goto('https://home.smarti.dev/');
 await page.addStyleTag({content:fs.readFileSync('backend/app/cloud_web/theme.css','utf8')});
 await page.addStyleTag({content:fs.readFileSync('backend/app/cloud_web/account-deletion.css','utf8')});
 await page.addScriptTag({content:fs.readFileSync('backend/app/cloud_web/account-deletion.js','utf8')});
 for(const width of [390,1440]){
  await page.setViewportSize({width,height:900});
  await page.evaluate(()=>window.smartiDeleteAccount({path:'customer/account',csrf:'test',name:'test@example.no',trigger:document.getElementById('open')}));
  const dialog=page.getByRole('dialog'),submit=dialog.getByRole('button',{name:'Slett konto permanent'});
  await expect(submit).toBeDisabled();
  await dialog.getByRole('checkbox').check();await dialog.getByRole('textbox').fill('delete');await expect(submit).toBeDisabled();
  await dialog.getByRole('textbox').fill('DELETE');await expect(submit).toBeEnabled();
  const box=await dialog.boundingBox();if(box.x<0||box.x+box.width>width)throw Error('Dialog overflow');
  await page.screenshot({path:'/tmp/smarti-account-deletion-'+width+'.png'});
  await submit.click();await expect(dialog).toHaveCount(0);await expect(page.locator('#open')).toBeFocused();
 }
 blocked=true;
 await page.evaluate(()=>window.smartiDeleteAccount({path:'admin/accounts/test',csrf:'test',name:'Test'}));
 await expect(page.getByRole('status')).toContainText('fortsatt en hub');
 await expect(page.getByRole('textbox')).toBeHidden();await expect(page.getByRole('button',{name:'Slett konto permanent'})).toBeDisabled();
 expect(calls).toBe(2);await browser.close();console.log('Account deletion dialog: desktop/mobile, explicit confirmation and blocked account passed.');
})().catch(e=>{console.error(e);process.exit(1);});

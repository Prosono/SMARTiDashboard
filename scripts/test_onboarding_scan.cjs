const {chromium,expect}=require(process.cwd()+'/frontend/node_modules/@playwright/test');
const fs=require('fs');
(async()=>{
 const browser=await chromium.launch();
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 const device='00000000-0000-4000-8000-000000000007', home='00000000-0000-4000-8000-000000000008';
 let requests=[];
 let downloadRequests=[];
 let storeUrl=null;
 let storeVisits=[];
 const mockPortal=async r=>{
 const u=new URL(r.request().url());
 if(u.pathname==='/api/activation/app-download'){
  downloadRequests.push(u.searchParams.get('platform'));
  return r.fulfill({json:{url:storeUrl}});
 }
 if(u.pathname.startsWith('/api/activation/')){
 requests.push(r.request().postDataJSON());
 return r.fulfill({json:{model:'Testhub',serial:'TEST',online:true}});
 }
 if(u.pathname==='/api/session')return r.fulfill({status:401,json:{}});
 const file=u.pathname==='/activate'?'onboarding.html':u.pathname.split('/').pop();
 if(!['onboarding.html','profile.js','onboarding.js','auth-language.js','onboarding.css','admin.css'].includes(file))return r.fulfill({status:404,body:''});
 return r.fulfill({body:fs.readFileSync('backend/app/cloud_web/'+file),contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html',headers:{'Referrer-Policy':'no-referrer'}});
 };
 await page.route('https://home.smarti.dev/**',mockPortal);
 await page.goto('https://home.smarti.dev/activate?device='+device+'#'+home+'.'+'a'.repeat(64));
 await expect(page.locator('#scan-title')).toHaveText('QR-koden er lest.');
 await expect(page.locator('input[name=label]')).toBeHidden();
 await page.locator('input[name=pin]').fill('1234567');
 if(requests.length)throw Error('Premature submit');
 await page.locator('input[name=pin]').fill('12345678');
 await expect(page.locator('#auth')).toBeVisible();
 if(requests.length!==1||requests[0].device!==device||requests[0].home!==home)throw Error('Lost selection/duplicate request');
 if(errors.length)throw Error(errors.join('\n'));
 requests=[];
 await page.goto('about:blank');
 await page.goto('https://home.smarti.dev/activate?device='+device+'#'+home+'.v2.'+'b'.repeat(64));
 await expect(page.locator('#auth')).toBeVisible();
 await expect(page.locator('#signup')).toBeVisible();
 if(requests.length!==1||requests[0].pin!==''||requests[0].device!==device)throw Error('QR automatic activation failed: '+JSON.stringify(requests));
 await page.screenshot({path:'/tmp/smarti-onboarding-profile.png',fullPage:true});
 if(errors.length)throw Error(errors.join('\n'));
 console.log('PASS: legacy PIN fallback and new QR automatic activation; full profile shown');

 const label=home+'.v2.'+'b'.repeat(64);
 for(const [platform,agent,url] of [
  ['ios','Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)','https://apps.apple.com/app/id6824492352'],
  ['android','Mozilla/5.0 (Linux; Android 15; Pixel 8)','https://play.google.com/store/apps/details?id=dev.example.hub'],
 ]){
  const context=await browser.newContext({userAgent:agent,viewport:{width:390,height:844}});
  const mobile=await context.newPage();
  // Reuse the actual onboarding page, with no dependency on an external store.
  await mobile.route('https://home.smarti.dev/**',mockPortal);
  await mobile.route(new URL(url).origin+'/**',async route=>{
   storeVisits.push({url:route.request().url(),referrer:route.request().headers().referer});
   return route.fulfill({body:'Store'});
  });
  storeUrl=url;
  downloadRequests=[];
  storeVisits=[];
  requests=[];
  await mobile.goto('https://home.smarti.dev/activate#'+label);
  await mobile.waitForURL(url);
  if(downloadRequests.join()!==platform||requests.length||storeVisits.length!==1||storeVisits[0].url!==url||storeVisits[0].referrer){
   throw Error('Invalid or leaking store handoff for '+platform);
  }
  await mobile.goBack();
  await expect(mobile).toHaveURL('https://home.smarti.dev/activate');

  if(platform==='ios'){
   await mobile.addInitScript(()=>{window.webkit={messageHandlers:{smartiOnboarding:{postMessage(){}}}};});
  }else{
   storeUrl=null;
  }
  downloadRequests=[];
  await mobile.goto('about:blank');
  await mobile.goto('https://home.smarti.dev/activate#'+label);
  await expect(mobile.locator('#auth')).toBeVisible();
  if(requests.length!==1||requests[0].code!=='v2.'+'b'.repeat(64)||downloadRequests.join()!==(platform==='ios'?'':'android')){
   throw Error('Rescan or unpublished-store fallback failed for '+platform);
  }
  if(platform==='ios'){
   await mobile.locator('#portal-language').selectOption('en');
   await mobile.goto('https://home.smarti.dev/activate?manual=1&device='+device);
   await expect(mobile.locator('#manual-discovery')).toHaveAttribute('open','');
   await expect(mobile.getByLabel('Link from the hub label')).toBeVisible();
   await expect(mobile.locator('#scan-title')).toHaveText('We found your hub.');
  }
  await context.close();
 }
 console.log('PASS: both store destinations, safe history, native rescan and unpublished Android fallback');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});

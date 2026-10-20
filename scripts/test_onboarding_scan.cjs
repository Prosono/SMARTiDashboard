const {chromium,expect}=require(process.cwd()+'/frontend/node_modules/@playwright/test');
const fs=require('fs');
(async()=>{
 const browser=await chromium.launch();
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 const device='00000000-0000-4000-8000-000000000007', home='00000000-0000-4000-8000-000000000008';
 let requests=[];
 await page.route('https://home.smarti.dev/**',async r=>{
 const u=new URL(r.request().url());
 if(u.pathname.startsWith('/api/activation/')){
 requests.push(r.request().postDataJSON());
 return r.fulfill({json:{model:'Testhub',serial:'TEST',online:true}});
 }
 if(u.pathname==='/api/session')return r.fulfill({status:401,json:{}});
 const file=u.pathname==='/activate'?'onboarding.html':u.pathname.split('/').pop();
 if(!['onboarding.html','profile.js','onboarding.js','onboarding.css','admin.css'].includes(file))return r.fulfill({status:404,body:''});
 return r.fulfill({body:fs.readFileSync('backend/app/cloud_web/'+file),contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html'});
 });
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
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});

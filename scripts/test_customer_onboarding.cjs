const {chromium,expect}=require(process.cwd()+'/frontend/node_modules/@playwright/test');
const fs=require('fs');
(async()=>{
 const browser=await chromium.launch(),page=await browser.newPage({viewport:{width:390,height:844}});
 const home='00000000-0000-4000-8000-000000000008',device='00000000-0000-4000-8000-000000000007';
 let loggedIn=false,configured=false,invited=false,opened=false,profile=null;const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://**.smarti.dev/**',async route=>{
  const r=route.request(),u=new URL(r.url()),path=u.pathname;
  if(u.host!== 'home.smarti.dev')return route.fulfill({body:'Home opened'});
  if(path==='/api/session')return route.fulfill(loggedIn?{json:{csrf:'test',portal_admin:false}}:{status:401,json:{}});
  if(path.endsWith('/identify'))return route.fulfill({json:{model:'SMARTi Hub',serial:'TEST',online:true}});
  if(path==='/api/register'){const d=r.postDataJSON();if(d.username!=='resident@example.com'||!d.profile.full_name)throw Error('Incomplete profile');profile=d.profile;return route.fulfill({json:{created:true}});}
  if(path==='/api/login'){loggedIn=true;return route.fulfill({json:{csrf:'test'}});}
  if(path==='/api/customer/profile')return route.fulfill({json:{profile}});
  if(path.endsWith('/claim'))return route.fulfill({json:{id:home}});
  if(path==='/api/onboarding/'+home){if(r.method()==='POST'){const d=r.postDataJSON();if(d.mode!=='new'||d.rooms.length!==4||d.latitude!==59.9)throw Error('Invalid setup plan');configured=true;return route.fulfill({json:{id:'job'}});}return route.fulfill({json:{model:'SMARTi Hub',serial:'TEST',online:true,health:{users:0},remote_connected:true,plan:configured?{status:'completed',step:'completed',draft:{mode:'new'}}:null}});}
  if(path.endsWith('/invitations')){invited=true;return route.fulfill({json:{queued:true}});}
  if(path.endsWith('/open')){opened=true;return route.fulfill({json:{url:'https://'+home+'.home.smarti.dev/_account#'+'x'.repeat(48)}});}
  const file=path==='/activate'?'onboarding.html':path.split('/').pop();
  if(!['onboarding.html','onboarding.js','onboarding.css','profile.js','admin.css'].includes(file))return route.fulfill({status:404,body:''});
  return route.fulfill({body:fs.readFileSync('backend/app/cloud_web/'+file),contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html'});
 });
 await page.goto('https://home.smarti.dev/activate?device='+device+'#'+home+'.v2.'+'a'.repeat(64));
 await expect(page.locator('#signup')).toBeVisible();
 for(const [key,value]of Object.entries({full_name:'Test Resident',email:'resident@example.com',phone:'+4712345678',address:'Testveien 1',postal_code:'1234',city:'Oslo',country:'Norge',password:'test-password-long'}))await page.locator('#signup [name='+key+']').fill(value);
 await page.locator('#signup button.primary').click();await expect(page.locator('#setup')).toBeVisible();
 await page.locator('#location-step summary').click();await page.locator('[name=latitude]').fill('59.9');await page.locator('[name=longitude]').fill('10.7');
 await page.locator('#next-step').click();await expect(page.locator('#rooms-step')).toBeVisible();
 await page.locator('#next-step').click();await expect(page.locator('#experience-step')).toBeVisible();
 await page.locator('#next-step').click();await page.locator('#configure [name=password]').fill('test-password-long');await page.locator('#finish').click();
 await expect(page.locator('#open-home')).toBeVisible();await expect(page.locator('#steps .done')).toHaveCount(4);
 await page.locator('#invite-form [name=email]').fill('guest@example.com');await page.locator('#invite-form button').click();await expect(page.locator('#invite-status')).toContainText('utsendingskøen');
 await page.screenshot({path:'/tmp/smarti-onboarding-complete.png',fullPage:true});await page.locator('#open-home').click();await expect(page).toHaveURL(new RegExp(home));
 if(!invited||!opened||errors.length)throw Error(errors.join('\n')||'Incomplete flow');
 console.log('PASS: mobile QR → full account → home/rooms → completion → invitation → passwordless home handoff');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});

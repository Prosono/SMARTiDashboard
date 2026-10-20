// Isolated portal regression and responsive checks; no customer data or live writes.
const {chromium,expect}=require('../frontend/node_modules/@playwright/test');
const fs=require('node:fs');
const root='backend/app/cloud_web/';
(async()=>{
 const browser=await chromium.launch();const page=await browser.newPage();
 let brandGate=null,sessionGate=null,sessionFailure=false;let signedIn=false,admin=false,savedProfile=null;let profile={verified:true,full_name:'Test Kunde',email:'test@example.no',phone:'12345678',address:'Testveien 1',postal_code:'1234',city:'Oslo',country:'Norge',photo:''};const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const home={name:'Hjemme i Kristiansand',installation_id:'00000000-0000-4000-8000-000000000001',remote_enabled:true,connected:true,factory_managed:true};
 await page.route('https://home.smarti.dev/**',async route=>{
  const u=new URL(route.request().url()),path=u.pathname;let data;
  if(path==='/api/session'){if(sessionGate)await sessionGate;if(sessionFailure)return route.fulfill({status:503,json:{}});if(!signedIn)return route.fulfill({status:401,json:{}});data={csrf:'test',portal_admin:admin};}
  else if(path==='/api/login'){signedIn=true;data={csrf:'test'};}
  else if(path==='/api/logout'){signedIn=false;data={};}
  else if(path==='/api/homes')data=[home,{...home,name:'Hytta ved sjøen',installation_id:'00000000-0000-4000-8000-000000000002',connected:false}];
  else if(path==='/api/admin/overview')data={checked_at:1792480000,relay_available:true,summary:{customers:24,accounts:29,homes:31,online:27,offline:2,unclaimed:2},customers:[{id:'test',username:'kunde@example.no',homes:[{name:home.name,status:'online'}]},{id:'test2',username:'annen@example.no',homes:[{name:'Hytta',status:'offline'}]}],total:2,unclaimed:[]};
  else if(path==='/api/admin/accounts/test')data={username:'kunde@example.no',id:'test',homes:[{name:home.name,status:'online',id:'demo'}],notes:[]};
  else if(path==='/api/admin/audit')data=[];
  else if(path==='/api/support/pricing')data={hourly:499,simple:299,complex:499,advanced:799,version:1,terms:'Arbeid avtales før oppstart.'};
  else if(path==='/api/customer/profile'){if(route.request().method()==='PUT'){savedProfile=route.request().postDataJSON();profile={...profile,...savedProfile};data={ok:true};}else data={profile,mail_configured:true};}
  else if(path.endsWith('/members'))data=[];
  else if(path.endsWith('/support/cases'))data=[{id:'case1',subject:'Hjelp med en automasjon',category:'automation',status:'in_progress',updated:1792480000,customer:'Kunde',assignee:'SMARTi'}];
  else if(path.startsWith('/api/'))return route.fulfill({status:401,json:{}});
  if(data!==undefined)return route.fulfill({json:data});
  const names={'/':'index.html','/admin':'admin.html','/support':'support.html','/support/prices':'support.html','/admin/support':'support.html','/admin/hubs':'onboarding.html','/account':'account.html','/welcome':'onboarding.html'};
  const file=names[path]||path.replace('/assets/','');
  if(!/^[a-zA-Z0-9_.-]+$/.test(file)||!fs.existsSync(root+file))return route.fulfill({status:404,body:''});
  if(file==='brand.js'&&brandGate)await brandGate;
  const ext=file.split('.').pop();return route.fulfill({body:fs.readFileSync(root+file),contentType:{js:'application/javascript',css:'text/css',html:'text/html',png:'image/png',webp:'image/webp',svg:'image/svg+xml',woff2:'font/woff2'}[ext]});
 });
 // Delay end-of-body decoration: the first rendered shell must already be correct.
 let releaseBrand;brandGate=new Promise(resolve=>releaseBrand=resolve);signedIn=true;
 await page.goto('https://home.smarti.dev/',{waitUntil:'commit'});
 await expect(page.locator('.masthead')).toBeVisible();
 await expect(page.locator('html')).toHaveAttribute('data-portal-theme','dark');
 await expect(page.locator('.masthead')).toHaveCSS('position','fixed');
 await expect(page.locator('body')).toHaveCSS('background-color','rgb(16, 16, 16)');
 await expect(page.locator('#auth')).toBeHidden();
 releaseBrand();brandGate=null;await page.waitForLoadState('load');
 // A slow session check must never expose the login artwork for signed-in users.
 signedIn=true;let releaseSession;sessionGate=new Promise(resolve=>releaseSession=resolve);
 await page.goto('https://home.smarti.dev/');
 await expect(page.locator('#session-loading')).toBeVisible();
 await expect(page.locator('#auth')).toBeHidden();
 await expect(page.locator('#account')).toBeHidden();
 releaseSession();sessionGate=null;
 await expect(page.locator('#account')).toBeVisible();await expect(page.locator('#auth')).toBeHidden();
 sessionFailure=true;await page.reload();await expect(page.locator('#session-retry')).toBeVisible();await expect(page.locator('#auth')).toBeHidden();
 sessionFailure=false;await page.locator('#session-retry').click();await expect(page.locator('#account')).toBeVisible();
 for(const width of [1440,768,390]){
  await page.setViewportSize({width,height:1000});signedIn=false;admin=false;
  await page.goto('https://home.smarti.dev/');await expect(page.locator('#auth')).toBeVisible();
  await page.getByRole('button',{name:'Lyst',exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-portal-theme','light');
  await page.screenshot({path:`/tmp/smarti-portal-login-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:'Vis passord',exact:true}).click();await expect(page.locator('[name=password]')).toHaveAttribute('type','text');await page.getByRole('button',{name:'Skjul passord',exact:true}).click();
  await page.locator('[name=username]').fill('resident@example.no');await page.locator('[name=password]').fill('test-password');await page.locator('#login .primary').click();
  await expect(page.locator('.home-card')).toHaveCount(2);await expect(page.locator('#admin-link')).toBeHidden();
  await page.locator('.home-options').first().locator('summary').click();await expect(page.getByRole('button',{name:'Slå av fjerntilgang'}).first()).toBeVisible();
  await page.locator('.home-options').first().locator('summary').click();
  await page.screenshot({path:`/tmp/smarti-portal-homes-${width}.png`,fullPage:true});
  admin=true;await page.goto('https://home.smarti.dev/admin');await expect(page.locator('#rows tr')).toHaveCount(2);
  await page.screenshot({path:`/tmp/smarti-portal-admin-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:'Se kunde →'}).first().click();await expect(page.locator('#detail')).toBeVisible();
  await page.locator('#close-detail').click();await page.locator('#audit-tab').click();await expect(page.locator('#audit')).toBeVisible();
  for(const path of ['/','/admin','/support','/support/prices','/admin/support','/account','/welcome']){
   await page.goto('https://home.smarti.dev'+path);
   if(path==='/support'){await expect(page.locator('.case-row')).toHaveCount(1);await page.locator('#new-case').click();await expect(page.locator('#create')).toBeVisible();}
   if(path==='/support/prices')await expect(page.locator('.price-row')).toHaveCount(4);
   if(path==='/account'){
    await expect(page.locator('#account')).toBeVisible();
    await expect(page.locator('#signup [name=full_name]')).toHaveValue(profile.full_name);
    await page.locator('#signup [name=full_name]').fill('Oppdatert Kunde');
    await page.getByRole('button',{name:'Lagre profil',exact:true}).click();
    await expect(page.locator('#signup [name=full_name]')).toHaveValue('Oppdatert Kunde');
    if(savedProfile?.email!==profile.email)throw Error('Profile fields not preserved');
    await page.screenshot({path:`/tmp/smarti-account-redesign-${width}.png`,fullPage:true});
   }
   if(path==='/admin/support')await page.screenshot({path:`/tmp/smarti-portal-support-${width}.png`,fullPage:true});
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);if(overflow)throw Error('Overflow '+path+' '+width);
  }
 }
 signedIn=true;admin=false;await page.setViewportSize({width:1440,height:1050});await page.emulateMedia({colorScheme:'light'});await page.getByRole('button',{name:'Mørkt',exact:true}).click();
 for(const [path,name] of [['/','homes'],['/account','account'],['/support','support']]){await page.goto('https://home.smarti.dev'+path);await expect(page.locator(path==='/support'?'#workspace':'#account')).toBeVisible();await expect(page.locator('html')).toHaveAttribute('data-portal-theme','dark');if(await page.locator('body').evaluate(n=>getComputedStyle(n).backgroundColor)!=='rgb(16, 16, 16)')throw Error('Dark background is not neutral black');await page.screenshot({path:`/tmp/smarti-${name}-dark-redesign.png`,fullPage:true});}
 signedIn=false;await page.goto('https://home.smarti.dev/account?create=1');
 await expect(page.locator('#signup')).toBeVisible();await expect(page.locator('#login')).toBeHidden();
 await expect(page.locator('#signup [name=email]')).toBeVisible();
 if(errors.length)throw Error(errors.join('\n'));await browser.close();console.log('PASS: login, home actions, admin detail/log and seven responsive portal routes at 390/768/1440px');
})().catch(e=>{console.error(e);process.exit(1)});

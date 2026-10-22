// Isolated portal regression and responsive checks; no customer data or live writes.
const {chromium,expect}=require('../frontend/node_modules/@playwright/test');
const fs=require('node:fs');
const root='backend/app/cloud_web/';
(async()=>{
 const browser=await chromium.launch();const page=await browser.newPage();
 let emptyCases=false,noHomes=false,homePhotoData=null;let brandGate=null,sessionGate=null,sessionFailure=false;let signedIn=false,admin=false,savedProfile=null;let profile={verified:true,full_name:'Test Kunde',email:'test@example.no',phone:'12345678',address:'Testveien 1',postal_code:'1234',city:'Oslo',country:'Norge',photo:''};const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const home={name:'Hjemme i Kristiansand',installation_id:'00000000-0000-4000-8000-000000000001',remote_enabled:true,connected:true,factory_managed:true};
 await page.route('https://home.smarti.dev/**',async route=>{
  const u=new URL(route.request().url()),path=u.pathname;let data;
  if(path==='/api/session'){if(sessionGate)await sessionGate;if(sessionFailure)return route.fulfill({status:503,json:{}});if(!signedIn)return route.fulfill({status:401,json:{}});data={csrf:'test',portal_admin:admin};}
  else if(path==='/api/login'){signedIn=true;data={csrf:'test'};}
  else if(path==='/api/logout'){signedIn=false;data={};}
  else if(path.endsWith('/photo')&&route.request().method()==='PUT'){const photo=route.request().postDataJSON().photo;homePhotoData=photo;home.photo_url=photo?'/api/customer/homes/'+home.installation_id+'/photo?v=test':null;data={saved:true};}else if(path.endsWith('/photo'))return route.fulfill({contentType:'image/jpeg',body:Buffer.from(homePhotoData.split(',')[1],'base64')});else if(path==='/api/homes')data=noHomes?[]:[home,{...home,name:'Hytta ved sjøen',installation_id:'00000000-0000-4000-8000-000000000002',connected:false}];
  else if(path==='/api/admin/overview')data={checked_at:1792480000,relay_available:true,summary:{customers:24,accounts:29,homes:31,online:27,offline:2,unclaimed:2},customers:[{id:'test',username:'kunde@example.no',homes:[{name:home.name,status:'online'}]},{id:'test2',username:'annen@example.no',homes:[{name:'Hytta',status:'offline'}]}],total:2,unclaimed:[]};
  else if(path==='/api/admin/accounts/test')data={username:'kunde@example.no',id:'test',homes:[{name:home.name,status:'online',id:'demo'}],notes:[]};
  else if(path==='/api/admin/traffic')data={available:false,daily:[],hubs:{}};
  else if(path==='/api/admin/audit'||path==='/api/admin/hubs')data=[];
  else if(path==='/api/support/pricing')data={hourly:499,simple:299,complex:499,advanced:799,version:1,terms:'Arbeid avtales før oppstart.'};
  else if(path==='/api/customer/marketing')data={saved:true};
  else if(path==='/api/customer/profile'){if(route.request().method()==='PUT'){savedProfile=route.request().postDataJSON();profile={...profile,...savedProfile};data={ok:true};}else data={profile,mail_configured:true};}
  else if(path.endsWith('/members'))data=[{id:'owner',username:'owner',full_name:'Test Kunde',email:'test@example.no',role:'owner'}];
  else if(path.endsWith('/invitations'))data={queued:true};
  else if(path.endsWith('/support/cases'))data=emptyCases?[]:[{id:'case1',subject:'Hjelp med en automasjon',category:'automation',status:'in_progress',updated:1792480000,customer:'Kunde',assignee:'SMARTi'}];
  else if(path.startsWith('/api/'))return route.fulfill({status:401,json:{}});
  if(data!==undefined)return route.fulfill({json:data});
  const names={'/':'index.html','/admin':'admin.html','/support':'support.html','/support/prices':'support.html','/admin/support':'support.html','/admin/support/prices':'support.html','/admin/hubs':'onboarding.html','/account':'account.html','/welcome':'onboarding.html'};
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
  if(await page.locator('html').getAttribute('data-portal-theme')!=='light')await page.getByRole('button',{name:'Bytt til lyst tema',exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-portal-theme','light');
  await expect(page.locator('.masthead nav a:visible')).toHaveCount(1);
  await expect(page.locator('.masthead nav a:visible')).toHaveText('Om oss');
  await expect(page.locator('.portal-theme button')).toHaveCount(1);
  await page.screenshot({path:`/tmp/smarti-portal-login-${width}.png`,fullPage:true});
  await page.getByRole('tab',{name:'Nytt hjem'}).click();await expect(page.locator('#login-panel')).toBeHidden();await expect(page.locator('#setup-panel')).toBeVisible();await page.getByRole('tab',{name:'Logg inn',exact:true}).click();
  await page.getByRole('button',{name:'Vis passord',exact:true}).click();await expect(page.locator('[name=password]')).toHaveAttribute('type','text');await page.getByRole('button',{name:'Skjul passord',exact:true}).click();
  await page.locator('[name=username]').fill('resident@example.no');await page.locator('[name=password]').fill('test-password');await page.locator('#login .primary').click();
  await expect(page.locator('.masthead nav a[href="/account"]')).toBeVisible();
  await expect(page.locator('.masthead nav .public-about')).toBeHidden();
  await expect(page.locator('.home-card')).toHaveCount(2);await expect(page.locator('#admin-link')).toBeHidden();
  await page.locator('.home-options').first().locator('summary').click();await expect(page.getByRole('button',{name:'Slå av fjerntilgang'}).first()).toBeVisible();
  await page.locator('.home-options').first().locator('summary').click();
  await expect(page.locator('#claim,.connection-options')).toHaveCount(0);
  await expect(page.locator('.home-visual img')).toHaveCount(2);
  await expect(page.locator('.home-badge').first()).toHaveText('Tilkoblet');
  await expect(page.locator('.home-badge').last()).toHaveText('Venter på tilkobling');
  await expect(page.locator('.home-heading>a')).toHaveCount(0);await expect(page.locator('.home-add-card')).toBeVisible();await expect(page.locator('.home-quick-actions').first()).toBeVisible();
  await page.locator('.home-more').first().click();
  await expect(page.locator('.home-photo-dialog')).toBeVisible();await page.screenshot({path:`/tmp/smarti-home-photo-popup-${width}.png`});
  const jpeg=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=400;c.height=250;const x=c.getContext('2d');x.fillStyle='#ff7900';x.fillRect(0,0,400,250);return c.toDataURL('image/jpeg').split(',')[1];});
  await page.locator('.home-photo-dialog input[type=file]').first().setInputFiles({name:'house.jpg',mimeType:'image/jpeg',buffer:Buffer.from(jpeg,'base64')});
  await expect(page.locator('.home-visual img').first()).toHaveAttribute('src',/photo\?v=test/);
  await page.locator('.home-more').first().click();await page.getByRole('button',{name:'Bruk standardbilde',exact:true}).first().click();
  await expect(page.locator('.home-visual img').first()).toHaveAttribute('src','/assets/portal-home.webp');await page.locator('.home-more').first().click();

  await page.keyboard.press('Escape');await expect(page.locator('.home-photo-dialog')).toHaveCount(0);await expect(page.locator('.home-more').first()).toBeFocused();
  await page.screenshot({path:`/tmp/smarti-portal-homes-${width}.png`,fullPage:true});
  admin=true;await page.goto('https://home.smarti.dev/admin');await expect(page.locator('#rows tr')).toHaveCount(2);
  await page.screenshot({path:`/tmp/smarti-portal-admin-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:'Se kunde'}).first().click();await expect(page.locator('#detail')).toBeVisible();
  await page.locator('#close-detail').click();await page.locator('#audit-tab').click();await expect(page.locator('#audit')).toBeVisible();
  for(const path of ['/','/admin','/support','/support/prices','/admin/support','/account','/welcome']){
   admin=path.startsWith('/admin');await page.goto('https://home.smarti.dev'+path);
   if(path==='/')await expect(page.locator('#account')).toBeVisible();
   if(path==='/support'){await expect(page.locator('.case-row')).toHaveCount(1);await page.locator('#new-case').click();await expect(page.locator('#create')).toBeVisible();}
   if(path==='/support/prices')await expect(page.locator('.price-row')).toHaveCount(4);
   if(path==='/account'){
    await expect(page.locator('#account')).toBeVisible();
    await expect(page.locator('#signup [name=full_name]')).toHaveValue(profile.full_name);
    await expect(page.locator('#profile-summary')).toHaveClass('is-verified');await expect(page.locator('[name=country]')).toHaveAttribute('list','country-options');
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
 signedIn=true;admin=false;await page.setViewportSize({width:1440,height:1050});await page.emulateMedia({colorScheme:'light'});await page.getByRole('button',{name:'Bytt til mørkt tema',exact:true}).click();
 for(const [path,name] of [['/','homes'],['/account','account'],['/support','support']]){await page.goto('https://home.smarti.dev'+path);await expect(page.locator(path==='/support'?'#workspace':'#account')).toBeVisible();await expect(page.locator('html')).toHaveAttribute('data-portal-theme','dark');if(await page.locator('body').evaluate(n=>getComputedStyle(n).backgroundColor)!=='rgb(16, 16, 16)')throw Error('Dark background is not neutral black');await page.screenshot({path:`/tmp/smarti-${name}-dark-redesign.png`,fullPage:true});}
 signedIn=true;admin=true;
 await page.goto('https://home.smarti.dev/');await page.waitForURL('https://home.smarti.dev/admin');
 for(const path of ['/admin','/admin/hubs','/admin/support','/admin/support/prices']){
  await page.goto('https://home.smarti.dev'+path);
  await expect(page.locator('.masthead nav a[href="/"]')).toHaveCount(0);
  await expect(page.locator('.masthead nav a[href="/account"]')).toHaveCount(0);
  await expect(page.locator('.masthead>a')).toHaveAttribute('href','/admin');
  await expect(page.locator('.masthead nav a[href="/admin/support/prices"]')).toBeVisible();
  await expect(page.locator('#logout')).toBeVisible();
  await page.locator('#logout').click();await page.waitForURL('https://home.smarti.dev/');await expect(page.locator('#auth')).toBeVisible();signedIn=true;
 }
 signedIn=true;admin=false;emptyCases=true;
 for(const width of [320,390,430]){
  await page.setViewportSize({width,height:844});
  for(const path of ['/','/account','/support']){
   await page.goto('https://home.smarti.dev'+path);await expect(page.locator(path==='/support'?'#workspace':'#account')).toBeVisible();
   if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Mobile overflow '+path+' '+width);
   if((await page.locator('.masthead').boundingBox()).height>140)throw Error('Mobile header too tall');
   if(path==='/'){
    const button=await page.locator('.home-card>.primary').first().boundingBox();if(button.y+button.height>700)throw Error('Open home pushed below fold');
   }
   if(path==='/account'){
    await page.getByRole('button',{name:'Lagre profil',exact:true}).click();
    await expect(page.getByRole('button',{name:'Lagre profil',exact:true})).toHaveCount(1);
    await expect(page.locator('#verify')).toHaveText('Bytt e-postadresse');
   }
   if(path==='/support'){await expect(page.locator('#cases .empty-state')).toBeVisible();await expect(page.locator('#workspace>.toolbar')).toBeHidden();}
   await page.screenshot({path:`/tmp/smarti-mobile-${path.replaceAll('/','')||'homes'}-${width}.png`,fullPage:true});
  }
 }
 // Successful portal logout must tell the native shell to forget this session.
 signedIn=true;admin=false;await page.goto('https://home.smarti.dev/');
 await expect(page.locator('#account')).toBeVisible();
 await page.evaluate(()=>{window.nativeMessages=[];window.webkit={messageHandlers:{smartiSession:{postMessage:value=>window.nativeMessages.push(value)}}};});
 await page.locator('#logout').click();await expect(page.locator('#auth')).toBeVisible();
 if(JSON.stringify(await page.evaluate(()=>window.nativeMessages))!=='["logout"]')throw Error('Native logout missing');
 await expect(page.locator('.masthead nav a[href="/account"]')).toBeHidden();
 // Verify header layout with a 59px safe-area input for login and signed-in pages.
 await page.setViewportSize({width:390,height:844});
 for(const loggedIn of [false,true]){
  signedIn=loggedIn;admin=false;
  await page.goto('https://home.smarti.dev/');
  await expect(page.locator(loggedIn?'#account':'#auth')).toBeVisible();
  await page.addStyleTag({content:':root{--portal-safe-area-top:59px}'});
  await expect(page.locator('.masthead')).toHaveCSS('padding-top','79px');
  const logo=await page.locator('.masthead>a').first().boundingBox();
  if(logo.y<79)throw Error('Logo overlaps iPhone status area');
  await page.screenshot({path:`/tmp/smarti-safe-area-${loggedIn?'home':'login'}.png`,fullPage:true});
 }
 signedIn=false;
 for(const width of [390,1440]){await page.setViewportSize({width,height:900});await page.goto('https://home.smarti.dev/account');
   await expect(page.locator('#login')).toBeVisible();
   await expect(page.locator('#login button[type=submit]')).toHaveCSS('background-color','rgb(255, 121, 0)');
   const button=await page.locator('#login button[type=submit]').boundingBox(),forgot=await page.locator('#login a[href="/forgot-password"]').boundingBox();
   if(forgot.y<button.y+button.height)throw Error('Recovery link overlaps login button');
   await page.screenshot({path:`/tmp/smarti-account-login-${width}.png`,fullPage:true});
 }
 await page.goto('https://home.smarti.dev/account?create=1');
 await expect(page.locator('#signup')).toBeVisible();await expect(page.locator('#login')).toBeHidden();
 await expect(page.locator('#signup [name=email]')).toBeVisible();
 await expect(page.locator('[name=terms_accepted]')).not.toBeChecked();
 await expect(page.locator('[name=marketing_opt_in]')).not.toBeChecked();
 await page.locator('#signup [name=password]').fill('a long test password');
 await page.locator('[name=password_confirmation]').fill('different password');
 if(await page.locator('[name=password_confirmation]').evaluate(n=>n.checkValidity()))throw Error('Mismatched password accepted');
 await page.locator('[name=password_confirmation]').fill('a long test password');
 await expect(page.locator('[data-match]')).toHaveText('✓ Passordene er like');
 await page.screenshot({path:'/tmp/smarti-registration.png',fullPage:true});
 for(const width of [390,1440]){await page.setViewportSize({width,height:900});
   for(const theme of ['light','dark']){await page.evaluate(t=>document.documentElement.dataset.portalTheme=t,theme);
     const first=await page.locator('#signup [name=password]').boundingBox(),second=await page.locator('[name=password_confirmation]').boundingBox();
     if(width===1440){const main=await page.locator('main').boundingBox();if(Math.abs(main.x+main.width/2-width/2)>2)throw Error('Account content not centered');await expect(page.locator('.masthead')).toHaveCSS('position','relative');}
     if(Math.abs(first.width-second.width)>2)throw Error('Password widths differ');
     if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Registration overflow');
     await page.screenshot({path:`/tmp/smarti-registration-${width}-${theme}.png`,fullPage:true});
   }
 }
 signedIn=true;admin=false;noHomes=true;await page.goto('https://home.smarti.dev/');await expect(page.locator('.home-card')).toHaveCount(0);await expect(page.locator('.home-add-card')).toHaveCount(1);await expect(page.locator('.home-add-card')).toContainText('Legg til ditt første hjem');if(errors.length)throw Error(errors.join('\n'));await browser.close();console.log('PASS: login, home actions, admin detail/log and seven responsive portal routes at 390/768/1440px');
})().catch(e=>{console.error(e);process.exit(1)});

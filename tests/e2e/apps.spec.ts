import {test,expect} from '../../frontend/node_modules/@playwright/test';
const installed={slug:'core_mqtt',name:'MQTT broker',description:'Meldinger mellom enhetene dine.',installed:true,version:'1.0',version_latest:'1.1',state:'started',repository:'core',available:true,update_available:true,system_managed:false};
const candidate={...installed,slug:'community_music',name:'Music server',description:'Musikk i alle rom.',installed:false,version:null,state:null,update_available:false};
test.beforeEach(async({page})=>{
 await page.route('**/api/manage/apps',r=>r.fulfill({json:[installed,candidate]}));
 await page.route('**/api/manage/apps/operations',r=>r.fulfill({json:[]}));
 await page.goto('/');await page.getByLabel('Brukernavn',{exact:true}).fill('tester');await page.getByLabel('Passord',{exact:true}).fill('test-password-not-for-live');await page.getByRole('button',{name:'Logg inn',exact:true}).click();await page.getByRole('navigation',{name:'Hovedmeny'}).getByRole('button',{name:'Apper',exact:true}).click();
});
test('library installation requires confirmation and activity survives leaving apps',async({page})=>{
 let writes=0;let ops:any[]=[];
 await page.route('**/api/manage/apps/operations',r=>r.fulfill({json:ops}));
 await page.route('**/api/manage/apps/community_music/actions',r=>{writes++;const data=r.request().postDataJSON();expect(data.action).toBe('install');expect(data.confirm_slug).toBe('community_music');ops=[{request_id:data.request_id,slug:candidate.slug,name:candidate.name,action:'install',status:'accepted',progress:42,created:Date.now()/1000}];return r.fulfill({json:ops[0]});});
 await expect(page.locator('.app-card')).toHaveCount(1);
 await page.getByRole('button',{name:'Appbibliotek',exact:true}).click();await page.getByRole('button',{name:/Music server/}).click();await page.getByRole('dialog').getByRole('button',{name:'Installer',exact:true}).click();expect(writes).toBe(0);
 await page.getByRole('dialog').getByRole('button',{name:'Bekreft installer',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('.app-activity')).toContainText('42 %');expect(writes).toBe(1);
 await page.getByRole('navigation',{name:'Hovedmeny'}).getByRole('button',{name:'Hjem',exact:true}).click();await page.getByRole('navigation',{name:'Hovedmeny'}).getByRole('button',{name:'Apper',exact:true}).click();await expect(page.locator('.app-activity')).toContainText('Music server');
 await page.screenshot({animations:'disabled',path:`test-results/apps-${test.info().project.name}.png`});
});
test('configuration, update backup and uninstall use explicit app actions',async({page})=>{
 let writes:any[]=[];let saves=0;
 await page.route('**/api/manage/apps/core_mqtt/actions',r=>{writes.push(r.request().postDataJSON());return r.fulfill({json:{status:'completed'}});});
 await page.route('**/api/manage/apps/core_mqtt/configuration',r=>{if(r.request().method()==='PUT'){saves++;expect(r.request().postDataJSON().options).toEqual({port:1884});return r.fulfill({json:{saved:true}});}return r.fulfill({json:{options:{port:1883},revision:'a'.repeat(64),boot:'manual',watchdog:false,auto_update:false}});});
 await page.getByRole('button',{name:/MQTT broker/}).click();let d=page.getByRole('dialog');await d.getByRole('button',{name:'Konfigurasjon',exact:true}).click();await d.getByRole('button',{name:'Avansert (JSON)',exact:true}).click();await d.getByLabel('Appinnstillinger (JSON)').fill('{"port":1884}');await d.getByRole('button',{name:'Lagre konfigurasjon'}).click();await expect(d).toContainText('Lagret. Start appen på nytt');expect(saves).toBe(1);
 await d.getByRole('button',{name:'← Tilbake til appen',exact:true}).click();await d.getByRole('button',{name:'Oppdater',exact:true}).click();d=page.getByRole('dialog');await expect(d.getByRole('checkbox')).toBeChecked();expect(writes).toHaveLength(0);await d.getByRole('button',{name:'Bekreft oppdater'}).click();await expect(d).toHaveCount(0);expect(writes[0].backup).toBe(true);
 await page.getByRole('button',{name:/MQTT broker/}).click();await page.getByRole('dialog').getByRole('button',{name:'Avinstaller',exact:true}).click();d=page.getByRole('dialog');await expect(d).toContainText('Appdata kan gå tapt');expect(writes).toHaveLength(1);await d.getByRole('button',{name:'Bekreft avinstaller'}).click();await expect(d).toHaveCount(0);expect(writes[1].action).toBe('uninstall');
});
test('repository form and unavailable controller remain clear',async({page})=>{
 let source='';await page.route('**/api/manage/apps/repositories',r=>{if(r.request().method()==='POST'){source=r.request().postDataJSON().repository;return r.fulfill({json:{saved:true}});}return r.fulfill({json:source?[{slug:'custom',name:'Min appkilde',source}]:[]});});
 await page.getByRole('button',{name:'Appkilder',exact:true}).click();const d=page.getByRole('dialog');await d.getByLabel('Legg til appkilde',{exact:true}).fill('https://github.com/example/apps');await d.getByRole('button',{name:'Legg til kilde'}).click();await expect(d).toContainText('Min appkilde');await d.getByRole('button',{name:'Lukk innstillinger'}).click();
 await page.route('**/api/manage/apps',r=>r.fulfill({status:503,json:{detail:'supervisor_unavailable'}}));await page.reload();await page.getByRole('navigation',{name:'Hovedmeny'}).getByRole('button',{name:'Apper',exact:true}).click();await expect(page.getByRole('heading',{name:'Appadministrasjon er utilgjengelig'})).toBeVisible();await expect(page.locator('.app-card')).toHaveCount(0);
});
test('app images appear in cards and dialogs with graceful fallback',async({page})=>{
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=','base64');
 await page.route('**/api/manage/apps',r=>r.fulfill({json:[{...installed,icon:true,logo:true},{...candidate,icon:true,logo:false}]}));
 await page.route('**/api/manage/apps/*/image?*',r=>r.request().url().includes('community_music')?r.fulfill({status:404}):r.fulfill({contentType:'image/png',body:png}));
 await page.reload();await page.getByRole('navigation',{name:'Hovedmeny'}).getByRole('button',{name:'Apper',exact:true}).click();
 const icon=page.locator('.app-card img');await expect(icon).toHaveAttribute('src',/source=installed&kind=icon/);await expect.poll(()=>icon.evaluate((el:HTMLImageElement)=>el.naturalWidth)).toBe(1);
 await page.getByRole('button',{name:/MQTT broker/}).click();await expect(page.getByRole('dialog').locator('.app-symbol img')).toHaveAttribute('src',/kind=logo/);await page.getByRole('button',{name:'Lukk innstillinger'}).click();
 await page.getByRole('button',{name:'Appbibliotek',exact:true}).click();await expect(page.locator('.app-card .app-symbol svg')).toBeVisible();await expect(page.locator('.app-card img')).toHaveCount(0);
});

test('configuration form preserves nested values, masks secrets and validates JSON switching',async({page},info)=>{
 let current:any={options:{port:1883,password:'fake-test-secret',log_level:'info',ssl:false,mqtt:{host:'local',username:'tester'},devices:[{name:'Door',enabled:true}],custom:null},revision:'a'.repeat(64),schema:{port:'port',password:'password',log_level:'list(debug|info|warning)',ssl:'bool',mqtt:{host:'str',username:'str'},devices:[{name:'str',enabled:'bool'}],optional:'str?'},boot:'manual',watchdog:false,auto_update:false,boot_config:'manual_only'};
 let written:any;
 await page.route('**/api/manage/apps/core_mqtt/configuration',r=>{
  if(r.request().method()==='PUT'){written=r.request().postDataJSON();current={...current,...written,revision:'b'.repeat(64)};return r.fulfill({json:{saved:true}});}
  return r.fulfill({json:current});
 });
 await page.getByRole('button',{name:/MQTT broker/}).click();
 const d=page.getByRole('dialog');await d.getByRole('button',{name:'Konfigurasjon',exact:true}).click();
 await expect(d.getByRole('switch',{name:'Start automatisk',exact:true})).toBeDisabled();
 await expect(d.locator('input[type="password"]')).toHaveValue('fake-test-secret');
 await d.getByLabel('Port',{exact:false}).fill('1884');
 await d.getByRole('combobox',{name:/Loggnivå/}).selectOption('debug');
 await d.getByRole('button',{name:'Innstillinger',exact:true}).click();
 await expect(d.getByLabel('Port',{exact:false})).toHaveValue('1884');
 await d.getByRole('switch',{name:'Start på nytt ved feil',exact:true}).check();
 await d.getByRole('button',{name:'Avansert (JSON)',exact:true}).click();
 const json=d.getByLabel('Appinnstillinger (JSON)',{exact:true});
 const valid=await json.inputValue();await json.fill('{ invalid');
 await d.getByRole('button',{name:'Innstillinger',exact:true}).click();
 await expect(d.getByRole('alert')).toContainText('JSON må være');
 await json.fill(valid);await d.getByRole('button',{name:'Innstillinger',exact:true}).click();
 await d.getByRole('button',{name:'Lagre konfigurasjon',exact:true}).click();
 await expect(d).toContainText('Lagret. Start appen på nytt');
 expect(written.options).toEqual({...current.options,port:1884,log_level:'debug'});
 expect(written.options.password).toBe('fake-test-secret');expect(written.options.custom).toBeNull();
 expect(written.options.devices).toEqual([{name:'Door',enabled:true}]);expect(written.options).not.toHaveProperty('optional');expect(written.watchdog).toBe(true);
 await expect(d.getByRole('button',{name:'Lagre konfigurasjon',exact:true})).toBeDisabled();
 await d.locator('.dashboard-settings-content').evaluate(el=>el.scrollTop=0);
 await d.screenshot({path:`test-results/app-config-${info.project.name}.png`});
});

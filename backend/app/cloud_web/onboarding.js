const $=id=>document.getElementById(id), staff=location.pathname==='/admin/hubs';
let csrf='', active='', activation=null, busy=false, kitURL=null, wizardStep=0, profileOnly=false;
const parameters=new URLSearchParams(location.search);
const candidateDevice=parameters.get('device')||'';
const selectedDevice=/^[0-9a-f-]{36}$/.test(candidateDevice)?candidateDevice:'';
const sections=['welcome','scan','auth','setup','progress','factory','verification','app-download'];
function show(id){for(const s of sections)$(s).hidden=s!==id;window.scrollTo({top:0,behavior:'instant'});}
function el(tag,text){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;}
const {text}=window.smartiAuthLanguage;
const liveCopy=new Map();
const validationMessages=new Map();
function setCopy(id,...copy){
 if(copy.length)liveCopy.set(id,copy);
 else liveCopy.delete(id);
 $(id).textContent=copy.length?text(...copy):'';
}
function localizedError(copy){return Object.assign(new Error(text(...copy)),{copy});}
const requestFailed=['Kunne ikke fullføre. Oppsettet er lagret; prøv igjen.','Could not complete the request. You can resume setup and try again.'];
const timedOut=['Svaret tok for lang tid. Kontroller status før du prøver igjen.','The request timed out. Check the status before trying again.'];
function showError(error){
 const copy=error.name==='TimeoutError'?timedOut:error.copy||(staff?[error.message,error.message]:requestFailed);
 setCopy('message',...copy);
}
$('onboarding-language').hidden=staff;
const errors={
 hub_still_linked:['Huben er fortsatt knyttet til en konto og kan ikke slettes.',
  'This hub is still linked to an account and cannot be deleted.'],
 hub_operation_in_progress:['Vent til oppsettet eller tilbakestillingen er fullført før du sletter huben.',
  'Wait until setup or reset finishes before deleting this hub.'],
 hub_not_found:['Huben finnes ikke lenger. Oppdater listen.',
  'We couldn’t find the hub. Refresh and try again.'],
 enrollment_offline:['Huben er funnet lokalt, men har ikke kontakt med SMARTi på internett ennå. Kontroller nettverkskabelen, vent litt og prøv igjen.',
  'We found the hub on your network, but it hasn’t connected to SMARTi online yet. Check the Ethernet cable, wait a moment and try again.'],
 enrollment_not_ready:['Home Assistant starter fortsatt, eller huben har allerede SMARTi-brukere. Vent til den er klar, eller bruk eksisterende innlogging.',
  'Home Assistant is still starting, or the hub already has SMARTi users. Wait for it to finish starting or sign in with an existing account.'],
 device_already_linked:['Denne huben er allerede koblet til en annen installasjon.',
  'This hub is already linked to another installation.'],
 hub_already_personalized:['Denne etiketten er allerede knyttet til en annen hub. Velg riktig QR-kode eller kontakt support.',
  'This label is linked to another hub. Scan the correct QR code or contact support.'],
 home_has_an_owner:['Denne huben tilhører allerede en annen konto. Be eieren om hjelp; etiketten gir ikke eierskap.',
  'This hub already belongs to another account. Ask the owner for help.'],
 hub_not_ready_or_offline:['Huben er ikke leveringsklar eller er ikke på nett. Kontroller strøm og nettverkskabel, og prøv igjen.',
  'The hub is offline or still being prepared. Check its power and Ethernet connections and try again.'],
 factory_checks_incomplete:['Huben må være på nett, ha kontakt med Home Assistant og ha null SMARTi-brukere. Alle kontrollpunktene må bekreftes.',
  'Connect the hub to the internet and to Home Assistant, then complete the preparation checks.'],
 activation_not_found:['Vi fant ikke denne kombinasjonen av etikett og aktiveringskode. Kontroller kortet i esken. Hvis du brukte lokalt søk, søk på nytt – funnet kan ha utløpt.',
  'We couldn’t match this label and activation code. Check the card in the box, or search again if you found the hub on your network.'],
 password_confirmation_failed:['Passordet til SMARTi-kontoen stemmer ikke.',
  'The SMARTi account password is incorrect.'],
 existing_users:['Huben har allerede en bruker. Velg eksisterende oppsett eller en bekreftet nullstilling.',
  'The hub already has a user. Continue with the existing setup or confirm a reset.'],
 no_existing_user:['Huben mangler en bruker. Fullfør oppstartsveilederen først.',
  'The hub has no users. Complete the setup wizard first.'],
 serial_already_registered:['Serienummeret er allerede registrert.',
  'This serial number is already registered.'],
 setup_in_progress:['Oppsettet pågår allerede. Vent på resultatet før du gjør endringer.',
  'Setup is already running. Wait for it to finish before making changes.'],
 invalid_credentials:['Feil brukernavn eller passord for SMARTi-kontoen.','Incorrect username or password for your SMARTi account.'],
 account_not_created:['Kontoen kunne ikke opprettes. Kontroller om e-postadressen er i bruk.','Could not create the account. Check whether the email address is already in use.'],
 email_unavailable:['E-postadressen er allerede i bruk.','That email address is already in use.'],
 customer_profile_required:['Fullfør kontaktprofilen din før du legger til huben.','Complete your contact profile before adding the hub.'],
 email_verification_required:['Bekreft e-postadressen din før du fortsetter.','Verify your email address before continuing.'],
 reset_not_ready:['Huben er ikke klar etter tilbakestillingen ennå. Vent litt og prøv igjen.','The hub isn’t ready after the reset. Wait a moment and try again.'],
 reset_qr_required:['Skann QR-koden under huben på nytt før du fortsetter.','Scan the QR code under the hub again before continuing.'],
 reset_confirmation_required:['Skriv bekreftelsen som vises over feltet.','Enter the confirmation exactly as shown above the field.'],
};
const statusErrors={
 401:['Logg inn for å fortsette.','Sign in to continue.'],
 403:['Tilgang mangler eller innloggingen er utløpt.','Access is unavailable or your session has expired.'],
 422:['Kontroller feltene. Nye passord trenger minst 12 tegn.','Check the fields. New passwords must contain at least 12 characters.'],
 429:['For mange forsøk. Vent 15 minutter før du prøver igjen.','Too many attempts. Wait 15 minutes before trying again.'],
};
async function api(path,method='GET',body,fallback=requestFailed){
 const r=await fetch('/api/'+path,{
  method,credentials:'same-origin',
  headers:{'Content-Type':'application/json','X-CSRF-Token':csrf,'X-SMARTi-Language':window.smartiAuthLanguage.language},
  ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000),
 });
 if(path==='session'&&r.ok)document.documentElement.dataset.portalSession='authenticated';
 if(r.status===401||(path==='logout'&&r.ok))delete document.documentElement.dataset.portalSession;
 if(!r.ok){
  const {detail}=await r.json().catch(()=>({}));
  const code=typeof detail==='string' ? detail : '';
  const copy=Object.hasOwn(errors,code)?errors[code]:statusErrors[r.status];
  throw localizedError(copy||(typeof fallback==='string'?[fallback,fallback]:fallback));
 }
 return r.json();
}
async function run(fn){
 if(busy)return;
 busy=true;
 setCopy('message');
 document.body.classList.add('is-working');
 const buttons=[...document.querySelectorAll('button:enabled')];
 buttons.forEach(b=>b.disabled=true);
 try{await fn();}
 catch(e){showError(e);}
 finally{
  document.body.classList.remove('is-working');
  busy=false;
  buttons.forEach(b=>b.disabled=false);
  if(!staff&&location.hash)queueMicrotask(resumeScannedActivation);
 }
}
function parseLabel(value){
 let raw=value.trim();
 if(raw.startsWith('https://')){
  let u;
  try{u=new URL(raw);}catch{}
  if(u?.origin!=='https://home.smarti.dev'||u.pathname!=='/activate'){
   throw localizedError(['Dette er ikke en SMARTi-hubetikett.','This isn’t a SMARTi hub label.']);
  }
  raw=u.hash.slice(1);
 }
 const m=/^([0-9a-f-]{36})\.((?:(?:[0-9]{10}|v2)\.)?[0-9a-f]{64})$/.exec(raw);
 if(!m)throw localizedError(['Skann hubetiketten eller lim inn hele lenken.','Scan the hub label or paste the full link.']);
 return {home:m[1],code:m[2]};
}
async function current(){try{const s=await api('session');csrf=s.csrf;$('admin-nav').hidden=!s.portal_admin;$('generate-serial').hidden=!s.portal_admin;return true;}catch{return false;}}
$('identify').onsubmit=e=>{
 e.preventDefault();
 run(async()=>{
  const data=new FormData(e.target);
  const candidate={...parseLabel(data.get('label')),pin:data.get('pin'),...(selectedDevice?{device:selectedDevice}:{})};
  const h=await api('activation/'+candidate.home+'/identify','POST',candidate);
  activation=candidate;
  const connection=selectedDevice
   ? ['Valgt hub '+selectedDevice.slice(-8),'Selected hub '+selectedDevice.slice(-8)]
   : h.online?['Huben er på nett','Hub is online']:['Venter på nettverk','Waiting for a connection'];
  setCopy('identified',...connection.map(label=>h.model+' · '+h.serial+' · '+label));
  if(await current())await claim();
  else show('auth');
 });
};
async function verified(){
 if(!await current()){show('auth');return false;}
 const r=await api('customer/profile');
 if(!r.profile){profileOnly=true;window.smartiRegistration?.editProfile(false);show('auth');$('signup').hidden=false;$('login').hidden=true;$('signup').elements.password.required=false;$('signup').elements.password.closest('label').hidden=true;return false;}
 if(!r.profile.verified){show('verification');return false;}
 $('hub-username').value=(r.profile.full_name.trim().split(/\s+/)[0]||'admin').normalize('NFKC').replace(/[^\p{L}\p{N}_-]/gu,'').slice(0,64)||'admin';
 return true;
}
async function continueSetup(){
 const form=$('identify');
 if(!active&&!activation&&form.elements.label.value){
  show('scan');
  if(form.elements.pin.required)form.elements.pin.focus();
  else setTimeout(()=>form.requestSubmit(),0);
  return;
 }
 if(!await verified())return;
 if(activation)await claim();
 else if(active)await status();
 else show('scan');
}
$('check-verification').onclick=()=>run(continueSetup);
$('resend-verification').onclick=()=>run(async()=>{
 await api('customer/verification','POST');
 setCopy('message','En ny bekreftelse er lagt i utsendingskøen. Sjekk også søppelposten.',
  'A new verification email is queued. Check your spam folder too.');
});
async function claim(){if(!await verified())return;if(!activation)throw localizedError(['Skann etiketten først.','Scan the hub label first.']);const r=await api('activation/'+activation.home+'/claim','POST',activation);active=r.id;activation=null;history.replaceState(null,'','/activate?home='+active);await status();}
async function login(register=false){const data=Object.fromEntries(new FormData($('login')));if(register)await api('register','POST',data);csrf=(await api('login','POST',data)).csrf;$('login').reset();if(staff){await current();show('factory');await inventory();}else await continueSetup();}
$('login').onsubmit=e=>{e.preventDefault();run(()=>login());};
$('show-register').onclick=()=>{$('signup').hidden=false;$('login').hidden=true;};
$('show-login').onclick=()=>{$('signup').hidden=true;$('login').hidden=false;};
$('signup').onsubmit=e=>{e.preventDefault();run(async()=>{const d=Object.fromEntries(new FormData(e.target));const password=d.password;delete d.password;const registration=window.smartiRegistration.payload();delete d.password_confirmation;delete d.terms_accepted;delete d.marketing_opt_in;d.photo=window.smartiProfilePhoto||'';if(profileOnly){await api('customer/profile','PUT',d);}else{await api('register','POST',{username:d.email,password,profile:d,...registration});csrf=(await api('login','POST',{username:d.email,password})).csrf;}e.target.reset();await continueSetup();});};
$('invite-form').onsubmit=e=>{e.preventDefault();run(async()=>{
 await api('customer/homes/'+active+'/invitations','POST',Object.fromEntries(new FormData(e.target)));
 setCopy('invite-status','Invitasjonen er lagt i utsendingskøen. Du kan invitere flere eller åpne hjemmet.',
  'The invitation is queued. You can invite someone else or open your home.');
 e.target.reset();
});};
$('open-home').onclick=e=>{if($('open-home').dataset.existing==='true')return;e.preventDefault();run(async()=>{const r=await api('customer/homes/'+active+'/open','POST');location.assign(r.url);});};
const defaults={
 home:['Mitt hjem','My home'],country:['Norge','Norway'],
 living:['Stue','Living room'],kitchen:['Kjøkken','Kitchen'],
 bath:['Bad','Bathroom'],bedroom:['Soverom','Bedroom'],floor:['Første etasje','First floor'],
};
function updateDefault(input){
 const copy=defaults[input.dataset.setupDefault];
 input.defaultValue=input.value=text(...copy);
}
function translatedDefault(input,key){
 input.dataset.setupDefault=key;
 input.addEventListener('input',()=>delete input.dataset.setupDefault,{once:true});
 updateDefault(input);
}
function room(name='',floor=null,defaultRoom){
 const row=el('div');row.className='room-row';
 for(const [key,value,defaultKey]of[['room',name,defaultRoom],['floor',floor,floor===null?'floor':null]]){
  const label=el('label'),caption=el('span'),input=el('input');
  caption.dataset.roomLabel=key;
  input.value=value??'';
  input.required=true;input.maxLength=80;input.dataset.field=key;
  if(defaultKey)translatedDefault(input,defaultKey);
  label.append(caption,input);row.append(label);
 }
 const remove=el('button','×');remove.type='button';remove.dataset.roomLabel='remove';remove.onclick=()=>row.remove();
 row.append(remove);$('rooms').append(row);renderRoomLabels(row);
}
function renderRoomLabels(root){
 for(const node of root.querySelectorAll('[data-room-label]')){
  switch(node.dataset.roomLabel){
   case 'room':node.textContent=text('Rom','Room');break;
   case 'floor':node.textContent=text('Etasje','Floor');break;
   case 'remove':node.setAttribute('aria-label',text('Fjern rom','Remove room'));break;
  }
 }
}
$('add-room').onclick=()=>room();
for(const key of ['living','kitchen','bath','bedroom'])room('',null,key);
translatedDefault($('configure').elements.name,'home');
translatedDefault($('signup').elements.country,'country');
$('locate').onclick=()=>{
 if(!navigator.geolocation){
  setCopy('message','Nettleseren støtter ikke posisjon. Fyll inn koordinatene manuelt.',
   'Location is unavailable in this browser. Enter the coordinates manually.');
  return;
 }
 navigator.geolocation.getCurrentPosition(p=>{
  const f=$('configure');
  clearValidation(f.elements.latitude);clearValidation(f.elements.longitude);
  f.elements.latitude.value=p.coords.latitude;f.elements.longitude.value=p.coords.longitude;
  setCopy('location-summary','Posisjonen er valgt. Kontroller at du er ved riktig hus.',
   'Location selected. Check that you’re at the correct home.');
 },()=>setCopy('message','Posisjonen kunne ikke hentes. Tillat posisjon, eller skriv inn husets koordinater.',
  'Could not get your location. Allow location access or enter the home’s coordinates.'),{timeout:15000});
};
function mode(){return $('existing-options').hidden?'new':$('configure').elements.mode.value;}
function updateMode(){const m=mode();$('setup-fields').hidden=m==='existing';$('setup-fields').querySelectorAll('input').forEach(x=>x.disabled=m==='existing');$('reset-warning').hidden=m!=='reset';$('hub-credentials').hidden=m==='existing';$('hub-credentials').querySelectorAll('input').forEach(i=>i.disabled=m==='existing');setCopy('finish',...(m==='existing'?['Fortsett med hjemmet','Continue with this home']:['Gjør hjemmet klart','Finish setup']));wizardStep=m==='existing'?3:0;showStep();}
$('configure').elements.mode.forEach(r=>r.onchange=updateMode);
$('configure').onsubmit=e=>{e.preventDefault();if(wizardStep<3){advance();return;}run(async()=>{
 const d=Object.fromEntries(new FormData(e.target)),m=mode();
 const body={mode:m,name:d.name||text(...defaults.home),latitude:Number(d.latitude||0),longitude:Number(d.longitude||0),timezone:d.timezone||'Europe/Oslo',country:d.country||'NO',experience:d.experience||'normal',language:window.smartiAuthLanguage.language,rooms:m==='existing'?[]:[...$('rooms').children].map(row=>({name:row.querySelector('[data-field=room]').value.trim(),floor:row.querySelector('[data-field=floor]').value.trim()})),password:d.password||'',password_repeat:d.password_repeat||'',confirmation:d.confirmation||''};
 await api('onboarding/'+active,'POST',body);
 e.target.elements.password.value='';e.target.elements.password_repeat.value='';
 await status();
});};
const stepNames={
 zwave_keys:['Sikrer Z-Wave-nettverket','Securing the Z-Wave network'],
 radios:['Kobler til Zigbee og Z-Wave','Connecting Zigbee and Z-Wave'],
 checking:['Kontrollerer huben','Checking the hub'],
 resetting:['Nullstiller kundedata','Resetting customer data'],
 location:['Lagrer hjem og posisjon','Saving the home and its location'],
 rooms:['Oppretter etasjer og rom','Creating floors and rooms'],
 user:['Oppretter din bruker','Creating your user account'],
 completed:['Oppsett lagret','Setup saved'],
};
const progressErrors={
 zwave_keys_existing_devices:['Z-Wave-kontrolleren har fortsatt parede enheter. Fjern disse manuelt før produksjonsoppsettet kan fortsette.',
  'The Z-Wave controller still has paired devices. Remove them manually before continuing setup.'],
 zwave_keys_unavailable:['Kunne ikke bekrefte de nye Z-Wave-nøklene. Kontroller at Z-Wave JS UI kjører, og prøv igjen. Kontakt support hvis dette fortsetter.',
  'Could not verify the new Z-Wave keys. Check that Z-Wave JS UI is running and try again. Contact support if the problem persists.'],
 radios_unavailable:['Zigbee eller Z-Wave er ikke klar. Kontroller at Zigbee2MQTT, MQTT og Z-Wave JS UI kjører. Forbindelsene må være aktive før oppsettet kan fullføres. Ingen paringer er endret.',
  'Zigbee or Z-Wave isn’t ready. Check that Zigbee2MQTT, MQTT and Z-Wave JS UI are running. Setup needs active connections to finish. Your existing pairings are intact.'],
 ha_unavailable:['Huben får ikke kontakt med Home Assistant. Kontroller at den har startet, og prøv igjen.',
  'The hub can’t reach Home Assistant. Check that Home Assistant has started and try again.'],
 existing_users:errors.existing_users,
 reset_not_supported:['Huben støtter ikke denne typen nullstilling. Velg eksisterende oppsett eller kontakt support.',
  'This hub does not support this type of reset. Use the existing setup or contact support.'],
};
let latestSetupStatus;
function renderResetReport(h){
 let report=$('reset-report');
 if(!report){report=el('details');report.id='reset-report';$('hub-status').after(report);}
 report.replaceChildren();report.hidden=!h.reset?.report?.length;
 if(report.hidden)return;
 report.append(el('summary',text('Rapport fra tilbakestillingen','Reset report')));
 const names={
  'Enhetsparinger beholdes':'Device pairings kept',
  'Brukere, oppsett og omstart av huben':'Users, setup and hub restart',
  'Home Assistant-eier':'Home Assistant owner',
  'Home Assistant-bruker':'Home Assistant user',
  'Langtidshistorikk':'Long-term history',
  'Historikk':'History',
  'Øvrig HA-oppsett og tilganger':'Other Home Assistant settings and access',
  'SMARTi-visning og varslingshistorikk':'SMARTi layout and notification history',
 };
 for(const entry of h.reset.report){
  const name=Object.hasOwn(names,entry.name)?text(entry.name,names[entry.name]):entry.name;
  const outcome=entry.status==='done'?text('Utført','Done'):text(
   'Må kontrolleres – fysisk nullstilling eller ny paring kan være nødvendig',
   'Check this item. A physical reset or new pairing may be needed.');
  report.append(el('p',name+' · '+outcome));
 }
}
function progressCopy(h,p){
 if(p.status==='failed'){
  const copy=progressErrors[p.error];
  if(copy)return text(...copy);
  const stage=stepNames[p.step];
  return text(
   (stage?stage[0]+' – dette steget kunne ikke fullføres. ':'Oppsettet kunne ikke fullføres. ')+'Det som allerede er lagret beholdes. Prøv igjen eller kontakt support.',
   (stage?stage[1]+' – this step couldn’t finish. ':'Setup couldn’t finish. ')+'Your progress is saved. Try again or contact support.');
 }
 if(p.status==='completed'){
  if(!h.online||!h.remote_connected)return text('Oppsettet er lagret. Vi venter fortsatt på at fjernforbindelsen blir klar.','Setup is saved. We’re waiting for the remote connection to become available.');
  return p.draft.mode==='existing'
   ? text('Oppsettet er beholdt. Åpne hjemmet med din eksisterende bruker.','Your setup is ready. Open the home with your existing user account.')
   : text('Alt er klart. Du er innlogget og kan åpne hjemmet ditt.','Everything is ready. You’re signed in and can open your home.');
 }
 if(!h.online)return text('Huben er ikke på nett. Kontroller strøm og nettverkskabel. Vi venter og kontrollerer igjen.','The hub is offline. Check its power and Ethernet connections. We’ll check again shortly.');
 return text(...(stepNames[p.step]||['Venter på huben','Waiting for the hub']));
}
function renderProgress(h){
 const p=h.plan,complete=p.status==='completed';
 $('progress-phase').textContent=complete?text('4 · KLAR TIL BRUK','4 · READY TO USE'):text('4 · VI GJØR HJEMMET KLART','4 · GETTING YOUR HOME READY');
 $('progress-title').textContent=complete?text('Hjemmet ditt er satt opp.','Your home is ready.')
  :p.status==='failed'?text('Vi trenger litt hjelp.','Setup needs your attention.')
  :text('Huben tar over herfra.','Your hub will take it from here.');
 $('progress-text').textContent=progressCopy(h,p);
 const steps=['checking','location','rooms','user'];
 if(p.step==='radios'||p.step==='zwave_keys'||p.step==='resetting')steps.splice(1,0,p.step);
 const currentIndex=steps.indexOf(p.step);
 $('steps').hidden=complete;
 $('steps').replaceChildren(...steps.map((key,index)=>{
  const item=el('li',text(...stepNames[key]));
  item.className=complete||index<currentIndex?'done':key===p.step?'working':'';
  if(item.className==='working')item.setAttribute('aria-current','step');
  return item;
 }));
 const open=$('open-home');
 open.hidden=!(complete&&h.online&&h.remote_connected);
 open.href='https://'+active+'.home.smarti.dev/';
 open.dataset.existing=String(p.draft.mode==='existing');
 $('invite-step').hidden=!complete;
 $('retry').hidden=p.status!=='failed';
 $('manage-setup').hidden=!complete||p.draft.mode==='new';
}
function renderSetupStatus(h){
 $('hub-status').textContent=h.model+' · '+h.serial+' · '+(h.online
  ? text('Tilkoblet','Connected'):text('Venter på nettverk','Waiting for a connection'));
 renderResetReport(h);
 if(!$('progress').hidden&&h.plan)renderProgress(h);
}
async function status(edit=false){
 const h=await api('onboarding/'+active),p=h.plan;
 latestSetupStatus=h;
 if(h.reset?.scan_required){
  active='';show('scan');
  setCopy('scan-title','Skann hubens QR-kode på nytt','Scan the hub’s QR code again');
  setCopy('scan-hint','Eierskapet er beholdt. Skann etiketten under huben for å starte nytt oppsett med samme konto.',
   'Scan the label on the underside of the hub to set it up again using the same account.');
  return;
 }
 if(p&&!edit){if($('progress').hidden)show('progress');renderSetupStatus(h);return;}
 show('setup');renderSetupStatus(h);
 $('existing-options').hidden=!(h.health.users>0);
 if(edit&&p){
  const d=p.draft,f=$('configure');
  delete f.elements.name.dataset.setupDefault;
  for(const key of ['name','latitude','longitude','timezone','country'])f.elements[key].value=d[key]||(key==='country'?'NO':'');
  if(d.mode==='reset')f.elements.mode.value='reset';
  f.elements.experience.value=d.experience;
  $('rooms').replaceChildren();d.rooms.forEach(r=>room(r.name,r.floor));
 }
 updateMode();
}
$('retry').onclick=()=>run(()=>status(true));$('manage-setup').onclick=()=>run(()=>status(true));
let fleetHubs=[];
async function inventory(){fleetHubs=await api('admin/hubs');await window.fleet.load(api,fleetHubs);renderInventory();}
function renderInventory(){const hubs=window.fleet.select(fleetHubs);window.fleet.mapItems(hubs);$('inventory').replaceChildren();for(const h of hubs){const card=el('article');card.className='hub-record';card.dataset.hub=h.id;const info=el('div');info.className='hub-info';const title=el('h2');const detailLink=el('button',h.serial);detailLink.type='button';detailLink.className='hub-detail-link';detailLink.onclick=()=>window.fleet.openDetails(h.id);title.append(detailLink);info.append(title,el('p',h.model+' · '+h.hardware),hubStatusNode(h));if(h.reset&&h.reset.phase!=='completed')info.append(el('p',(h.reset.ownership==='release_owner'?'Klargjøres for ny eier. Bruk samme QR-etikett ved nytt oppsett.':'Eieren beholdes. Bruk samme QR-etikett ved nytt oppsett.')+ (h.reset.qr_verified?' QR-koden er bekreftet.':'')));if(h.health.version)info.append(el('p','SMARTi '+h.health.version+' · '+h.health.users+' brukere · HA '+(h.health.ha_connected?'tilkoblet':'frakoblet')));const label=el('div');label.className='hub-label';const img=el('img');img.src='/api/admin/hubs/'+h.id+'/label';img.alt='QR-kode for '+h.serial;label.append(el('strong','SMARTi'),img,el('p',h.serial),el('small',h.model),el('small','Skann med SMARTi-appen'));const actions=el('div');actions.className='hub-actions';const view=el('button','Se detaljer');view.type='button';view.onclick=()=>window.fleet.openDetails(h.id);actions.append(view,window.fleet.printButton(h),window.fleet.fulfillment(h));if(h.phase==='preparing'){const renew=el('button','Ny klargjøringsfil');renew.onclick=()=>{if(confirm('Erstatt hubens tilkoblingsnøkkel og aktiveringskode? Den gamle filen slutter å virke. Bruk den nye aktiveringskoden i oppsettet. Huben mottar tilkoblingen automatisk ved lokalt søk.'))run(async()=>{showKit(await api('admin/hubs/'+h.id+'/reprovision','POST'));await inventory();});};const more=el('details');more.className='hub-preparation';more.append(el('summary','Klargjør hub'));more.append(renew);const checks=el('form');checks.className='checks';for(const [key,title]of Object.entries({ha:'Home Assistant er klargjort',zigbee:'Zigbee-radio og Z2M er kontrollert',zwave:'Z-Wave-radio og UI er kontrollert',network:'Nettverk og hubidentitet er kontrollert',clean:'Ingen kundedata eller testhistorikk ligger igjen'})){const l=el('label'),i=el('input');i.type='checkbox';i.name=key;i.required=true;l.append(i,document.createTextNode(title));checks.append(l);}const ready=el('button','Godkjenn for levering');ready.className='primary';checks.append(ready);checks.onsubmit=e=>{e.preventDefault();run(async()=>{await api('admin/hubs/'+h.id+'/ready','POST',Object.fromEntries([...checks.querySelectorAll('input')].map(x=>[x.name,x.checked])));await inventory();});};more.append(checks);info.append(more);}const photo=el('img');photo.className='hub-photo';photo.src='/assets/smarti-hub.png';photo.alt='';photo.loading='lazy';info.append(window.fleet.versions(h));card.append(photo,info,window.fleet.metric(h),label,actions);$('inventory').append(card);}if(!hubs.length)$('inventory').append(el('p','Ingen huber å vise. Endre søket eller registrer en ny hub.'));}
$('new-hub').onsubmit=e=>{e.preventDefault();run(async()=>{const kit=await api('admin/hubs','POST',Object.fromEntries(new FormData(e.target)));showKit(kit);e.target.reset();$('serial-status').textContent='';await inventory();});};$('refresh').onclick=()=>run(inventory);if(staff){window.fleet.init(renderInventory);$('traffic-period').onchange=()=>run(inventory);}
if(selectedDevice){
 const serial=selectedDevice.slice(-8);
 setCopy('scan-title','Huben er funnet.','We found your hub.');
 setCopy('scan-hint',
  'Valgt hub: '+serial+'. Skann etiketten under huben. Vi kobler huben til kontoen din automatisk – du trenger ikke legge inn nøkler i Home Assistant.',
  'Selected hub: '+serial+'. Scan the label on its underside. SMARTi will link the hub to your account automatically.');
}
const nativeDiscovery=window.webkit?.messageHandlers?.smartiOnboarding??window.smartiOnboarding;
const manualEntry=parameters.get('manual')==='1';
$('manual-discovery').hidden=!!nativeDiscovery&&!manualEntry;
$('manual-discovery').open=manualEntry;
$('discover-native').onclick=()=>{if(nativeDiscovery)nativeDiscovery.postMessage('discover');else $('browser-discovery').hidden=false;};
$('new-home').onclick=e=>{e.preventDefault();run(continueSetup);};
$('scan-native').onclick=()=>nativeDiscovery?.postMessage('scan');

function mobilePlatform(){
 const ua=navigator.userAgent;
 if(/Android/i.test(ua))return 'android';
 if(/iPhone|iPad|iPod/i.test(ua)||(/Macintosh/i.test(ua)&&navigator.maxTouchPoints>1))return 'ios';
 return null;
}

async function offerAppDownload(){
 if(nativeDiscovery||location.pathname!=='/activate'||location.search)return false;
 const platform=mobilePlatform(),fragment=location.hash;
 if(!platform||!fragment)return false;
 try{parseLabel(fragment.slice(1));}catch{return false;}

 try{
  const response=await fetch('/api/activation/app-download?platform='+platform,{
   credentials:'omit',signal:AbortSignal.timeout(2000)
  });
  if(!response.ok||location.hash!==fragment)return false;
  const {url}=await response.json();
  if(!url||location.hash!==fragment)return false;

  // Drop the QR credential before leaving. The store only receives the app URL.
  history.replaceState(null,'',location.pathname);
  const link=$('open-app-store');
  link.href=url;
  setCopy('open-app-store',...(platform==='ios'
   ?['Åpne App Store','Open the App Store']:['Åpne Google Play','Open Google Play']));
  show('app-download');
  location.assign(url);
  return true;
 }catch{return false;}
}

// WKWebView can navigate to a scanned fragment without reloading this document.
function readActivationFragment(){
 const fragment=location.hash.slice(1);
 if(!fragment)return;
 history.replaceState(null,'',location.pathname+location.search);
 try{
  const {code}=parseLabel(fragment);
  const form=$('identify'),pin=form.elements.pin;
  const needsPin=!code.startsWith('v2.')&&!/^[0-9]{10}\./.test(code);
  form.elements.label.value=fragment;
  form.elements.label.closest('label').hidden=true;
  clearValidation(form.elements.label);clearValidation(pin);
  pin.value='';
  pin.required=needsPin;
  pin.closest('label').hidden=!needsPin;
  setCopy('scan-title','QR-koden er lest.','QR code scanned.');
  setCopy('scan-hint',...(needsPin
   ?['Skriv aktiveringskoden fra kortet i esken. Vi fortsetter automatisk når alle åtte sifrene er fylt inn.',
     'Enter the activation code from the card in the box. Setup continues automatically once you enter all eight digits.']
   :['Vi bekrefter huben og kobler den til kontoen din.','We’ll verify the hub and link it to your account.']));
  if(needsPin){$('manual-discovery').hidden=false;$('manual-discovery').open=true;}
 }catch{setCopy('message','QR-koden kunne ikke leses. Skann etiketten under huben på nytt.',
  'Could not read the QR code. Scan the label on the underside of the hub again.');}
}
function resumeScannedActivation(){
 if(staff||!location.hash||busy)return;
 run(async()=>{if(await offerAppDownload())return;active='';activation=null;readActivationFragment();await continueSetup();});
}
window.addEventListener('hashchange',resumeScannedActivation);
(async()=>{
 if(staff){$('signup').hidden=true;$('login').hidden=false;if(await current()){show('factory');await run(inventory);}else show('auth');return;}
 if(location.pathname==='/welcome'){await run(continueSetup);return;}
 await run(async()=>{
  if(await offerAppDownload())return;
  readActivationFragment();
  active=new URLSearchParams(location.search).get('home')||'';
  if(active&&!/^[0-9a-f-]{36}$/.test(active))active='';
  if(manualEntry&&!active&&!$('identify').elements.label.value){show('scan');return;}
  await continueSetup();
 });
 $('scan-native').hidden=!nativeDiscovery;
})();
setInterval(()=>{if(active&&csrf&&!busy&&!document.hidden&&!$('progress').hidden)status().catch(showError);},5000);

const wizardSteps=['location-step','rooms-step','experience-step','review-step'];
function showStep(){wizardSteps.forEach((id,i)=>$(id).hidden=i!==wizardStep);$('back-step').hidden=wizardStep===0||mode()==='existing';$('next-step').hidden=wizardStep===3;[...$('wizard-progress').children].forEach((n,i)=>{n.classList.toggle('current',i===wizardStep);if(i===wizardStep)n.setAttribute('aria-current','step');else n.removeAttribute('aria-current');});}
function advance(){for(const input of $(wizardSteps[wizardStep]).querySelectorAll('input')){if(!input.checkValidity()){const d=input.closest('details');if(d)d.open=true;input.reportValidity();return;}}wizardStep=Math.min(3,wizardStep+1);showStep();$('setup').scrollIntoView({block:'start'});}
$('next-step').onclick=advance;$('back-step').onclick=()=>{wizardStep=Math.max(0,wizardStep-1);showStep();};

function showKit(kit){if(kitURL)URL.revokeObjectURL(kitURL);kitURL=URL.createObjectURL(new Blob([JSON.stringify(kit,null,2)],{type:'application/json'}));$('download-kit').href=kitURL;$('download-kit').download='SMARTi-klargjoring-'+kit.installation_id+'.json';$('factory-kit').hidden=false;}

$('generate-serial').onclick = async () => {
 if (!staff || busy) return;
 const input = $('factory-serial'), button = $('generate-serial'), form = $('new-hub');
 input.readOnly = true;
 button.textContent = 'Genererer…';
 form.dataset.generating = 'true';
 form.setAttribute('aria-busy', 'true');
 $('serial-status').textContent = '';
 try {
  await run(async () => {
   const result = await api('admin/hubs/serial', 'POST', undefined, 'Kunne ikke generere serienummer. Prøv igjen.');
   input.value = result.serial;
   $('serial-status').textContent = 'Serienummeret er klart. Velg «Registrer hub» når resten er fylt ut.';
  });
 } finally {
  input.readOnly = false;
  button.textContent = 'Generer';
  delete form.dataset.generating;
  form.removeAttribute('aria-busy');
  input.focus();
 }
};
$('factory-serial').addEventListener('input', () => { $('serial-status').textContent = ''; });

// The QR supplies the label; completing the separate PIN advances without another tap.
$('identify').elements.pin.addEventListener('input',()=>{
 const form=$('identify');
 if(!/^[0-9]{8}$/.test(form.elements.pin.value)||busy)return;
 try{parseLabel(form.elements.label.value);}catch{return;}
 form.requestSubmit();
});

function hubPhase(h){
 const phase=h.reset?.phase;
 if(phase==='erasing')return 'Tilbakestilling pågår';
 if(phase==='rebooting')return 'Tilbakestilt · huben starter på nytt';
 if(phase==='failed')return 'Tilbakestilling avbrutt · trenger oppfølging';
 if(phase==='awaiting_owner'){
  if(h.setup_status==='failed')return 'Nytt oppsett trenger oppfølging';
  if(['queued','working'].includes(h.setup_status))return 'Nytt oppsett pågår';
  return h.reset.qr_verified?'QR bekreftet · venter på nytt oppsett':h.reset.ownership==='release_owner'?'Frigjort · venter på ny eier og QR-skanning':'Tilbakestilt · venter på ny QR-skanning';
 }
 return ({preparing:'Under klargjøring',ready:'Klar for levering',activated:'Aktivert',resetting:'Tilbakestilling pågår',awaiting_owner:'Tilbakestilt · venter på ny QR-skanning',rebooting:'Huben starter på nytt'}[h.phase]||h.phase);
}

const homeCountries='AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ');

function localizeCountries(){
 const select=$('configure').elements.country,selected=select.value||'NO';
 const locale=window.smartiAuthLanguage.language;
 const names=new Intl.DisplayNames([locale],{type:'region'});
 select.replaceChildren(...homeCountries.map(code=>({code,name:names.of(code)}))
  .sort((a,b)=>a.name.localeCompare(b.name,locale)).map(c=>new Option(c.name,c.code)));
 select.value=selected;
}
function validationCopy(input){
 const v=input.validity;
 if(v.badInput)return ['Skriv inn et tall.','Enter a number.'];
 if(v.valueMissing)return input.type==='checkbox'
  ? ['Bekreft for å fortsette.','Confirm to continue.']
  : ['Fyll ut dette feltet.','Fill in this field.'];
 if(v.typeMismatch)return ['Skriv inn en gyldig e-postadresse.','Enter a valid email address.'];
 if(v.tooShort)return ['Skriv minst '+input.minLength+' tegn.','Enter at least '+input.minLength+' characters.'];
 if(v.tooLong)return ['Bruk maks '+input.maxLength+' tegn.','Use no more than '+input.maxLength+' characters.'];
 if(v.patternMismatch&&input.name==='pin')return ['Skriv inn den åttesifrede aktiveringskoden.','Enter the eight-digit activation code.'];
 if(v.rangeUnderflow)return ['Verdien må være minst '+input.min+'.','Enter a value of at least '+input.min+'.'];
 if(v.rangeOverflow)return ['Verdien kan være maks '+input.max+'.','Enter a value no greater than '+input.max+'.'];
 return ['Kontroller dette feltet.','Check this field.'];
}
function clearValidation(input){
 if(validationMessages.delete(input))input.setCustomValidity('');
}
if(!staff){
 document.addEventListener('invalid',event=>{
  const input=event.target;
  if(!(input instanceof HTMLInputElement)||input.validity.customError)return;
  const copy=validationCopy(input);
  validationMessages.set(input,copy);
  input.setCustomValidity(text(...copy));
 },true);
 document.addEventListener('input',event=>clearValidation(event.target),true);
 document.addEventListener('reset',event=>{
  for(const input of event.target.elements)clearValidation(input);
 },true);
 document.addEventListener('smarti-auth-language',()=>{
  for(const [id,copy]of liveCopy)$(id).textContent=text(...copy);
  for(const input of document.querySelectorAll('[data-setup-default]'))updateDefault(input);
  for(const [input,copy]of validationMessages){
   if(input.isConnected&&input.validity.customError)input.setCustomValidity(text(...copy));
   else validationMessages.delete(input);
  }
  renderRoomLabels($('rooms'));
  localizeCountries();
  if(latestSetupStatus)renderSetupStatus(latestSetupStatus);
 });
}
localizeCountries();

function updateHubStatus(node,h){
 const complete=(!h.reset||h.reset.phase==='completed')&&(h.setup_status==='completed'||(!h.setup_status&&h.phase==='activated'));
 node.classList.toggle('hub-onboarded',complete);node.replaceChildren();
 if(complete){const check=el('span');check.className='hub-complete-check';check.setAttribute('aria-hidden','true');node.append(check);}
 node.append(document.createTextNode(complete?'Oppsett fullført':hubPhase(h)));
 const connection=el('span',' · '+(h.online?'På nett':'Frakoblet'));connection.className='hub-connection-status';node.append(connection);
}
function hubStatusNode(h){const node=el('p');node.dataset.hubStatus=h.id;node.setAttribute('role','status');updateHubStatus(node,h);return node;}
let inventoryPolling=false;
setInterval(async()=>{if(!staff||!csrf||busy||inventoryPolling||document.hidden||$('factory').hidden)return;inventoryPolling=true;try{const hubs=await api('admin/hubs');for(const node of document.querySelectorAll('[data-hub-status]')){const h=hubs.find(h=>h.id===node.dataset.hubStatus);if(h)updateHubStatus(node,h);}}catch(e){$('message').textContent=e.message;}finally{inventoryPolling=false;}},10000);

if(staff){
 document.title='SMARTi · Hubadministrasjon';
 document.querySelector('#auth .eyebrow').textContent='SMARTi ADMINISTRASJON';
 document.querySelector('#auth h1').textContent='Logg inn som administrator.';
 document.querySelector('#auth > p:not([class]):not([id])').textContent='Bruk administratorkontoen din for å se og klargjøre huber.';
 document.querySelector('#auth .choices').hidden=true;
}
let fleetRefreshBusy=false;
setInterval(async()=>{
 if(!staff||!csrf||busy||fleetRefreshBusy||document.hidden||$('factory').hidden)return;
 fleetRefreshBusy=true;
 try{fleetHubs=await api('admin/hubs');await window.fleet.load(api,fleetHubs);window.fleet.mapItems(window.fleet.select(fleetHubs));for(const card of document.querySelectorAll('[data-hub]')){const h=fleetHubs.find(h=>h.id===card.dataset.hub);if(h){card.querySelector('.hub-traffic')?.replaceWith(window.fleet.metric(h));card.querySelector('.hub-versions')?.replaceWith(window.fleet.versions(h));}}}
 catch(e){$('message').textContent=e.message;}finally{fleetRefreshBusy=false;}
},60000);

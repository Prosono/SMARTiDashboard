let csrf = "";
const $ = id => document.getElementById(id);
const text = window.smartiAuthLanguage.text;
const errors = {
  401: ["Økten er utløpt. Logg inn på nytt.", "Your session expired. Sign in again."],
  403: ["Handlingen ble avvist. Logg inn på nytt.", "The request was denied. Sign in again."],
  409: ["Kontoen kunne ikke opprettes, eller hjemmet er allerede koblet til.", "The account could not be created or the home is already linked."],
  429: ["For mange forsøk. Vent 15 minutter før du prøver igjen.", "Too many attempts. Wait 15 minutes before trying again."],
  400: ["Koden er ugyldig eller utløpt. Hent en ny kode fra huben.", "The code is invalid or expired. Get a new code from the hub."],
  422: ["Kontroller feltene. Passord må ha minst 12 tegn.", "Check the fields. Passwords must contain at least 12 characters."],
};
const requestFailed = ["Kunne ikke fullføre. Prøv igjen.", "Could not complete the request. Try again."];
let authMessage = null;
function showMessage(copy = null) {
  authMessage = copy;
  $("message").textContent = copy ? text(...copy) : "";
}
document.addEventListener("smarti-auth-language", () => { if (authMessage) showMessage(authMessage); });
async function api(path, method="GET", body) {
  const r = await fetch("/api/"+path, {method, credentials:"same-origin", signal:AbortSignal.timeout(15000),
    headers:{"Content-Type":"application/json","X-CSRF-Token":csrf,"X-SMARTi-Language":window.smartiAuthLanguage.language},
    ...(body ? {body:JSON.stringify(body)} : {})});
  if(path==="session"&&r.ok)document.documentElement.dataset.portalSession="authenticated";if(r.status===401||(path==="logout"&&r.ok))delete document.documentElement.dataset.portalSession;
  if (!r.ok) {
    const copy = r.status === 401 && path === "login"
      ? ["Feil brukernavn eller passord for SMARTi-kontoen på home.smarti.dev. Bruk kontoen du koblet hjemmet til. Hjemmets egen innlogging brukes etter Åpne hjem.", "Incorrect username or password for your SMARTi account on home.smarti.dev. Use the account you linked to your home. You can sign in to the home itself after selecting Open home."]
      : errors[r.status] || requestFailed;
    throw Object.assign(new Error(text(...copy)), {status:r.status, copy});
  }
  return r.json();
}
async function run(fn) {
  document.querySelectorAll("button").forEach(b => b.disabled=true);
  showMessage(["Venter på bekreftelse…", "Waiting for confirmation…"]);
  try { await fn(); showMessage(); }
  catch(e) { showMessage(e.name==="TimeoutError" ? ["Svaret tok for lang tid. Kontroller resultatet før du prøver igjen.", "The request timed out. Check the result before trying again."] : e.copy || requestFailed); }
  finally { document.querySelectorAll("button").forEach(b => b.disabled=false); }
}
async function showHomes() {
  if ((await api("session")).portal_admin) { location.replace("/admin"); return; }
  const homes = await api("homes");
  $("admin-link").hidden=true;
  $("auth").hidden=true; $("account").hidden=false;
  $("home-count").textContent=homes.length + text(" hjem", homes.length === 1 ? " home" : " homes");
  // Background polling must not close menus or move keyboard focus every 15 seconds.
  const signature=JSON.stringify(homes);
  if ($("homes").dataset.signature===signature) return;
  $("homes").dataset.signature=signature;
  $("homes").replaceChildren();
  for (const home of homes) {
    const card=document.createElement("article"), title=document.createElement("h2"), detail=document.createElement("p");
    const available=!home.reset_phase && home.connected && home.remote_enabled && !home.verification_required;
    card.className="home-card "+(available?"is-online":"is-offline");
    title.textContent=home.name; detail.className="connection-state";
    detail.textContent=home.remote_enabled ? (home.connected ? text("Tilkoblet · klart til å åpnes", "Connected · ready to open") : text("Venter på tilkobling fra huben", "Waiting for the hub to connect")) : text("Fjerntilgang er slått av", "Remote access is off");
    if(home.verification_required)detail.textContent=text("Bekreft e-postadressen din for å åpne hjemmet.", "Verify your email address to open the home.");
    const visual=document.createElement("div");visual.className="home-visual";
    const photo=document.createElement("img");photo.src=home.photo_url||"/assets/portal-home.webp";photo.alt="";photo.loading="lazy";photo.width=1200;photo.height=800;
    const badge=document.createElement("span");badge.className="home-badge";badge.textContent=available?text("Tilkoblet", "Connected"):text("Venter på tilkobling", "Waiting for connection");
    if(!home.remote_enabled)badge.textContent=text("Fjerntilgang av", "Remote access off");
    if(home.verification_required)badge.textContent=text("Bekreft e-post", "Verify email");
    if(home.reset_phase)badge.textContent=text("Nytt oppsett", "Setup needed");
    const caption=document.createElement("div");caption.className="home-caption";caption.append(title,detail);
    const artwork=document.createElement("span");artwork.className="home-artwork-label";artwork.textContent=home.photo_url?"":text("Stemningsbilde", "Illustration");
    visual.append(photo,badge,caption,artwork);card.append(visual);
    if(home.reset_phase) detail.textContent=home.reset_phase==='awaiting_owner'?text("Huben er tilbakestilt · klar for nytt oppsett", "Hub reset · ready for setup"):home.reset_phase==='rebooting'?text("Huben starter på nytt · vent til den er tilbake på nett", "Hub restarting · wait for it to reconnect"):home.reset_phase==='failed'?text("Tilbakestillingen ble avbrutt · kontakt support før du starter HA", "Reset interrupted · contact support before starting Home Assistant"):text("Tilbakestilling pågår · ikke koble fra strømmen", "Reset in progress · keep the hub plugged in");
    if(home.reset_phase==='awaiting_owner') {
      const setup=document.createElement('a');setup.className='button primary';setup.href='/activate';setup.textContent=text("Skann QR-koden og sett opp på nytt →", "Scan the QR code to set up again →");card.append(setup);
    } else if (available && /^[0-9a-f-]{36}$/.test(home.installation_id)) {
      const open=document.createElement("a");open.className="button primary";
      open.href="https://"+home.installation_id+".home.smarti.dev/";
      open.textContent=text("Åpne hjem →", "Open home →");card.append(open);
      open.onclick=e=>{e.preventDefault();run(async()=>{location.assign((await api("customer/homes/"+home.installation_id+"/open","POST")).url);});};
    } else {
      const help=document.createElement("a");help.className="button";
      help.href=home.verification_required?"/account":"/support";
      help.textContent=home.verification_required?text("Bekreft e-post →", "Verify email →"):text("Få hjelp med tilkoblingen →", "Get help connecting →");card.append(help);
    }
    if(home.can_manage!==false || home.factory_managed || home.remote_enabled){
      const options=document.createElement("details");options.className="home-options";
      const summary=document.createElement("summary");summary.textContent=text("Innstillinger for hjemmet", "Home settings");options.append(summary);
      if (home.factory_managed) { const setup=document.createElement("a");setup.href="/activate?home="+encodeURIComponent(home.installation_id);setup.textContent=text("Åpne oppsett av hub", "Open hub setup");options.append(setup); }
      const actions=document.createElement("div");actions.className="home-quick-actions";
      if (home.remote_enabled && home.can_manage!==false) {
        const disable=document.createElement("button");disable.textContent=text("Slå av fjerntilgang", "Turn off remote access");disable.className="danger";
        disable.onclick=()=>{if(window.confirm(text("Vil du slå av fjerntilgang til dette hjemmet? Du og andre brukere vil ikke kunne åpne hjemmet utenfra. Lokal tilgang hjemme beholdes. Fjerntilgang må aktiveres igjen på huben.", "Turn off remote access to this home? You and other users will only be able to open it on the local network. To restore remote access, turn it on again on the hub.")))run(async()=>{
          await api("homes/"+encodeURIComponent(home.installation_id)+"/remote","DELETE");await showHomes();
        });};actions.append(disable);
      }
      if(home.can_manage!==false){
        if(!home.remote_enabled){const off=document.createElement('span');off.className='remote-off';off.textContent=text("Fjerntilgang er av", "Remote access is off");actions.append(off);}
        const invite=document.createElement('button');invite.type='button';invite.textContent=text("+ Legg til bruker", "+ Add member");invite.onclick=()=>window.inviteHomeMember(home,api,showMessage);actions.append(invite);

      }
      card.append(actions);
      const people=document.createElement("div");people.className="home-members";options.append(people);
      options.addEventListener("toggle",async()=>{if(!options.open||people.dataset.loaded)return;people.textContent=text("Henter brukere …", "Loading members…");try{const members=await api("customer/homes/"+home.installation_id+"/members");people.replaceChildren();const heading=document.createElement("h3");heading.textContent=text("Brukere i hjemmet", "Home members");people.append(heading);for(const member of members){const row=document.createElement("p");row.textContent=(member.full_name||member.username)+(member.role==="owner"?text(" · Eier", " · Owner"):"");people.append(row);}people.dataset.loaded="true";}catch{people.textContent=text("Kun eieren kan se og administrere brukere her.", "Only the owner can view and manage members here.");}});
      card.append(options);
      const more=document.createElement("button");more.type="button";more.className="home-more";more.textContent="•••";
      more.setAttribute('aria-label',text("Endre husbilde for ", "Change the home photo for ")+home.name);more.setAttribute('aria-haspopup','dialog');
      more.onclick=()=>openHomePhoto(home,more);
      if(home.can_manage!==false)visual.append(more);
    }

    $("homes").append(card);
  }
  const add=document.createElement('a');add.href='/activate';add.className='home-add-card';
  const outline=document.createElement('img');outline.src='/assets/home-illustration.svg';outline.alt='';outline.width=400;outline.height=220;
  const heading=document.createElement('h2');heading.textContent=homes.length?text("Legg til et nytt hjem", "Add a new home"):text("Legg til ditt første hjem", "Add your first home");
  const note=document.createElement('p');note.textContent=text("Koble til huben og skann QR-koden for å komme i gang.", "Connect your hub and scan its QR code to get started.");
  const plus=document.createElement('span');plus.className='home-add-plus';plus.textContent='+';plus.setAttribute('aria-hidden','true');
  add.append(outline,plus,heading,note);$('homes').append(add);
}
function openHomePhoto(home,trigger){
 const dialog=document.createElement('dialog');dialog.className='portal-dialog home-photo-dialog';dialog.setAttribute('aria-labelledby','home-photo-title');
 const title=document.createElement('h2');title.id='home-photo-title';title.textContent=text("Bilde av hjemmet", "Home photo");
 const name=document.createElement('p');name.textContent=home.name;
 const preview=document.createElement('img');preview.className='home-photo-preview';preview.src=home.photo_url||'/assets/portal-home.webp';preview.alt=text("Nåværende bilde av ", "Current photo of ")+home.name;
 const hint=document.createElement('p');hint.className='home-photo-hint';hint.textContent=text("Velg et bilde fra telefonen eller datamaskinen. Bildet lagres for dette hjemmet.", "Choose a photo from your phone or computer. It will be saved for this home.");
 const status=document.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const input=document.createElement('input');input.type='file';input.accept='image/jpeg,image/png,image/webp,image/heic,image/heif';input.hidden=true;
 const choose=document.createElement('button');choose.type='button';choose.className='primary';choose.textContent=home.photo_url?text("Bytt bilde", "Change photo"):text("Last opp bilde", "Upload photo");choose.onclick=()=>input.click();
 const remove=document.createElement('button');remove.type='button';remove.textContent=text("Bruk standardbilde", "Use default photo");remove.hidden=!home.photo_url;
 const close=document.createElement('button');close.type='button';close.textContent=text("Lukk", "Close");close.onclick=()=>dialog.close();
 let saving=false;
 async function save(file){
  saving=true;[choose,remove,close].forEach(b=>b.disabled=true);status.textContent=text("Lagrer bildet …", "Saving the photo…");
  try{const photo=file?await prepareHomePhoto(file):'';await api('customer/homes/'+home.installation_id+'/photo','PUT',{photo});await showHomes();dialog.close();}
  catch(e){status.textContent=e.copy?text(...e.copy):e.message;}
  finally{saving=false;[choose,remove,close].forEach(b=>b.disabled=false);input.value='';}
 }
 input.onchange=()=>{if(input.files[0])save(input.files[0]);};remove.onclick=()=>save(null);
 dialog.addEventListener('cancel',e=>{if(saving)e.preventDefault();});
 dialog.addEventListener('close',()=>{dialog.remove();const target=trigger.isConnected?trigger:[...document.querySelectorAll('.home-more')].find(b=>b.getAttribute('aria-label')===text("Endre husbilde for ", "Change the home photo for ")+home.name);target?.focus();},{once:true});
 const actions=document.createElement('div');actions.className='home-photo-actions';actions.append(choose,remove,close);
 dialog.append(title,name,preview,hint,input,status,actions);document.body.append(dialog);dialog.showModal();choose.focus();
}
async function prepareHomePhoto(file){
 if(file.size>20000000)throw Error(text("Velg et bilde under 20 MB.", "Choose a photo smaller than 20 MB."));
 const url=URL.createObjectURL(file);
 try{
  const img=new Image();img.src=url;await img.decode();
  const scale=Math.min(1,1200/Math.max(img.naturalWidth,img.naturalHeight));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
  for(const quality of [.85,.7,.55,.4]){const data=canvas.toDataURL('image/jpeg',quality);if(data.length<660000)return data;}
 }catch{throw Error(text("Bildet kunne ikke leses. Prøv et JPEG-, PNG- eller WebP-bilde.", "Could not read the photo. Try a JPEG, PNG, or WebP image."));}
 finally{URL.revokeObjectURL(url);}
 throw Error(text("Bildet er for stort. Velg et enklere eller mindre bilde.", "The photo is too large. Choose a smaller photo."));
}
async function login() {
  const body=Object.fromEntries(new FormData($("login")));
  document.activeElement?.blur();
  csrf=(await api("login","POST",body)).csrf; await showHomes();
  window.scrollTo({top:0,left:0,behavior:"instant"});
}
$("login").onsubmit=e=>{e.preventDefault();run(login);};
$("logout").onclick=()=>run(async()=>{await api("logout","POST");window.webkit?.messageHandlers?.smartiSession?.postMessage("logout");csrf="";$("account").hidden=true;$("auth").hidden=false;$("login").reset();});
async function restoreSession(){
  $("session-loading").hidden=false;$("session-retry").hidden=true;showMessage();
  try{csrf=(await api("session")).csrf;await showHomes();}
  catch(e){
    if(e.status===401){csrf="";$("account").hidden=true;$("auth").hidden=false;}
    else{showMessage(["Kunne ikke hente hjemmene dine. Prøv igjen om et øyeblikk.", "Could not load your homes. Try again in a moment."]);$("session-retry").hidden=false;}
  }finally{$("session-loading").hidden=true;}
}
$("session-retry").onclick=restoreSession;
restoreSession();

setInterval(()=>{if(csrf && !document.hidden) showHomes().catch(()=>{});},15000);

$("login").addEventListener("input", () => showMessage());

for(const id of ["login-tab","setup-tab"]){
  const tab=$(id);
  function select(){for(const name of ["login","setup"]){const active=id===name+"-tab";$(name+"-tab").setAttribute("aria-selected",String(active));$(name+"-tab").tabIndex=active?0:-1;$(name+"-panel").hidden=!active;}}
  tab.onclick=select;
  tab.onkeydown=e=>{if(["ArrowLeft","ArrowRight","Home","End"].includes(e.key)){e.preventDefault();const next=$(id==="login-tab"?"setup-tab":"login-tab");next.click();next.focus();}};
}

let csrf = "";
const $ = id => document.getElementById(id);
const errors = {401:"Økten er utløpt. Logg inn på nytt.",403:"Handlingen ble avvist. Logg inn på nytt.",409:"Kontoen kunne ikke opprettes, eller hjemmet er allerede koblet til.",429:"For mange forsøk. Vent 15 minutter før du prøver igjen.",400:"Koden er ugyldig eller utløpt. Hent en ny kode fra huben.",422:"Kontroller feltene. Passord må ha minst 12 tegn."};
async function api(path, method="GET", body) {
  const r = await fetch("/api/"+path, {method, credentials:"same-origin", signal:AbortSignal.timeout(15000),
    headers:{"Content-Type":"application/json","X-CSRF-Token":csrf},
    ...(body ? {body:JSON.stringify(body)} : {})});
  if(path==="session"&&r.ok)document.documentElement.dataset.portalSession="authenticated";if(r.status===401||(path==="logout"&&r.ok))delete document.documentElement.dataset.portalSession;if (!r.ok) throw Object.assign(new Error(r.status === 401 && path === "login"
    ? "Feil brukernavn eller passord for SMARTi-kontoen på home.smarti.dev. Bruk kontoen du koblet hjemmet til; hjemmets egen innlogging brukes etter Åpne hjem."
    : errors[r.status] || "Kunne ikke fullføre. Prøv igjen."), {status:r.status});
  return r.json();
}
async function run(fn) {
  document.querySelectorAll("button").forEach(b => b.disabled=true);
  $("message").textContent="Venter på bekreftelse…";
  try { await fn(); $("message").textContent=""; }
  catch(e) { $("message").textContent=e.name==="TimeoutError" ? "Svaret tok for lang tid. Kontroller resultatet før du prøver igjen." : e.message; }
  finally { document.querySelectorAll("button").forEach(b => b.disabled=false); }
}
async function showHomes() {
  if ((await api("session")).portal_admin) { location.replace("/admin"); return; }
  const homes = await api("homes");
  $("admin-link").hidden=true;
  $("auth").hidden=true; $("account").hidden=false;
  $("home-count").textContent=homes.length+" hjem";
  // Background polling must not close menus or move keyboard focus every 15 seconds.
  const signature=JSON.stringify(homes);
  if ($("homes").dataset.signature===signature) return;
  $("homes").dataset.signature=signature;
  $("homes").replaceChildren();
  if (!homes.length) {
    const empty=document.createElement("div");empty.className="empty-homes";
    const title=document.createElement("h3");title.textContent="Ditt første hjem starter her.";
    const text=document.createElement("p");text.textContent="Koble til SMARTi-huben, så finner du hjemmet ditt her neste gang.";
    const link=document.createElement("a");link.href="/activate";link.className="button primary";link.textContent="Legg til et hjem →";
    empty.append(title,text,link);$("homes").append(empty);
  }
  for (const home of homes) {
    const card=document.createElement("article"), title=document.createElement("h2"), detail=document.createElement("p");
    const available=!home.reset_phase && home.connected && home.remote_enabled && !home.verification_required;
    card.className="home-card "+(available?"is-online":"is-offline");
    title.textContent=home.name; detail.className="connection-state";
    detail.textContent=home.remote_enabled ? (home.connected ? "Tilkoblet · klart til å åpnes" : "Venter på tilkobling fra huben") : "Fjerntilgang er slått av";
    if(home.verification_required)detail.textContent="Bekreft e-postadressen din for å åpne hjemmet.";
    card.append(title,detail);
    if(home.reset_phase) detail.textContent=home.reset_phase==='awaiting_owner'?'Huben er tilbakestilt · klar for nytt oppsett':home.reset_phase==='rebooting'?'Huben starter på nytt · vent til den er tilbake på nett':home.reset_phase==='failed'?'Tilbakestillingen ble avbrutt · kontakt support før du starter HA':'Tilbakestilling pågår · ikke koble fra strømmen';
    if(home.reset_phase==='awaiting_owner') {
      const setup=document.createElement('a');setup.className='button primary';setup.href='/activate';setup.textContent='Skann QR-koden og sett opp på nytt →';card.append(setup);
    } else if (available && /^[0-9a-f-]{36}$/.test(home.installation_id)) {
      const open=document.createElement("a");open.className="button primary";
      open.href="https://"+home.installation_id+".home.smarti.dev/";
      open.textContent="Åpne hjem →";card.append(open);
      open.onclick=e=>{e.preventDefault();run(async()=>{location.assign((await api("customer/homes/"+home.installation_id+"/open","POST")).url);});};
    } else {
      const help=document.createElement("a");help.className="button";
      help.href=home.verification_required?"/account":"/support";
      help.textContent=home.verification_required?"Bekreft e-post →":"Få hjelp med tilkoblingen →";card.append(help);
    }
    if(home.factory_managed || home.remote_enabled){
      const options=document.createElement("details");options.className="home-options";
      const summary=document.createElement("summary");summary.textContent="Innstillinger for hjemmet";options.append(summary);
      if (home.factory_managed) { const setup=document.createElement("a");setup.href="/activate?home="+encodeURIComponent(home.installation_id);setup.textContent="Åpne oppsett av hub";options.append(setup); }
      if (home.remote_enabled) {
        const disable=document.createElement("button");disable.textContent="Slå av fjerntilgang";disable.className="danger";
        disable.onclick=()=>{if(window.confirm("Vil du slå av fjerntilgang til dette hjemmet? Du og andre brukere vil ikke kunne åpne hjemmet utenfra. Lokal tilgang hjemme beholdes. Fjerntilgang må aktiveres igjen på huben."))run(async()=>{
          await api("homes/"+encodeURIComponent(home.installation_id)+"/remote","DELETE");await showHomes();
        });};options.append(disable);
      }
      const people=document.createElement("div");people.className="home-members";options.append(people);
      options.addEventListener("toggle",async()=>{if(!options.open||people.dataset.loaded)return;people.textContent="Henter brukere …";try{const members=await api("customer/homes/"+home.installation_id+"/members");people.replaceChildren();const heading=document.createElement("h3");heading.textContent="Brukere i hjemmet";people.append(heading);for(const member of members){const row=document.createElement("p");row.textContent=(member.full_name||member.username)+(member.role==="owner"?" · Eier":"");people.append(row);}const invite=document.createElement("button");invite.type="button";invite.textContent="+ Legg til ny bruker";invite.onclick=()=>window.inviteHomeMember(home,api,text=>{$("message").textContent=text;$("message").scrollIntoView({block:"center"});});people.append(invite);people.dataset.loaded="true";}catch{people.textContent="Kun eieren kan se og administrere brukere her.";}});
      card.append(options);
    }
    const add=document.createElement("a");add.href="/activate";add.className="mobile-add-home button";add.textContent="+ Legg til et nytt hjem";card.append(add);
    $("homes").append(card);
  }
}
async function login() {
  const body=Object.fromEntries(new FormData($("login")));
  document.activeElement?.blur();
  csrf=(await api("login","POST",body)).csrf; await showHomes();
  window.scrollTo({top:0,left:0,behavior:"instant"});
}
$("login").onsubmit=e=>{e.preventDefault();run(login);};
$("claim").onsubmit=e=>{e.preventDefault();run(async()=>{
  await api("homes/claim","POST",Object.fromEntries(new FormData($("claim"))));
  $("claim").reset(); await showHomes();
});};
$("logout").onclick=()=>run(async()=>{await api("logout","POST");window.webkit?.messageHandlers?.smartiSession?.postMessage("logout");csrf="";$("account").hidden=true;$("auth").hidden=false;$("login").reset();});
async function restoreSession(){
  $("session-loading").hidden=false;$("session-retry").hidden=true;$("message").textContent="";
  try{csrf=(await api("session")).csrf;await showHomes();}
  catch(e){
    if(e.status===401){csrf="";$("account").hidden=true;$("auth").hidden=false;}
    else{$("message").textContent="Kunne ikke hente hjemmene dine. Prøv igjen om et øyeblikk.";$("session-retry").hidden=false;}
  }finally{$("session-loading").hidden=true;}
}
$("session-retry").onclick=restoreSession;
restoreSession();

setInterval(()=>{if(csrf && !document.hidden) showHomes().catch(()=>{});},15000);

$("login").addEventListener("input", () => { $("message").textContent = ""; });

for(const id of ["login-tab","setup-tab"]){
  const tab=$(id);
  function select(){for(const name of ["login","setup"]){const active=id===name+"-tab";$(name+"-tab").setAttribute("aria-selected",String(active));$(name+"-tab").tabIndex=active?0:-1;$(name+"-panel").hidden=!active;}}
  tab.onclick=select;
  tab.onkeydown=e=>{if(["ArrowLeft","ArrowRight","Home","End"].includes(e.key)){e.preventDefault();const next=$(id==="login-tab"?"setup-tab":"login-tab");next.click();next.focus();}};
}

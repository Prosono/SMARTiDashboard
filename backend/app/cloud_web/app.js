let csrf = "";
const $ = id => document.getElementById(id);
const errors = {401:"Økten er utløpt. Logg inn på nytt.",403:"Handlingen ble avvist. Logg inn på nytt.",409:"Kontoen kunne ikke opprettes, eller hjemmet er allerede koblet til.",429:"For mange forsøk. Vent 15 minutter før du prøver igjen.",400:"Koden er ugyldig eller utløpt. Hent en ny kode fra huben.",422:"Kontroller feltene. Passord må ha minst 12 tegn."};
async function api(path, method="GET", body) {
  const r = await fetch("/api/"+path, {method, credentials:"same-origin", signal:AbortSignal.timeout(15000),
    headers:{"Content-Type":"application/json","X-CSRF-Token":csrf},
    ...(body ? {body:JSON.stringify(body)} : {})});
  if (!r.ok) throw Object.assign(new Error(r.status === 401 && path === "login"
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
    const available=home.connected && home.remote_enabled && !home.verification_required;
    card.className="home-card "+(available?"is-online":"is-offline");
    title.textContent=home.name; detail.className="connection-state";
    detail.textContent=home.remote_enabled ? (home.connected ? "Tilkoblet · klart til å åpnes" : "Venter på tilkobling fra huben") : "Fjerntilgang er slått av";
    if(home.verification_required)detail.textContent="Bekreft e-postadressen din for å åpne hjemmet.";
    card.append(title,detail);
    if (available && /^[0-9a-f-]{36}$/.test(home.installation_id)) {
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
        const disable=document.createElement("button");disable.textContent="Slå av fjerntilgang";
        disable.onclick=()=>{if(window.confirm("Slå av fjerntilgang til dette hjemmet? Lokal tilgang beholdes."))run(async()=>{
          await api("homes/"+encodeURIComponent(home.installation_id)+"/remote","DELETE");await showHomes();
        });};options.append(disable);
      }
      card.append(options);
    }
    $("homes").append(card);
  }
}
async function login() {
  const body=Object.fromEntries(new FormData($("login")));
  csrf=(await api("login","POST",body)).csrf; await showHomes();
}
$("login").onsubmit=e=>{e.preventDefault();run(login);};
$("claim").onsubmit=e=>{e.preventDefault();run(async()=>{
  await api("homes/claim","POST",Object.fromEntries(new FormData($("claim"))));
  $("claim").reset(); await showHomes();
});};
$("logout").onclick=()=>run(async()=>{await api("logout","POST");csrf="";$("account").hidden=true;$("auth").hidden=false;$("login").reset();});
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

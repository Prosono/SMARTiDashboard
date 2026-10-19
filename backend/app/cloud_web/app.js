let csrf = "";
const $ = id => document.getElementById(id);
const errors = {401:"Økten er utløpt. Logg inn på nytt.",403:"Handlingen ble avvist. Logg inn på nytt.",409:"Kontoen kunne ikke opprettes, eller hjemmet er allerede koblet til.",429:"For mange forsøk. Vent 15 minutter før du prøver igjen.",400:"Koden er ugyldig eller utløpt. Hent en ny kode fra huben.",422:"Kontroller feltene. Passord må ha minst 12 tegn."};
async function api(path, method="GET", body) {
  const r = await fetch("/api/"+path, {method, credentials:"same-origin", signal:AbortSignal.timeout(15000),
    headers:{"Content-Type":"application/json","X-CSRF-Token":csrf},
    ...(body ? {body:JSON.stringify(body)} : {})});
  if (!r.ok) throw new Error(r.status === 401 && path === "login"
    ? "Feil brukernavn eller passord for SMARTi-kontoen på home.smarti.dev. Bruk kontoen du koblet hjemmet til; hjemmets egen innlogging brukes etter Åpne hjem."
    : errors[r.status] || "Kunne ikke fullføre. Prøv igjen.");
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
  const homes = await api("homes");
  $("admin-link").hidden=!(await api("session")).portal_admin;
  $("auth").hidden=true; $("account").hidden=false;
  $("homes").replaceChildren();
  if (!homes.length) $("homes").textContent="Du har ikke koblet til et hjem ennå.";
  for (const home of homes) {
    const card=document.createElement("article"), title=document.createElement("h2"), detail=document.createElement("p");
    title.textContent=home.name; detail.textContent=home.remote_enabled ? (home.connected ? "Hjemmet er tilkoblet" : "Venter på tilkobling fra huben") : "Fjerntilgang er slått av";
    card.append(title,detail);
    if (home.connected && home.remote_enabled && /^[0-9a-f-]{36}$/.test(home.installation_id)) {
      const open=document.createElement("a");
      open.href="https://"+home.installation_id+".home.smarti.dev/";
      open.textContent="Åpne hjem";card.append(open);
      const note=document.createElement("p");note.textContent="Logg inn med brukeren din i dette hjemmet.";card.append(note);
    }
    if (home.remote_enabled) {
      const disable=document.createElement("button");disable.textContent="Slå av fjerntilgang";
      disable.onclick=()=>{if(window.confirm("Slå av fjerntilgang til dette hjemmet? Lokal tilgang beholdes."))run(async()=>{
        await api("homes/"+encodeURIComponent(home.installation_id)+"/remote","DELETE");await showHomes();
      });};card.append(disable);
    }
    $("homes").append(card);
  }
}
async function login() {
  const body=Object.fromEntries(new FormData($("login")));
  csrf=(await api("login","POST",body)).csrf; await showHomes();
}
$("login").onsubmit=e=>{e.preventDefault();run(login);};
$("register").onclick=()=>run(async()=>{
  if (!$("login").reportValidity()) return;
  if ($("login").elements.password.value.length < 12)
    throw new Error("Nye kontoer må ha et passord med minst 12 tegn.");
  await api("register","POST",Object.fromEntries(new FormData($("login")))); await login();
});
$("claim").onsubmit=e=>{e.preventDefault();run(async()=>{
  await api("homes/claim","POST",Object.fromEntries(new FormData($("claim"))));
  $("claim").reset(); await showHomes();
});};
$("logout").onclick=()=>run(async()=>{await api("logout","POST");csrf="";$("account").hidden=true;$("auth").hidden=false;$("login").reset();});
(async()=>{try{csrf=(await api("session")).csrf;await showHomes();}catch{}})();

setInterval(()=>{if(csrf && !document.hidden) showHomes().catch(()=>{});},15000);

$("login").addEventListener("input", () => { $("message").textContent = ""; });

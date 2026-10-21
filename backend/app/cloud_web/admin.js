const $=id=>document.getElementById(id);
let csrf="",offset=0,query="",selected=null,view="customers",total=0;
const labels={online:"Tilkoblet",offline:"Frakoblet",disabled:"Fjernaksess avslått",unknown:"Ukjent"};
const date=t=>new Date(t*1000).toLocaleString("nb-NO");
function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
function status(h){return el("span",labels[h.status],"status "+h.status);}
async function api(path,method="GET",body){
 const r=await fetch("/api/"+path,{method,credentials:"same-origin",signal:AbortSignal.timeout(10000),headers:{"Content-Type":"application/json","X-CSRF-Token":csrf},...(body?{body:JSON.stringify(body)}:{})});
 if(path==="session"&&r.ok)document.documentElement.dataset.portalSession="authenticated";if(r.status===401||(path==="logout"&&r.ok))delete document.documentElement.dataset.portalSession;if(r.status===401){$("workspace").hidden=true;$("auth").hidden=false;$("logout").hidden=true;throw Error("Logg inn for å fortsette.");}
 if(r.status===403)throw Error("Denne kontoen har ikke portaladministratortilgang, eller økten må fornyes.");
 if(!r.ok)throw Error("Handlingen kunne ikke fullføres. Prøv igjen.");
 return r.json();
}
async function run(fn){$("message").textContent="";const buttons=[...document.querySelectorAll("button")];const old=buttons.map(b=>b.disabled);buttons.forEach(b=>b.disabled=true);try{await fn();}catch(e){$("message").textContent=e.name==="TimeoutError"?"Forespørselen tok for lang tid. Prøv å oppdatere status.":e.message;}finally{buttons.forEach((b,i)=>b.disabled=old[i]);$("previous").disabled=offset===0;$("next").disabled=offset+50>=total;}}
function home(h){const n=el("div",undefined,"home");n.append(el("h4",h.name),status(h),el("p",h.id));if(h.status==="offline")n.append(el("p","Be kunden kontrollere strøm, internett og Fjernaksess i SMARTi. Frakoblet fjernforbindelse betyr ikke nødvendigvis at lokal styring er nede."));if(h.owner){const change=el("button","Endre hubinnlogging");change.onclick=()=>credentialDialog(h);n.append(change);}return n;}
function credentialDialog(h){
 const dialog=el('dialog'),form=el('form'),message=el('p');message.setAttribute('role','status');
 form.append(el('h2','Administrator på '+h.name),el('p','Endrer bare SMARTi-innloggingen på denne huben. Portalpassordet og andre hjem påvirkes ikke. Eksisterende lokale økter avsluttes.'));
 for(const [name,label,type] of [['username','Brukernavn','text'],['password','Nytt passord','password'],['password_repeat','Gjenta nytt passord','password']]){const l=el('label',label),i=el('input');i.name=name;i.type=type;i.required=true;i.maxLength=name==='username'?64:128;if(type==='password'){i.minLength=12;i.autocomplete='new-password';}l.append(i);form.append(l);}
 form.append(el('p','Minst 12 tegn, med bokstaver og tall. Endringen må mottas av huben innen én time.'));
 const cancel=el('button','Avbryt'),save=el('button','Endre innlogging');cancel.type='button';cancel.onclick=()=>dialog.close();save.type='submit';save.className='primary';form.append(message,cancel,save);dialog.append(form);document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove());dialog.showModal();
 form.onsubmit=async e=>{e.preventDefault();save.disabled=true;try{await api('admin/homes/'+encodeURIComponent(h.id)+'/credentials','POST',Object.fromEntries(new FormData(form)));form.reset();message.textContent='Endringen venter på huben. Oppdater status for å bekrefte at den er utført.';save.hidden=true;const check=el('button','Oppdater status');check.type='button';check.onclick=async()=>{try{const r=await api('admin/homes/'+encodeURIComponent(h.id)+'/credentials');message.textContent=({applied:'Innloggingen på huben er endret.',failed:'Huben kunne ikke endre innloggingen. Kontroller bruker og oppsett.',pending:'Venter på huben.',expired:'Huben mottok ikke endringen innen én time. Send inn på nytt.'})[r.status]||'Ingen endring registrert.';}catch(e){message.textContent=e.message;}};form.append(check);}catch(e){message.textContent=e.message;}finally{save.disabled=false;}};
}
async function overview(){
 const d=await api("admin/overview?q="+encodeURIComponent(query)+"&offset="+offset);
 $("auth").hidden=true;$("workspace").hidden=false;$("logout").hidden=false;
 $("checked").textContent="Status kontrollert "+date(d.checked_at);
 $("relay-warning").hidden=d.relay_available;
 $("summary").replaceChildren();
 for(const [key,title] of [["customers","Kunder med hjem"],["accounts","Registrerte kontoer"],["homes","Huber"],["online","Tilkoblet nå"],["offline","Frakoblede kundehjem"],["unclaimed","Ikke koblet til konto"]]){
 const n=el("div");n.append(el("strong",!d.relay_available&&["online","offline"].includes(key)?"—":d.summary[key]),el("span",title));$("summary").append(n);}
 $("rows").replaceChildren();
 for(const a of d.customers){
 const row=el("tr"),name=el("td",a.username),homes=el("td",a.homes.map(h=>h.name).join(", ")||"Ingen hjem ennå"),state=el("td"),action=el("td"),button=el("button","Se kunde →");
 if(!a.homes.length)state.textContent="Ikke koblet til";a.homes.forEach(h=>state.append(status(h)));
 button.onclick=()=>run(()=>detail(a.id));action.append(button);row.append(name,homes,state,action);$("rows").append(row);}
 if(!d.customers.length){const row=el("tr"),cell=el("td","Ingen kontoer funnet.");cell.colSpan=4;row.append(cell);$("rows").append(row);}
 total=d.total;
 $("page").textContent=d.total?Math.min(offset+1,d.total)+"–"+Math.min(offset+50,d.total)+" av "+d.total:"0 kontoer";
 $("previous").disabled=offset===0;$("next").disabled=offset+50>=d.total;
 $("unclaimed-title").textContent=d.summary.unclaimed+" huber uten konto";
 $("unclaimed").replaceChildren(...d.unclaimed.map(home));
}
async function detail(id){const d=await api("admin/accounts/"+encodeURIComponent(id));selected=id;$("detail").hidden=false;$("customer-name").textContent=d.username;$("customer-id").textContent=d.profile?[d.profile.full_name,d.profile.email,d.profile.phone,d.profile.address,d.profile.postal_code+" "+d.profile.city,d.profile.country,d.profile.verified?"E-post bekreftet":"E-post ikke bekreftet"].join(" · "):d.id;$("customer-homes").replaceChildren(...d.homes.map(home));if(!d.homes.length)$("customer-homes").textContent="Kontoen har ikke koblet til et hjem ennå.";
 $("notes").replaceChildren(...d.notes.map(n=>{const a=el("article",undefined,"support-note");a.append(el("small",n.author+" · "+date(n.created)),el("p",n.text));return a;}));
 if(!d.notes.length)$("notes").textContent="Ingen supportnotater ennå.";
 $("detail").scrollIntoView({behavior:"auto",block:"start"});
}
async function audit(){const rows=await api("admin/audit");const names={overview:"Åpnet kundeoversikten",view_customer:"Åpnet kunde",add_note:"La til supportnotat"};$("audit-rows").replaceChildren(...rows.map(r=>{const n=el("div",undefined,"audit-row");n.append(el("span",r.actor+" · "+(names[r.action]||r.action)+(r.target?" · "+r.target:"")),el("small",date(r.created)));return n;}));}
function tab(v){view=v;$("customers").hidden=v!=="customers";$("audit").hidden=v!=="audit";$("search").hidden=v!=="customers";$("detail").hidden=true;$("customers-tab").setAttribute("aria-pressed",String(v==="customers"));$("audit-tab").setAttribute("aria-pressed",String(v==="audit"));}
$("login").onsubmit=e=>{e.preventDefault();run(async()=>{csrf=(await api("login","POST",Object.fromEntries(new FormData($("login"))))).csrf;$("login").elements.password.value="";await overview();});};
$("logout").onclick=()=>run(async()=>{await api("logout","POST");window.webkit?.messageHandlers?.smartiSession?.postMessage("logout");location.href="/admin";});
$("refresh").onclick=()=>run(async()=>{await overview();if(view==="audit")await audit();else if(selected&&!$("detail").hidden)await detail(selected);});
$("search").onsubmit=e=>{e.preventDefault();query=$("query").value.trim();offset=0;run(overview);};
$("previous").onclick=()=>{offset=Math.max(0,offset-50);run(overview);};
$("next").onclick=()=>{offset+=50;run(overview);};
$("customers-tab").onclick=()=>{tab("customers");};
$("audit-tab").onclick=()=>run(async()=>{await audit();tab("audit");});
$("close-detail").onclick=()=>{$("detail").hidden=true;selected=null;$("customers-tab").focus();};
$("note-form").onsubmit=e=>{e.preventDefault();if(selected)run(async()=>{await api("admin/accounts/"+encodeURIComponent(selected)+"/notes","POST",{text:$("note").value});$("note").value="";await detail(selected);});};
(async()=>{try{csrf=(await api("session")).csrf;await overview();}catch(e){if(csrf)$("message").textContent=e.message;}})();

async function supportCount(){try{const cases=await api("admin/support/cases");const count=cases.filter(c=>c.unread||c.status==="new").length;$("support-count").textContent=count?"("+count+")":"";}catch{}}
supportCount();setInterval(()=>{if(!document.hidden&&csrf)supportCount();},60000);

if(location.pathname==='/admin/users'){document.title='SMARTi · Brukere';document.querySelector('#workspace h1').textContent='Brukere og hjem.';document.querySelector('#workspace .eyebrow').textContent='KONTOER OG KUNDEOPPFØLGING';}

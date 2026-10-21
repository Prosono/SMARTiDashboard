// Fleet presentation: byte totals are supplied by the relay, never synthesized.
window.fleet = (() => {
 let hubs=[], report=null, filter='all', query='', order='newest';
 let map=null,markers=null,mapItems=[],mapLoading=null,firstMap=true;
 const $=id=>document.getElementById(id);
 const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const bytes=value=>{if(value==null)return '—';const units=['B','kB','MB','GB','TB'];let i=0;while(value>=1000&&i<4){value/=1000;i++;}return new Intl.NumberFormat('nb-NO',{maximumFractionDigits:1}).format(value)+' '+units[i];};
 const total=r=>(r.to_hub||0)+(r.from_hub||0);
 const category=h=>['preparing','ready'].includes(h.phase)?'ready':h.online?'active':'inactive';
 function chart(rows,compact=false){
  const wrap=node('div',undefined,compact?'traffic-bars mini':'traffic-bars');
  const max=Math.max(1,...rows.map(total));
  for(const r of rows){const bar=node('div',undefined,'traffic-day');bar.style.setProperty('--bar',Math.max(0,total(r)/max*100)+'%');const label=r.day+': '+bytes(total(r))+' · til hub '+bytes(r.to_hub)+' · fra hub '+bytes(r.from_hub);bar.title=label;bar.setAttribute('aria-label',label);const fill=node('span');bar.append(fill);wrap.append(bar);}
  wrap.setAttribute('role','img');wrap.setAttribute('aria-label','Daglig fjerntrafikk. '+rows.map(r=>r.day+': '+bytes(total(r))).join(', '));return wrap;
 }

 function validLocation(h){return h.location&&Number.isFinite(h.location.latitude)&&Number.isFinite(h.location.longitude);}
 async function openMap(){
  if(!window.L){
   if(!mapLoading)mapLoading=new Promise((resolve,reject)=>{const css=node('link');css.rel='stylesheet';css.href='/assets/leaflet/leaflet.css';document.head.append(css);const script=node('script');script.src='/assets/leaflet/leaflet.js';script.onload=resolve;script.onerror=()=>{mapLoading=null;script.remove();reject(Error('Kartet kunne ikke lastes. Prøv igjen.'));};document.head.append(script);});
   await mapLoading;
  }
  if(!map){map=L.map('fleet-map',{scrollWheelZoom:false}).setView([64,12],4);markers=L.featureGroup().addTo(map);
   L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,referrerPolicy:'origin',attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).on('tileerror',()=>{$('map-message').textContent='Kartbakgrunnen er utilgjengelig. Hublisten fungerer fortsatt.';}).addTo(map);
  }
  map.invalidateSize();drawMap();if(firstMap){fitMap();firstMap=false;}
 }
 function fitMap(){if(map&&markers.getLayers().length)map.fitBounds(markers.getBounds(),{padding:[40,40],maxZoom:12});}
 function drawMap(){
  const located=mapItems.filter(validLocation);$('map-coverage').textContent=located.length+' av '+mapItems.length+' huber i utvalget har registrert plassering.';
  if(!map||$('fleet-map-panel').hidden)return;
  markers.clearLayers();$('map-message').textContent=located.length?'':'Ingen huber i utvalget har plassering ennå. Plassering blir tilgjengelig etter fullført oppsett.';
  for(const h of located){const popup=node('div');popup.append(node('strong',h.serial),node('p',h.location.name||h.model),node('p',h.online?'På nett':'Frakoblet'));const action=node('button','Vis hub i listen');action.type='button';action.onclick=()=>{const row=[...document.querySelectorAll('[data-hub]')].find(n=>n.dataset.hub===h.id);if(row){row.tabIndex=-1;row.focus({preventScroll:true});row.scrollIntoView({block:'center',behavior:'auto'});}};popup.append(action);
   L.circleMarker([h.location.latitude,h.location.longitude],{radius:9,weight:3,color:'#fff',fillColor:category(h)==='ready'?'#ff7900':h.online?'#119b66':'#686868',fillOpacity:1}).bindPopup(popup).addTo(markers);
  }
 }
 function updateSummary(){
  const days=Number($('traffic-period').value), list=report?.daily||[], sum=list.reduce((s,r)=>s+total(r),0), measured=report?.available;
  const metrics=[['Totalt antall huber',hubs.length,'Registrert i SMARTi','hub'],['Aktive huber',hubs.filter(h=>h.online).length,'Livstegn siste 100 sekunder','online'],['Gjennomsnittlig datatrafikk',measured?bytes(hubs.length?hubs.reduce((s,h)=>s+total(report.hubs?.[h.id]||{}),0)/hubs.length:0):'—','Per registrert hub · valgt periode','traffic'],['Total fjerntrafikk',measured?bytes(sum):'—','Til og fra alle huber · valgt periode','traffic']];
  $('fleet-summary').replaceChildren(...metrics.map(([label,value,note,icon])=>{const n=node('article',undefined,'fleet-metric');n.append(node('span',undefined,'fleet-icon '+icon),node('span',label),node('strong',value),node('small',note));return n;}));
  $('traffic-chart').replaceChildren();
  if(measured){$('traffic-chart').append(chart(list));const range=node('div',undefined,'chart-range');range.append(node('span',list[0]?.day),node('span',list.at(-1)?.day));$('traffic-chart').append(range);}
  else $('traffic-chart').append(node('p','Trafikkmålingen er ikke tilgjengelig ennå. Historikk vises når reléet rapporterer data.','traffic-empty'));
  $('traffic-note').textContent=measured?`${report.stale?'Målingen er forsinket. ':''}Målt fra ${new Date(report.started*1000).toLocaleDateString('nb-NO')}. Oppdatert ${new Date(report.updated*1000).toLocaleTimeString('nb-NO')}. Dager følger UTC.`:'Ingen estimerte tall vises.';
  for(const b of document.querySelectorAll('[data-fleet-filter]')){const key=b.dataset.fleetFilter;b.setAttribute('aria-pressed',String(key===filter));b.querySelector('span').textContent=key==='all'?hubs.length:hubs.filter(h=>category(h)===key).length;}
 }
 return {bytes,chart,
  mapItems(items){mapItems=items;drawMap();},
  async load(api,items){hubs=items;try{report=await api('admin/traffic?days='+$('traffic-period').value);}catch{report=null;}updateSummary();},
  select(items){return items.filter(h=>(filter==='all'||category(h)===filter)&&[h.serial,h.model,h.hardware].join(' ').toLocaleLowerCase('nb').includes(query)).sort((a,b)=>order==='serial'?a.serial.localeCompare(b.serial,'nb',{numeric:true}):(order==='oldest'?1:-1)*((a.created||0)-(b.created||0)));},
  metric(h){const n=node('div',undefined,'hub-traffic'),r=report?.hubs?.[h.id];n.append(node('small','Fjerntrafikk · '+$('traffic-period').value+' dager'),node('strong',report?.available?bytes(r?total(r):0):'—'));if(r)n.append(chart(r.daily,true));n.append(node('small',report?.available?'↑ '+bytes(r?.to_hub||0)+' til · ↓ '+bytes(r?.from_hub||0)+' fra':'Venter på måling'));return n;},
  init(render){$('toggle-map').onclick=async()=>{const show=$('fleet-map-panel').hidden;$('fleet-map-panel').hidden=!show;$('toggle-map').setAttribute('aria-expanded',String(show));$('toggle-map').textContent=show?'Skjul kart':'Vis huber på kart';if(show){try{await openMap();}catch(e){$('map-message').textContent=e.message;}}};$('fit-hubs').onclick=fitMap;$('hub-query').oninput=e=>{query=e.target.value.trim().toLocaleLowerCase('nb');render();};$('hub-sort').onchange=e=>{order=e.target.value;render();};document.querySelectorAll('[data-fleet-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.fleetFilter;updateSummary();render();});},
 };
})();

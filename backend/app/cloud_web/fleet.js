// Fleet presentation: byte totals are supplied by the relay, never synthesized.
window.fleet = (() => {
 let hubs=[], report=null, filter='all', query='', order='newest';
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
  async load(api,items){hubs=items;try{report=await api('admin/traffic?days='+$('traffic-period').value);}catch{report=null;}updateSummary();},
  select(items){return items.filter(h=>(filter==='all'||category(h)===filter)&&[h.serial,h.model,h.hardware].join(' ').toLocaleLowerCase('nb').includes(query)).sort((a,b)=>order==='serial'?a.serial.localeCompare(b.serial,'nb',{numeric:true}):(order==='oldest'?1:-1)*((a.created||0)-(b.created||0)));},
  metric(h){const n=node('div',undefined,'hub-traffic'),r=report?.hubs?.[h.id];n.append(node('small','Fjerntrafikk · '+$('traffic-period').value+' dager'),node('strong',report?.available?bytes(r?total(r):0):'—'));if(r)n.append(chart(r.daily,true));n.append(node('small',report?.available?'↑ '+bytes(r?.to_hub||0)+' til · ↓ '+bytes(r?.from_hub||0)+' fra':'Venter på måling'));return n;},
  init(render){$('hub-query').oninput=e=>{query=e.target.value.trim().toLocaleLowerCase('nb');render();};$('hub-sort').onchange=e=>{order=e.target.value;render();};document.querySelectorAll('[data-fleet-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.fleetFilter;updateSummary();render();});},
 };
})();

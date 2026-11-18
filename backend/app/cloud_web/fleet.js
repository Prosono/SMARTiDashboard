// Fleet presentation: byte totals are supplied by the relay, never synthesized.
window.fleet = (() => {
 let apiRequest=null;
 let hubs=[], report=null, filter='all', query='', order='newest';
 let map=null,markers=null,mapItems=[],mapLoading=null,firstMap=true;
 const $=id=>document.getElementById(id);
 const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const bytes=value=>{if(value==null)return '—';const units=['B','kB','MB','GB','TB'];let i=0;while(value>=1000&&i<4){value/=1000;i++;}return new Intl.NumberFormat('nb-NO',{maximumFractionDigits:1}).format(value)+' '+units[i];};
 const total=r=>(r.to_hub||0)+(r.from_hub||0);
 const category=h=>['preparing','ready'].includes(h.phase)?'ready':h.online?'active':'inactive';
 function fulfillment(h){
  const group=node('fieldset',undefined,'hub-fulfillment');
  group.setAttribute('aria-label','Levering for '+h.serial);
  for(const [step,title] of [['label_printed','Etikett skrevet ut'],['sent_to_customer','Sendt til kunde']]){
   const label=node('label'),checkbox=node('input'),status=node('small',undefined,'hub-fulfillment-status');
   checkbox.type='checkbox';
   checkbox.checked=h[step]===true;
   status.setAttribute('role','status');
   checkbox.onchange=async()=>{
    checkbox.disabled=true;
    status.textContent='Lagrer …';
    try{
     const result=await apiRequest('admin/hubs/'+encodeURIComponent(h.id)+'/fulfillment/'+step,'PUT',{checked:checkbox.checked},'Statusen kunne ikke lagres.');
     h[step]=result.checked;
     checkbox.checked=result.checked;
     status.textContent='Lagret';
    }catch(error){
     checkbox.checked=h[step]===true;
     status.textContent='Lagring kunne ikke bekreftes. Oppdater listen eller prøv igjen.';
    }finally{
     checkbox.disabled=false;
    }
   };
   label.append(checkbox,node('span',title));
   group.append(label,status);
  }
  return group;
 }
 async function labelImage(path){
  const image=new Image();
  image.src=path;
  await image.decode();
  return image;
 }
 function drawLabelSymbol(ctx,path,x,y,size){
  ctx.save();
  ctx.translate(x,y);
  ctx.scale(size/24,size/24);
  ctx.strokeStyle='#000';
  ctx.lineWidth=2;
  ctx.lineCap='round';
  ctx.lineJoin='round';
  ctx.stroke(new Path2D(path));
  ctx.restore();
 }
 function drawLabel(canvas,matrix,serial,logo,weee){
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#fff';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='#000';
  ctx.textAlign='center';

  // The printable area leaves 2 mm clear on the sides of the 50 mm stock.
  const serialWidth=canvas.width-48;
  ctx.font='bold 26px Arial, sans-serif';
  let lines=[serial];
  if(ctx.measureText(serial).width>serialWidth){
   const middle=Math.ceil(serial.length/2);
   const separator=serial.lastIndexOf('-',middle)+1;
   const split=separator>=middle-5?separator:middle;
   lines=[serial.slice(0,split),serial.slice(split)];
  }
  const imageHeight=lines.length===1?304:267;
  const size=Math.floor((imageHeight-15)/matrix.length);
  const qrWidth=size*matrix.length;
  const qrX=canvas.width-24-qrWidth,qrY=Math.floor((imageHeight-qrWidth)/2);
  matrix.forEach((row,y)=>row.forEach((dark,x)=>{
   if(dark)ctx.fillRect(qrX+x*size,qrY+y*size,size,size);
  }));
  const margin=24;
  const brandTop=Math.round(imageHeight/2)-108;
  const mark=node('canvas');
  mark.width=59;
  mark.height=51;
  const markCtx=mark.getContext('2d');
  // Crop the transparent padding in the bundled SMARTi symbol.
  markCtx.drawImage(logo,50,63,400,343,0,0,mark.width,mark.height);
  markCtx.globalCompositeOperation='source-in';
  markCtx.fillStyle='#000';
  markCtx.fillRect(0,0,mark.width,mark.height);
  ctx.drawImage(mark,margin,brandTop);

  const brandTextX=margin+mark.width+10;
  ctx.textAlign='left';
  ctx.textBaseline='alphabetic';
  ctx.font='bold 49px "Bai Jamjuree", Arial, sans-serif';
  ctx.fillText('SMARTi',brandTextX,brandTop+43,qrX-brandTextX-12);
  ctx.font='bold 24px Arial, sans-serif';
  ctx.fillText('Designed in Norway',margin,brandTop+83,qrX-margin-12);
  const symbolHeight=62;
  const symbolTop=brandTop+104;
  ctx.drawImage(weee,margin,symbolTop+52,symbolHeight*weee.naturalWidth/weee.naturalHeight,symbolHeight);
  // Lucide Plug and Recycle, matching the symbols used elsewhere in SMARTi.
  drawLabelSymbol(ctx,'M12 22v-5 M9 8V2 M15 8V2 M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z',margin+4,symbolTop,36);
  const recyclePath=[
   'M7 19H4.815a1.83 1.83 0 0 1-1.57-.881 1.785 1.785 0 0 1-.004-1.784L7.196 9.5',
   'M11 19h8.203a1.83 1.83 0 0 0 1.556-.89 1.784 1.784 0 0 0 0-1.775l-1.226-2.12',
   'M14 16l-3 3 3 3 M8.293 13.596 7.196 9.5 3.1 10.598',
   'M9.344 5.811l1.093-1.892A1.83 1.83 0 0 1 11.985 3a1.784 1.784 0 0 1 1.546.888l3.943 6.843',
   'M13.378 9.633l4.096 1.098 1.097-4.096',
  ].join(' ');
  drawLabelSymbol(ctx,recyclePath,margin+63,symbolTop+53,40);
  ctx.font='bold 19px Arial, sans-serif';
  ctx.fillText('POWER',margin+52,symbolTop+25);
  ctx.font='bold 16px Arial, sans-serif';
  ctx.fillText('EE recycling',margin+58,symbolTop+113);

  ctx.textAlign='center';
  ctx.textBaseline='alphabetic';
  const preferredSize=lines.length===1?52:32;
  ctx.font='bold '+preferredSize+'px Arial, sans-serif';
  const widest=Math.max(...lines.map(line=>ctx.measureText(line).width));
  ctx.font='bold '+Math.floor(preferredSize*Math.min(1,serialWidth/widest))+'px Arial, sans-serif';
  lines.forEach((line,i)=>ctx.fillText(line,canvas.width/2,336-(lines.length-1-i)*34));
 }
 async function openLabel(h){
  const dialog=node('dialog',undefined,'hub-detail label-print-dialog');
  dialog.id='hub-label-print';
  dialog.setAttribute('aria-labelledby','label-print-title');
  const header=node('header',undefined,'hub-detail-header'),title=node('h2','Skriv ut etikett');
  title.id='label-print-title';
  const close=node('button','Lukk');close.type='button';close.onclick=()=>dialog.close();
  header.append(title,close);
  const body=node('div',undefined,'label-print-body');
  const canvas=node('canvas',undefined,'label-print-image');
  // 50 × 30 mm at 300 dpi, rounded to whole printer dots.
  canvas.width=591;canvas.height=354;canvas.hidden=true;
  canvas.setAttribute('role','img');
  canvas.setAttribute('aria-label','SMARTi-etikett med QR-kode, serienummer '+h.serial+', Designed in Norway, strømtilkobling og EE-gjenvinning');
  const status=node('p','Laster etikett …');status.setAttribute('role','status');
  const actions=node('div',undefined,'label-print-actions');
  const print=node('button','Skriv ut'),download=node('button','Last ned PNG');
  print.type=download.type='button';
  print.disabled=download.disabled=true;
  print.onclick=()=>window.print();
  download.onclick=()=>{
   const link=node('a');
   link.href=canvas.toDataURL('image/png');
   link.download=h.serial+'-50x30mm.png';
   link.click();
  };
  actions.append(print,download);
  body.append(canvas,status,node('p','NIIMBOT B21 Pro · 50 × 30 mm. Skriv ut i faktisk størrelse (100 %), eller importer PNG i NIIMBOT-appen på en etikett i samme størrelse.'),actions);
  dialog.append(header,body);
  const printStyle=node('link');
  printStyle.rel='stylesheet';
  printStyle.href='/assets/label-print.css';
  printStyle.media='print';
  const printReady=new Promise(resolve=>{
   printStyle.onload=()=>resolve(true);
   printStyle.onerror=()=>resolve(false);
  });
  document.head.append(printStyle);
  document.body.append(dialog);
  dialog.addEventListener('close',()=>{
   printStyle.remove();
   dialog.remove();
  },{once:true});
  dialog.showModal();
  try{
   const [{matrix},logo,weee]=await Promise.all([
    apiRequest('admin/hubs/'+encodeURIComponent(h.id)+'/label?format=matrix'),
    labelImage('/assets/smarti-logo.png'),
    labelImage('/assets/label-weee.svg'),
    document.fonts.load('700 49px "Bai Jamjuree"').catch(()=>[]),
   ]);
   drawLabel(canvas,matrix,h.serial,logo,weee);
   canvas.hidden=false;
   status.hidden=true;
   download.disabled=false;
   if(await printReady)print.disabled=false;
   else{
    status.hidden=false;
    status.textContent='Utskriftsmalen kunne ikke lastes. Last ned PNG for å skrive ut.';
   }
  }catch{
   status.textContent='Etiketten kunne ikke lastes. Lukk og prøv igjen.';
  }
 }
 function printButton(h){
  const button=node('button','Skriv ut etikett');
  button.type='button';
  button.onclick=()=>openLabel(h);
  return button;
 }
 function chart(rows,compact=false){
  const wrap=node('div',undefined,compact?'traffic-bars mini':'traffic-bars');
  const max=Math.max(1,...rows.map(total));
  for(const r of rows){const bar=node('div',undefined,'traffic-day');bar.style.setProperty('--bar',Math.max(0,total(r)/max*100)+'%');const label=r.day+': '+bytes(total(r))+' · til hub '+bytes(r.to_hub)+' · fra hub '+bytes(r.from_hub);bar.title=label;bar.setAttribute('aria-label',label);const fill=node('span');if(total(r)>0)fill.classList.add('has-traffic');bar.append(fill);wrap.append(bar);}
  wrap.setAttribute('role','img');wrap.setAttribute('aria-label','Daglig fjerntrafikk. '+rows.map(r=>r.day+': '+bytes(total(r))).join(', '));return wrap;
 }

 function dailyHistory(rows){
  const details=node('details',undefined,'traffic-history');details.append(node('summary','Vis daglige målinger'));
  const first=new Date(report.started*1000).toISOString().slice(0,10);
  const table=node('table'),head=node('thead'),heading=node('tr'),body=node('tbody');
  for(const title of ['Dato (UTC)','Til hub','Fra hub','Totalt']){const th=node('th',title);th.scope='col';heading.append(th);}head.append(heading);
  for(const r of rows.filter(r=>r.day>=first).slice().reverse()){
   const tr=node('tr'),day=node('th',r.day);day.scope='row';tr.append(day,node('td',bytes(r.to_hub)),node('td',bytes(r.from_hub)),node('td',bytes(total(r))));body.append(tr);
  }
  table.append(head,body);details.append(table,node('p','Dagssummer lagres i skyen i 90 dager og beholdes ved omstart og oppdateringer. Små trafikkmengder vises med en minimumshøyde i grafen. Tallene i listen er de målte verdiene.'));
  return details;
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
  for(const h of located){const popup=node('div');popup.append(node('strong',h.serial),node('p',h.location.name||h.model),node('p',h.online?'På nett':'Frakoblet'));const action=node('button','Se hubdetaljer');action.type='button';action.onclick=()=>openDetails(h.id);popup.append(action);
   L.circleMarker([h.location.latitude,h.location.longitude],{radius:9,weight:3,color:'#fff',fillColor:category(h)==='ready'?'#ff7900':h.online?'#119b66':'#686868',fillOpacity:1}).bindPopup(popup).addTo(markers);
  }
 }
 function versions(h){
  const section=node('section',undefined,'hub-versions');
  section.setAttribute('aria-label','Installerte versjoner');
  const list=node('dl');
  for(const [key,title] of [['os','OS'],['core','Core'],['supervisor','Supervisor'],['smarti','SMARTi-app']]){
   const item=h.versions?.[key],group=node('div');
   group.append(node('dt',title),node('dd',item?.version||'Ikke rapportert'));
   if(item){const stale=Date.now()/1000-item.reported>300;group.append(node('small',(stale?'Eldre rapport · ':'Rapportert · ')+new Date(item.reported*1000).toLocaleString('nb-NO')));}
   list.append(group);
  }
  section.append(list);return section;
 }
 function openDetails(id){
  const h=hubs.find(h=>h.id===id);if(!h)return;
  document.getElementById('hub-detail')?.remove();
  const dialog=node('dialog',undefined,'hub-detail');dialog.id='hub-detail';dialog.setAttribute('aria-labelledby','hub-detail-title');
  const header=node('header',undefined,'hub-detail-header'),heading=node('div');heading.append(node('small','HUBDETALJER'));const title=node('h2',h.serial);title.id='hub-detail-title';heading.append(title);
  const close=node('button','Lukk');close.type='button';close.autofocus=true;close.onclick=()=>dialog.close();header.append(heading,close);
  const body=node('div',undefined,'hub-detail-body'),label=node('div',undefined,'hub-label hub-detail-label');
  const qr=node('img');qr.src='/api/admin/hubs/'+encodeURIComponent(h.id)+'/label';qr.alt='QR-kode for '+h.serial;
  qr.onerror=()=>{qr.hidden=true;label.append(node('p','QR-koden kunne ikke lastes. Lukk og åpne detaljene for å prøve igjen.'));};
  label.append(node('strong','SMARTi'),qr,node('p',h.serial),node('small','Skann med SMARTi-appen'));
  const qrSection=node('section',undefined,'hub-detail-qr');qrSection.append(label);
  qrSection.append(printButton(h),node('p','QR-koden tilhører denne huben. Del etiketten bare med den som skal sette den opp.'));
  const info=node('section',undefined,'hub-detail-info'),dl=node('dl');
  const date=v=>v?new Date(v*1000).toLocaleString('nb-NO'):'Ikke registrert';
  const state={preparing:'Under klargjøring',ready:'Klar for levering',activated:'Aktivert',claimed:'Knyttet til konto'};
  const yes=v=>v===true?'Tilkoblet':v===false?'Frakoblet':'Ikke rapportert';
  const fields=[['Modell',h.model||'Ikke registrert'],['Maskinvare',h.hardware||'Ikke registrert'],['Status',h.online?'På nett':'Ingen ferske livstegn'],['Registrert',date(h.created)],['Siste livstegn',date(h.seen)],['Klargjøring',state[h.phase]||h.phase||'Ikke registrert'],['SMARTi-versjon',h.health?.version||'Ikke rapportert'],['Home Assistant',yes(h.health?.ha_connected)],['Lokale brukere',h.health?.users??'Ikke rapportert'],['Plassering',validLocation(h)?[h.location.name,h.location.latitude+', '+h.location.longitude].filter(Boolean).join(' · '):'Ikke registrert']];
  if(h.setup_status)fields.push(['Oppsett',({completed:'Fullført',pending:'Venter',running:'Pågår',failed:'Trenger hjelp'})[h.setup_status]||h.setup_status]);
  if(h.reset&&h.reset.phase!=='completed')fields.push(['Tilbakestilling',h.reset.qr_required?(h.reset.qr_verified?'QR-koden er bekreftet':'Venter på ny QR-skanning'):'Tilbakestilling pågår']);
  for(const [key,value]of fields){dl.append(node('dt',key),node('dd',String(value)));}info.append(dl,node('h3','Installerte versjoner'),versions(h));
  const traffic=node('section',undefined,'hub-detail-traffic');traffic.append(node('h3','Fjerntrafikk · siste '+$('traffic-period').value+' dager'));
  const r=report?.hubs?.[h.id];if(report?.available){traffic.append(node('strong',bytes(r?total(r):0)),node('p','Til hub: '+bytes(r?.to_hub||0)+' · Fra hub: '+bytes(r?.from_hub||0)));if(r?.daily?.length)traffic.append(chart(r.daily),dailyHistory(r.daily));traffic.append(node('small',(report.stale?'Målingen er forsinket. ':'')+'Gjelder trafikk gjennom SMARTis relé, ikke all trafikk på hjemmenettverket.'));}else traffic.append(node('p','Trafikkmålingen er ikke tilgjengelig ennå.'));
  info.append(traffic);
  const deletion=node('section',undefined,'hub-deletion');
  deletion.append(node('h3','Slett hub'),node('p',h.can_delete?'Fjern huben fra SMARTis register. QR-etiketten og tilkoblingsnøkkelen slutter å virke. Huben må registreres på nytt før den kan brukes igjen.':'Huben kan bare slettes når den er frikoblet fra alle kontoer og ikke har et oppsett eller en tilbakestilling som pågår. Å være frakoblet nettet er ikke tilstrekkelig.'));
  if(h.can_delete){
   const remove=node('button','Slett hub');remove.type='button';remove.className='danger';
   const result=node('p');result.setAttribute('role','status');
   remove.onclick=async()=>{if(!confirm('Slett huben «'+h.serial+'» permanent fra SMARTis register? QR-etiketten slutter å virke. Dette kan ikke angres.'))return;remove.disabled=true;try{await apiRequest('admin/hubs/'+encodeURIComponent(h.id),'DELETE');dialog.close();await inventory();}catch(e){result.textContent=e.message;remove.disabled=false;}};
   deletion.append(remove,result);
  }
  info.append(deletion);
  const production=node('details',undefined,'hub-production');production.append(node('summary','Internt · produksjonsklargjøring'));
  production.append(node('p','Åpner RESTORE WIPE på denne huben i 30 minutter. Bruk bare en produksjonsmaster uten kundedata. Selve resetten må fortsatt bekreftes lokalt.'));
  const allow=node('button','Aktiver produksjonstilgang i 30 minutter'),notice=node('p');notice.setAttribute('role','status');allow.type='button';
  allow.onclick=async()=>{if(!confirm('Gi denne huben engangstilgang til produksjonsreset i 30 minutter? Dette klargjør for SSD-kloning og fjerner hubidentiteten når resetten utføres.'))return;allow.disabled=true;try{await apiRequest('admin/hubs/'+encodeURIComponent(h.id)+'/production-access','POST');notice.textContent='Tilgang aktivert. Velg «Klargjør for ny eier» i hubens reset-dialog og skriv RESTORE WIPE.';}catch(e){notice.textContent='Tilgang kunne ikke aktiveres. Huben må ha en eier og du må være portaladministrator.';allow.disabled=false;}};production.append(allow,notice);info.append(production);body.append(qrSection,info);dialog.append(header,body);document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
 }
 function updateSummary(){
  const days=Number($('traffic-period').value), list=report?.daily||[], sum=list.reduce((s,r)=>s+total(r),0), measured=report?.available;
  const metrics=[['Totalt antall huber',hubs.length,'Registrert i SMARTi','hub'],['Aktive huber',hubs.filter(h=>h.online).length,'Livstegn siste 100 sekunder','online'],['Gjennomsnittlig datatrafikk',measured?bytes(hubs.length?hubs.reduce((s,h)=>s+total(report.hubs?.[h.id]||{}),0)/hubs.length:0):'—','Per registrert hub · valgt periode','traffic'],['Total fjerntrafikk',measured?bytes(sum):'—','Til og fra alle huber · valgt periode','traffic']];
  $('fleet-summary').replaceChildren(...metrics.map(([label,value,note,icon])=>{const n=node('article',undefined,'fleet-metric');n.append(node('span',undefined,'fleet-icon '+icon),node('span',label),node('strong',value),node('small',note));return n;}));
  $('traffic-chart').replaceChildren();
  if(measured){$('traffic-chart').append(chart(list));const range=node('div',undefined,'chart-range');range.append(node('span',list[0]?.day),node('span',list.at(-1)?.day));$('traffic-chart').append(range,dailyHistory(list));}
  else $('traffic-chart').append(node('p','Trafikkmålingen er ikke tilgjengelig ennå. Historikk vises når reléet rapporterer data.','traffic-empty'));
  $('traffic-note').textContent=measured?`${report.stale?'Målingen er forsinket. ':''}Målt fra ${new Date(report.started*1000).toLocaleDateString('nb-NO')}. Oppdatert ${new Date(report.updated*1000).toLocaleTimeString('nb-NO')}. Dager følger UTC.`:'Ingen estimerte tall vises.';
  for(const b of document.querySelectorAll('[data-fleet-filter]')){const key=b.dataset.fleetFilter;b.setAttribute('aria-pressed',String(key===filter));b.querySelector('span').textContent=key==='all'?hubs.length:hubs.filter(h=>category(h)===key).length;}
 }
 return {bytes,chart,openDetails,versions,fulfillment,printButton,
  mapItems(items){mapItems=items;drawMap();},
  async load(api,items){apiRequest=api;hubs=items;try{report=await api('admin/traffic?days='+$('traffic-period').value);}catch{report=null;}updateSummary();},
  select(items){return items.filter(h=>(filter==='all'||category(h)===filter)&&[h.serial,h.model,h.hardware].join(' ').toLocaleLowerCase('nb').includes(query)).sort((a,b)=>order==='serial'?a.serial.localeCompare(b.serial,'nb',{numeric:true}):(order==='oldest'?1:-1)*((a.created||0)-(b.created||0)));},
  metric(h){const n=node('div',undefined,'hub-traffic'),r=report?.hubs?.[h.id];n.append(node('small','Fjerntrafikk · '+$('traffic-period').value+' dager'),node('strong',report?.available?bytes(r?total(r):0):'—'));if(r)n.append(chart(r.daily,true));n.append(node('small',report?.available?'↑ '+bytes(r?.to_hub||0)+' til · ↓ '+bytes(r?.from_hub||0)+' fra':'Venter på måling'));return n;},
  init(render){$('toggle-map').onclick=async()=>{const show=$('fleet-map-panel').hidden;$('fleet-map-panel').hidden=!show;$('toggle-map').setAttribute('aria-expanded',String(show));$('toggle-map').textContent=show?'Skjul kart':'Vis huber på kart';if(show){try{await openMap();}catch(e){$('map-message').textContent=e.message;}}};$('fit-hubs').onclick=fitMap;$('hub-query').oninput=e=>{query=e.target.value.trim().toLocaleLowerCase('nb');render();};$('hub-sort').onchange=e=>{order=e.target.value;render();};document.querySelectorAll('[data-fleet-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.fleetFilter;updateSummary();render();});},
 };
})();

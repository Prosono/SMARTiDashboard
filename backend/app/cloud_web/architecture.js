(() => {
 const $=id=>document.getElementById(id);
 const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e;};
 const flows=[['all','Alt'],['local','Lokal styring'],['remote','Fjernaksess'],['onboarding','Konto og oppsett'],['energy','Energi'],['notifications','Varsler'],['updates','Oppdateringer']];
 let data,flow='all',selected=null;
 const buttons=new Map();
 function visibleEdges(){return data.edges.filter(e=>(flow==='all'||e.flows.includes(flow))&&(!selected||e.source===selected||e.target===selected));}
 function draw(){
  const svg=$('connections');svg.replaceChildren();
  const ns='http://www.w3.org/2000/svg';const defs=document.createElementNS(ns,'defs');
  for(const [id,color] of [['normal','#a3a3a3'],['active','#ef7900']]){const m=document.createElementNS(ns,'marker');m.id='arrow-'+id;m.setAttribute('viewBox','0 0 10 10');m.setAttribute('refX','10');m.setAttribute('refY','5');m.setAttribute('markerWidth','5');m.setAttribute('markerHeight','5');m.setAttribute('orient','auto-start-reverse');const p=document.createElementNS(ns,'path');p.setAttribute('d','M 0 0 L 10 5 L 0 10 z');p.style.fill=color;p.style.stroke='none';p.style.opacity='1';m.append(p);defs.append(m);}svg.append(defs);
  const edges=visibleEdges(), activeIds=new Set(edges.flatMap(e=>[e.source,e.target]));if(selected)activeIds.add(selected);
  for(const [id,b] of buttons){b.setAttribute('aria-pressed',String(selected===id));b.classList.toggle('is-dim',(flow!=='all'||selected)&&!activeIds.has(id));}
  const base=$('system-map').getBoundingClientRect();
  for(const e of edges){const a=buttons.get(e.source).getBoundingClientRect(),b=buttons.get(e.target).getBoundingClientRect();let x1,y1,x2,y2,d;
   if(Math.abs(a.left-b.left)<5){x1=a.right-base.left-10;x2=b.right-base.left-10;y1=a.bottom-base.top;y2=b.top-base.top;d=`M${x1},${y1} C${x1+22},${y1+20} ${x2+22},${y2-20} ${x2},${y2}`;}
   else{const right=b.left>a.left;x1=(right?a.right:a.left)-base.left;x2=(right?b.left:b.right)-base.left;y1=a.top+a.height/2-base.top;y2=b.top+b.height/2-base.top;const mid=(x1+x2)/2;d=`M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`;}
   const p=document.createElementNS(ns,'path');p.setAttribute('d',d);const active=flow!=='all'||selected;p.setAttribute('marker-end',`url(#arrow-${active?'active':'normal'})`);if(active)p.classList.add('active');svg.append(p);
  }
 }
 function detail(){const box=$('component-detail');box.replaceChildren();
  const item=data.nodes.find(n=>n.id===selected);
  if(item){box.append(node('p',data.zones[item.zone],'eyebrow'),node('h2',item.title),node('p',item.summary),node('p',item.details),node('h3','Data og lagring'),node('p',item.stores));}
  else{box.append(node('p','DATAFLYT','eyebrow'),node('h2',flows.find(f=>f[0]===flow)[1]),node('p','Velg en komponent i kartet for å se ansvar og lagring. Forbindelsene nedenfor kan også brukes til å navigere.'));}
  box.append(node('h3',item?'Forbindelser i valgt flyt':'Forbindelser'));
  for(const e of visibleEdges()){const a=data.nodes.find(n=>n.id===e.source),b=data.nodes.find(n=>n.id===e.target);const target=selected===e.target?a:b;const button=node('button',`${a.title} → ${b.title}`);button.append(node('small',' · '+e.label));button.onclick=()=>select(target.id);box.append(button);}
  if(!visibleEdges().length)box.append(node('p','Ingen forbindelser for denne komponenten i valgt flyt. Velg «Alt» for å se alle.'));
  if(item){const sources=node('details');sources.append(node('summary','Kilde i prosjektet'));item.sources.forEach(s=>sources.append(node('code',s)));box.append(sources);}
 }
 function select(id){selected=id;draw();detail();if(innerWidth<=1050)$('component-detail').scrollIntoView({behavior:'auto',block:'start'});$('component-detail').focus({preventScroll:true});}
 async function init(){try{const response=await fetch('/api/admin/architecture',{credentials:'same-origin',cache:'no-store'});if(!response.ok)throw Error(response.status===401?'Logg inn på administrasjonssiden for å se arkitekturen.':response.status===403?'Denne siden krever SMARTi-administratortilgang.':'Arkitekturen kunne ikke hentes. Last siden på nytt.');data=await response.json();document.documentElement.dataset.portalSession="authenticated";
  $('revision').textContent='Dokumentert '+data.updated+' · ikke live';
  for(const [id,label] of flows){const b=node('button',label);b.setAttribute('aria-pressed',String(flow===id));b.onclick=()=>{flow=id;selected=null;[...$('flow-controls').children].forEach(x=>x.setAttribute('aria-pressed',String(x===b)));draw();detail();};$('flow-controls').append(b);}
  data.zones.forEach((title,index)=>{const z=node('div',null,'architecture-zone');z.append(node('h2',title));data.nodes.filter(n=>n.zone===index).forEach(n=>{const b=node('button',null,'architecture-node');b.style.gridRow=String(n.row+2);b.append(node('strong',n.title),node('span',n.summary));b.setAttribute('aria-pressed','false');b.onclick=()=>select(n.id);buttons.set(n.id,b);z.append(b);});$('zones').append(z);});
  $('reset-map').onclick=()=>{flow='all';selected=null;[...$('flow-controls').children].forEach((b,i)=>b.setAttribute('aria-pressed',String(i===0)));draw();detail();};
  $('architecture-content').hidden=false;draw();detail();new ResizeObserver(draw).observe($('system-map'));
 }catch(e){$('revision').textContent='Ikke tilgjengelig';$('architecture-message').textContent=e.message;const link=node('a','Åpne administrasjon');link.href='/admin';$('architecture-message').append(' ',link);}}
 init();
})();

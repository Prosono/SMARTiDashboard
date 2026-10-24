// Shared navigation and footer; all links remain ordinary, accessible navigation.
(() => {
  const path = location.pathname;
  // Keep the administration destinations in the same order on every staff page.
  if (path === '/admin' || path.startsWith('/admin/')) {
    document.body.classList.add('staff-page');
    const fleetStyle=document.createElement('link');fleetStyle.rel='stylesheet';fleetStyle.href='/assets/fleet.css?v=4';document.head.append(fleetStyle);
    const brandLabel = document.querySelector('.masthead > a span');
    if (brandLabel) brandLabel.textContent = 'Administrasjon';
    if (path === '/admin/support') {
      document.querySelector('#title').textContent = 'Support og oppfølging.';
      document.querySelector('.heading p:not(.eyebrow)').textContent = 'Fordel saker, følg fremdriften og hjelp kunden videre.';
    }
    document.querySelector('.masthead > a')?.setAttribute('href','/admin');
    const nav = document.querySelector('.masthead nav');
    const links = [['/admin','Oversikt'],['/admin/hubs','Huber'],['/admin/users','Brukere'],['/admin/support','Support'],['/admin/support/prices','Prisliste'],['/admin/architecture','Arkitektur'],['/admin/account','Konto']];
    if (nav) {
      for (const [href, label] of links) {
        const existing = nav.querySelector(`a[href="${href}"]:not([id])`);
        const link = existing || document.createElement('a');
        link.href = href; link.textContent = label;
        if (href === "/admin/account") link.style.setProperty("--icon", "url(/assets/icon-users.svg)");
        if (href === "/admin/architecture") link.style.setProperty("--icon", "url(/assets/icon-grid.svg)");
        nav.append(link);
      }
      // Role-controlled links retain their IDs for their page controllers.
      for (const link of nav.querySelectorAll('a:not([id])')) {
        if (!links.some(([href]) => link.getAttribute('href') === href)) link.remove();
      }
    }
  }
  const publicLink=document.createElement('a');publicLink.href='https://www.smarti.no/';publicLink.textContent='Om oss';publicLink.className='public-about';document.querySelector('.masthead nav')?.append(publicLink);
  for (const link of document.querySelectorAll('.masthead nav a')) {
    if (link.getAttribute('href') === path) link.setAttribute('aria-current', 'page');
  }
  if (!document.querySelector('.site-footer')) {
    const footer = document.createElement('footer');
    footer.className = 'site-footer';
    const text = document.createElement('span');
    text.textContent = 'SMART LIVING, SIMPLIFIED.';
    const link = document.createElement('a');
    link.href = 'https://www.smarti.no/';
    link.textContent = 'Om SMARTi ↗';
    footer.append(text, link);
    document.body.append(footer);
  }
})();

// Explicit, accessible password visibility; passwords stay in the existing form.
for (const input of document.querySelectorAll('input[type=password]')) {
  const field = document.createElement('div');
  field.className = 'password-field';
  input.replaceWith(field);
  field.append(input);
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'password-toggle';
  toggle.textContent = 'Vis';
  toggle.setAttribute('aria-label', 'Vis passord');
  toggle.setAttribute('aria-pressed', 'false');
  toggle.addEventListener('click', () => {
    const reveal = input.type === 'password';
    input.type = reveal ? 'text' : 'password';
    toggle.textContent = reveal ? 'Skjul' : 'Vis';
    toggle.setAttribute('aria-label', reveal ? 'Skjul passord' : 'Vis passord');
    toggle.setAttribute('aria-pressed', String(reveal));
  });
  field.append(toggle);
}

// Customer workspaces share navigation and follow the device's light/dark preference.
if (['/', '/account', '/support', '/support/prices'].includes(location.pathname)) {

  document.body.classList.add('customer-portal');
  const nav=document.querySelector('.masthead nav');
  const accountLink=nav.querySelector('a[href="/account"]');
  if(!accountLink){const link=document.createElement('a');link.href='/account';link.textContent='Min konto';nav.insertBefore(link,nav.querySelector('a[href="/support"]'));}
  const priceLink=nav.querySelector('a[href="/support/prices"]');if(priceLink)priceLink.remove();
  const about=document.createElement('a');about.href='https://www.smarti.no/';about.textContent='Om SMARTi ↗';about.className='sidebar-about';document.querySelector('.masthead').append(about);
  if(location.pathname==='/account'){
    const fields=document.querySelector('.profile-fields');
    const photo=fields.querySelector('.photo-picker');fields.prepend(photo);
    const groups=[['Kontaktinformasjon',['full_name','email','phone']],['Adresse',['address','postal_code','city','country']]];
    for(const [title,names] of groups){const section=document.createElement('section');section.className='profile-section';const heading=document.createElement('h2');heading.textContent=title;const controls=document.createElement('div');controls.className='profile-controls';for(const name of names)controls.append(fields.querySelector(`[name="${name}"]`).closest('label'));section.append(heading,controls);fields.append(section);}
    fields.querySelectorAll('.two').forEach(n=>{if(!n.children.length)n.remove()});
  }
  if(location.pathname==='/support'){
    document.querySelector('.heading a[href="/support/prices"]')?.remove();
    const toolbar=document.querySelector('#workspace>.toolbar');
    toolbar.append(document.getElementById('filter').closest('label'));
    const count=document.createElement('span');count.id='case-count';count.className='case-count';toolbar.append(count);
    const service=document.createElement('a');service.href='/support/prices';service.className='service-link';
    const title=document.createElement('strong');title.textContent='Tjenester og priser';const text=document.createElement('span');text.textContent='Se hva vi kan hjelpe deg med.';const arrow=document.createElement('span');arrow.textContent='Se priser →';service.append(title,text,arrow);document.querySelector('main').append(service);
  }
}

// A deliberate portal preference, shared across routes and remembered on this device.
(() => {
  const themeKey='smarti.portal.theme';
  let theme='dark';
  try{const saved=localStorage.getItem(themeKey);if(['light','dark'].includes(saved))theme=saved;}catch{}

  const selector=document.createElement('div');selector.className='portal-theme';
  const button=document.createElement('button');button.type='button';
  const symbol=document.createElement('span');symbol.setAttribute('aria-hidden','true');button.append(symbol);selector.append(button);
  button.onclick=()=>{theme=theme==='dark'?'light':'dark';apply();try{localStorage.setItem(themeKey,theme);}catch{}};
  function apply(){
    document.documentElement.dataset.portalTheme=theme;
    const label=theme==='dark'?'Bytt til lyst tema':'Bytt til mørkt tema';
    button.setAttribute('aria-label',label);button.title=label;symbol.textContent=theme==='dark'?'☀':'☾';
  }
  apply();document.querySelector('.masthead')?.append(selector);
  window.addEventListener('storage',e=>{if(e.key===themeKey&&['light','dark'].includes(e.newValue)){theme=e.newValue;apply();}});
})();

// Draw directional icons as vectors so iOS never substitutes an emoji glyph.
(() => {
 const decorate=root=>{const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const nodes=[];while(walker.nextNode())if(/[→↗]/.test(walker.currentNode.textContent)&&!['SCRIPT','STYLE','TEXTAREA'].includes(walker.currentNode.parentElement?.tagName))nodes.push(walker.currentNode);
 for(const node of nodes){const parts=node.textContent.split(/([→↗])/);const fragment=document.createDocumentFragment();for(const part of parts){if(part==='→'||part==='↗'){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('class','direction-icon');svg.setAttribute('aria-hidden','true');const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',part==='→'?'M4 12h16m-6-6 6 6-6 6':'M6 18 18 6M6 6h12v12');svg.append(path);fragment.append(svg);}else fragment.append(document.createTextNode(part));}node.replaceWith(fragment);}}
 decorate(document.body);new MutationObserver(records=>{for(const r of records)for(const node of r.addedNodes){if(node.nodeType===1)decorate(node);else if(node.nodeType===3&&/[→↗]/.test(node.textContent))decorate(node.parentNode);}}).observe(document.body,{childList:true,subtree:true});
})();

// Every administration screen offers the same explicit, server-confirmed logout.
if(location.pathname==='/admin'||location.pathname.startsWith('/admin/')){
 const nav=document.querySelector('.masthead nav');const logout=document.getElementById('logout')||document.createElement('button');
 logout.id='logout';logout.type='button';logout.textContent='Logg ut';logout.hidden=false;nav?.append(logout);
 logout.onclick=async()=>{logout.disabled=true;try{
  const session=await fetch('/api/session',{credentials:'same-origin',signal:AbortSignal.timeout(15000)});
  if(session.status!==401){if(!session.ok)throw Error();const data=await session.json();const result=await fetch('/api/logout',{method:'POST',credentials:'same-origin',headers:{'X-CSRF-Token':data.csrf},signal:AbortSignal.timeout(15000)});if(!result.ok&&result.status!==401)throw Error();}
  delete document.documentElement.dataset.portalSession;window.webkit?.messageHandlers?.smartiSession?.postMessage('logout');location.replace('/');
 }catch{const message=document.getElementById('message');if(message){message.textContent='Kunne ikke logge ut. Kontroller forbindelsen og prøv igjen.';message.scrollIntoView({block:'center'});}logout.disabled=false;}};
}

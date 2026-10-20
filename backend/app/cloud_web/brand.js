// Shared navigation and footer; all links remain ordinary, accessible navigation.
(() => {
  const path = location.pathname;
  // Keep the administration destinations in the same order on every staff page.
  if (path.startsWith('/admin/')) {
    document.body.classList.add('staff-page');
    const brandLabel = document.querySelector('.masthead > a span');
    if (brandLabel) brandLabel.textContent = 'Administrasjon';
    if (path === '/admin/support') {
      document.querySelector('#title').textContent = 'Support og oppfølging.';
      document.querySelector('.heading p:not(.eyebrow)').textContent = 'Fordel saker, følg fremdriften og hjelp kunden videre.';
    }
    const nav = document.querySelector('.masthead nav');
    const links = [['/admin','Oversikt'],['/admin/hubs','Huber'],['/admin/support','Support'],['/support/prices','Prisliste'],['/','Mine hjem ↗']];
    if (nav) {
      for (const [href, label] of links) {
        const existing = nav.querySelector(`a[href="${href}"]:not([id])`);
        const link = existing || document.createElement('a');
        link.href = href; link.textContent = label;
        nav.append(link);
      }
      // Role-controlled links retain their IDs for their page controllers.
      for (const link of nav.querySelectorAll('a:not([id])')) {
        if (!links.some(([href]) => link.getAttribute('href') === href)) link.remove();
      }
    }
  }
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

  const selector=document.createElement('div');selector.className='portal-theme';selector.setAttribute('role','group');selector.setAttribute('aria-label','Fargetema');
  for(const [value,label,icon] of [['light','Lyst','☀'],['dark','Mørkt','☾']]){
    const button=document.createElement('button');button.type='button';button.dataset.theme=value;
    const symbol=document.createElement('span');symbol.setAttribute('aria-hidden','true');symbol.textContent=icon;
    button.append(symbol,document.createTextNode(label));button.onclick=()=>{theme=value;apply();try{localStorage.setItem(themeKey,theme);}catch{}};selector.append(button);
  }
  function apply(){document.documentElement.dataset.portalTheme=theme;for(const button of selector.children)button.setAttribute('aria-pressed',String(button.dataset.theme===theme));}
  apply();document.querySelector('.masthead')?.append(selector);
  window.addEventListener('storage',e=>{if(e.key===themeKey&&['light','dark'].includes(e.newValue)){theme=e.newValue;apply();}});
})();

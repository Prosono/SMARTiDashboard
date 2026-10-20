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

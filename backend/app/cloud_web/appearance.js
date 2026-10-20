// Runs synchronously in <head>, before any body content or first paint.
(() => {
  let theme='dark';
  try{const saved=localStorage.getItem('smarti.portal.theme');if(['light','dark'].includes(saved))theme=saved;}catch{}
  document.documentElement.dataset.portalTheme=theme;
  if(['/', '/account', '/support', '/support/prices'].includes(location.pathname))document.documentElement.dataset.customerPortal='true';
})();

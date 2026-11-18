// The same portal flow runs in both languages, including requests to the cloud and the native bridge.
const {chromium, webkit, devices, expect} = require(process.cwd() + '/frontend/node_modules/@playwright/test');
const fs = require('node:fs');
const root = 'https://home.smarti.dev';
const home = '00000000-0000-4000-8000-000000000008';
const device = '00000000-0000-4000-8000-000000000007';

async function onboarding(engine, language) {
 const browser = await engine.launch();
 try {
  const page = await browser.newPage({...devices['iPhone 13'], locale: 'nb-NO'});
  await page.addInitScript(() => {
   window.setupMessages = [];
   window.webkit = {messageHandlers: {smartiOnboarding: {postMessage: message => window.setupMessages.push(message)}}};
  });
  const english = language === 'en';
  let profile, plan, invited = false, opened = false, loggedIn = false, attempts = 0;
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.context().route('https://**.smarti.dev/**', async route => {
   const request = route.request();
   const {hostname, pathname} = new URL(request.url());
   if (hostname !== 'home.smarti.dev') return route.fulfill({body: 'Home opened'});
   if (pathname === '/api/session') return route.fulfill(loggedIn ? {json: {csrf: 'test', portal_admin: false}} : {status: 401, json: {}});
   if (pathname.endsWith('/identify')) return route.fulfill({json: {model: 'SMARTi Hub', serial: 'TEST', online: true}});
   if (pathname === '/api/register') {
    const data = request.postDataJSON();
    expect(data.profile.email).toBe('resident@example.com');
    expect(data.terms_accepted).toBe(true);
    expect(data.password_confirmation).toBe(data.password);
    expect(request.headers()['x-smarti-language']).toBe(language);
    profile = {...data.profile, verified: false};
    return route.fulfill({json: {created: true}});
   }
   if (pathname === '/api/login') {
    loggedIn = true;
    return route.fulfill({json: {csrf: 'test'}});
   }
   if (pathname === '/api/customer/profile') return route.fulfill({json: {profile}});
   if (pathname === '/api/customer/verification') {
    expect(request.headers()['x-smarti-language']).toBe(language);
    profile.verified = true;
    return route.fulfill({json: {queued: true}});
   }
   if (pathname.endsWith('/claim')) return route.fulfill({json: {id: home}});
   if (pathname === '/api/onboarding/' + home) {
    if (request.method() === 'POST') {
     const data = request.postDataJSON();
     expect(data).toMatchObject({
      mode: 'new', language, name: english ? 'Test home' : 'Mitt hjem',
      country: 'NO', latitude: 59.9, longitude: 10.7,
     });
     expect(data.rooms).toHaveLength(4);
     expect(data.rooms[0]).toEqual({
      name: english ? 'Living room' : 'Stue', floor: english ? 'First floor' : 'Første etasje',
     });
     plan = ++attempts === 1 && english
      ? {status: 'failed', step: 'radios', error: 'radios_unavailable', draft: data}
      : {status: 'completed', step: 'completed', draft: data};
     return route.fulfill({json: {id: 'job'}});
    }
    return route.fulfill({json: {model: 'SMARTi Hub', serial: 'TEST', online: true, health: {users: 0}, remote_connected: true, plan}});
   }
   if (pathname.endsWith('/invitations')) {
    expect(request.headers()['x-smarti-language']).toBe(language);
    invited = true;
    return route.fulfill({json: {queued: true}});
   }
   if (pathname.endsWith('/open')) {
    expect(request.headers()['x-smarti-language']).toBe(language);
    opened = true;
    return route.fulfill({json: {url: 'https://' + home + '.home.smarti.dev/_account?lang=' + language + '#' + 'x'.repeat(48)}});
   }
   const file = {'/': 'index.html', '/activate': 'onboarding.html', '/terms': 'terms.html', '/account': 'account.html'}[pathname]
    || (/^\/assets\/[\w.-]+$/.test(pathname) && pathname.split('/').pop());
   if (!file || !fs.existsSync('backend/app/cloud_web/' + file)) return route.fulfill({status: 404, body: ''});
   return route.fulfill({path: 'backend/app/cloud_web/' + file});
  });

  await page.goto(root);
  await page.locator('#portal-language').selectOption(language);
  await page.goto(root + '/activate?device=' + device + '#' + home + '.v2.' + 'a'.repeat(64));
  await expect(page.locator('#signup')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', language);
  await expect(page.locator('#auth h1')).toHaveText(english ? 'Whose home is this?' : 'Hvem sitt hjem er dette?');
  expect(await page.evaluate(() => window.setupMessages)).toContainEqual({language});
  const fields = {full_name: 'Test Resident', email: 'resident@example.com', phone: '+4712345678',
   address: 'Testveien 1', postal_code: '1234', city: 'Oslo', password: 'test-password-long'};
  for (const [key, value] of Object.entries(fields)) await page.locator('#signup [name=' + key + ']').fill(value);
  await expect(page.locator('#signup [name=country]')).toHaveValue(english ? 'Norway' : 'Norge');
  const [terms] = await Promise.all([page.waitForEvent('popup'), page.locator('.consent-choice a').click()]);
  await expect(terms.locator('h1')).toHaveText(english ? 'SMARTi account terms of use' : 'Bruksvilkår for SMARTi-konto');
  await terms.close();
  await expect(page.locator('#registration-confirmation-label')).toHaveText(english ? 'Confirm password' : 'Gjenta passord');
  await page.locator('#signup [name=password_confirmation]').fill(fields.password);
  await page.locator('#signup [name=terms_accepted]').check();
  await page.locator('#signup button.primary').click();
  await expect(page.locator('#verification h1')).toHaveText(english ? 'Verify your email address.' : 'Bekreft e-postadressen din.');
  await page.locator('#resend-verification').click();
  await expect(page.locator('#message')).toContainText(english ? 'verification email is queued' : 'utsendingskøen');
  await page.locator('#check-verification').click();

  await expect(page.locator('#location-step legend')).toHaveText(english ? 'Your home' : 'Hjemmet ditt');
  await expect(page.locator('#configure [name=country] option:checked')).toHaveText(english ? 'Norway' : 'Norge');
  if (english) {
   const name = page.locator('#configure [name=name]');
   await expect(name).toHaveValue('My home');
   await name.fill('Test home');
   await page.locator('#portal-language').selectOption('nb');
   await expect(page.locator('#location-step legend')).toHaveText('Hjemmet ditt');
   await page.locator('#portal-language').selectOption('en');
   await expect(name).toHaveValue('Test home');
   await page.locator('#next-step').click();
   expect(await page.locator('[name=latitude]').evaluate(input => input.validationMessage)).toBe('Fill in this field.');
  }
  if (!english) await page.locator('#location-step summary').click();
  await page.locator('[name=latitude]').fill('59.9');
  await page.locator('[name=longitude]').fill('10.7');
  const finish = async () => {
   await page.locator('#next-step').click();
   await expect(page.locator('#rooms-step legend')).toHaveText(english ? 'Floors and rooms' : 'Etasjer og rom');
   await expect(page.locator('[data-field=floor]').first()).toHaveValue(english ? 'First floor' : 'Første etasje');
   await page.locator('#next-step').click();
   await expect(page.locator('#experience-step legend')).toHaveText(english ? 'How much detail would you like?' : 'Hvor mye vil du se?');
   await page.locator('#next-step').click();
   await page.locator('#configure [name=password]').fill('test-password-long-123');
   await page.locator('#configure [name=password_repeat]').fill('test-password-long-123');
   await expect(page.locator('#finish')).toHaveText(english ? 'Finish setup' : 'Gjør hjemmet klart');
   await page.locator('#finish').click();
  };
  await finish();
  if (english) {
   await expect(page.locator('#progress-text')).toContainText('Zigbee or Z-Wave isn’t ready');
   await expect(page.locator('#steps [aria-current]')).toHaveText('Connecting Zigbee and Z-Wave');
   await page.locator('#retry').click();
   await expect(page.locator('#location-step')).toBeVisible();
   await finish();
  }
  await expect(page.locator('#progress-title')).toHaveText(english ? 'Your home is ready.' : 'Hjemmet ditt er satt opp.');
  await expect(page.locator('#steps')).toBeHidden();
  await page.locator('#invite-form [name=email]').fill('guest@example.com');
  await page.locator('#invite-form button').click();
  await expect(page.locator('#invite-status')).toContainText(english ? 'invitation is queued' : 'utsendingskøen');
  await page.locator('#open-home').click();
  await expect(page).toHaveURL(url => url.hostname === home + '.home.smarti.dev'
    && url.searchParams.get('lang') === language);
  expect({invited, opened, errors}).toEqual({invited: true, opened: true, errors: []});
  console.log('PASS: ' + engine.name() + ' ' + language + ' sign-in language → QR → verification → setup → home handoff');
 } finally { await browser.close(); }
}

(async () => {
 await onboarding(chromium, 'nb');
 await onboarding(webkit, 'en');
})().catch(error => { console.error(error); process.exitCode = 1; });

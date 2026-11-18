const $ = id => document.getElementById(id);
const text = window.smartiAuthLanguage.text;
const creatingAccount = new URLSearchParams(location.search).get('create') === '1';
const fragment = new URLSearchParams(location.hash.slice(1));
const verifyToken = fragment.get('verify');
const inviteToken = fragment.get('invite');
history.replaceState(null, '', creatingAccount ? '/account?create=1' : '/account');

const editor = $('signup');
const save = editor.querySelector('button[type=submit]');
const country = editor.elements.country;
let csrf = '', profile = null, message = null;
const requestFailed = ['Kunne ikke fullføre. Prøv igjen.', 'Could not complete the request. Try again.'];
const authErrors = {
  400: ['Lenken er utløpt eller passer ikke til e-postadressen på kontoen.', 'The link expired or does not match the email address on the account.'],
  401: ['Logg inn med riktig e-post og passord.', 'Sign in with the correct email and password.'],
  403: ['Tilgangen er ikke tilgjengelig. Kontroller e-postbekreftelsen.', 'Access is unavailable. Check that you verified your email.'],
  409: ['Kontoen eller e-postadressen er allerede i bruk.', 'The account or email address is already in use.'],
  422: ['Kontroller feltene. Passord må ha minst 12 tegn.', 'Check the fields. Passwords must contain at least 12 characters.'],
  429: ['For mange forsøk. Vent litt og prøv igjen.', 'Too many attempts. Wait a while and try again.'],
};

function showMessage(copy = null) {
  message = copy;
  $('message').textContent = copy ? text(...copy) : '';
}

async function api(path, method = 'GET', body) {
  const response = await fetch('/api/' + path, {
    method,
    headers: {'Content-Type': 'application/json', 'X-CSRF-Token': csrf, 'X-SMARTi-Language': window.smartiAuthLanguage.language},
    ...(body ? {body: JSON.stringify(body)} : {}),
  });
  if (path === 'session' && response.ok) document.documentElement.dataset.portalSession = 'authenticated';
  if (response.status === 401) delete document.documentElement.dataset.portalSession;
  if (!response.ok) {
    const copy = authErrors[response.status] || requestFailed;
    throw Object.assign(new Error(text(...copy)), {copy});
  }
  return response.json();
}

async function run(action) {
  const buttons = [...document.querySelectorAll('button:enabled')];
  buttons.forEach(button => { button.disabled = true; });
  try {
    await action();
  } catch (error) {
    showMessage(error.copy || requestFailed);
  } finally {
    buttons.forEach(button => { button.disabled = false; });
  }
}

function renderLanguage() {
  const signedIn = !$('account').hidden;
  const registering = creatingAccount && !signedIn;
  $('account-title').textContent = registering
    ? text('Ditt hjem starter her.', 'Your home starts here.')
    : text('Din SMARTi-konto', 'Your SMARTi account');
  document.querySelector('.account-intro').textContent = registering
    ? text('Opprett SMARTi-kontoen din. Etter e-postbekreftelsen er du klar til å koble til huben.', 'Create your SMARTi account. Once you verify your email, you can connect your hub.')
    : text('Fullfør kontaktprofilen din og hold opplysningene dine oppdatert.', 'Complete your contact profile and keep your details up to date.');
  save.textContent = signedIn ? text('Lagre profil', 'Save profile') : text('Opprett konto', 'Create an account');
  if (signedIn) {
    $('verify').textContent = profile?.verified ? text('Bytt e-postadresse', 'Change email address') : text('Send ny bekreftelse på e-post', 'Resend verification email');
    let summary = text('Denne eldre kontoen mangler kontaktprofil. Fullfør profilen nedenfor.', 'This older account needs a contact profile. Complete your details below.');
    if (profile?.verified) {
      summary = text('E-postadressen er bekreftet.', 'Your email address is verified.');
    } else if (profile?.deadline) {
      const date = new Date(profile.deadline * 1000).toLocaleDateString(document.documentElement.lang, {dateStyle: 'medium'});
      summary = text(`Bekreft e-post innen ${date}.`, `Verify your email by ${date}.`);
    } else if (profile) {
      summary = text('Bekreft e-posten før du legger til en hub.', 'Verify your email before adding a hub.');
    }
    $('profile-summary').textContent = summary;
  }
  showMessage(message);
}

async function show() {
  const session = await api('session');
  if (session.portal_admin) {
    location.replace('/admin');
    return;
  }
  csrf = session.csrf;
  const result = await api('customer/profile');
  profile = result.profile;
  $('auth').hidden = true;
  $('account').hidden = false;
  document.body.classList.remove('registration-page');
  if (creatingAccount) history.replaceState(null, '', '/account');
  $('accept').hidden = !inviteToken;

  $('account').prepend(editor);
  editor.classList.add('account-editor');
  window.smartiRegistration.editProfile(result.consents?.marketing_opt_in);
  editor.elements.password.closest('label').hidden = true;
  editor.elements.password.required = false;
  for (const name of ['full_name', 'email', 'phone', 'address', 'postal_code', 'city', 'country']) {
    editor.elements[name].value = profile?.[name] || (name === 'country' ? country.defaultValue : '');
  }
  window.smartiProfilePhoto = profile?.photo || '';
  $('photo-preview').hidden = !window.smartiProfilePhoto;
  if (window.smartiProfilePhoto) $('photo-preview').src = window.smartiProfilePhoto;
  $('photo-remove').hidden = !window.smartiProfilePhoto;
  $('profile-summary').classList.toggle('is-verified', !!profile?.verified);
  if (!editor.querySelector('.verification-row')) {
    const verification = document.createElement('div');
    verification.className = 'verification-row';
    verification.append($('profile-summary'), $('verify'));
    save.before(verification);
  }
  if (!result.mail_configured && !message) {
    showMessage(['E-postutsending er ikke konfigurert ennå. Kontakt SMARTi. Meldinger ligger i kø.', 'Email delivery is not configured yet. Contact SMARTi. Messages are queued.']);
  }
  renderLanguage();
}

$('login').onsubmit = event => {
  event.preventDefault();
  run(async () => {
    csrf = (await api('login', 'POST', Object.fromEntries(new FormData(event.target)))).csrf;
    document.activeElement?.blur();
    event.target.reset();
    showMessage();
    await show();
    window.scrollTo({top: 0, left: 0, behavior: 'instant'});
  });
};

editor.onsubmit = event => {
  event.preventDefault();
  run(async () => {
    const data = Object.fromEntries(new FormData(editor));
    const {password} = data;
    delete data.password;
    delete data.password_confirmation;
    delete data.terms_accepted;
    delete data.marketing_opt_in;
    data.photo = window.smartiProfilePhoto || '';
    const registration = window.smartiRegistration.payload();
    const signedIn = !!csrf;
    if (signedIn) {
      await api('customer/profile', 'PUT', data);
      await api('customer/marketing', 'PUT', {marketing_opt_in: registration.marketing_opt_in});
    } else {
      await api('register', 'POST', {username: data.email, password, profile: data, ...registration});
      csrf = (await api('login', 'POST', {username: data.email, password})).csrf;
    }
    showMessage(signedIn ? ['Profilen er lagret.', 'Your profile was saved.'] : null);
    editor.reset();
    await show();
  });
};

$('verify').onclick = () => {
  if (profile?.verified) {
    const email = editor.elements.email;
    email.focus();
    email.select();
    email.scrollIntoView({block: 'center'});
    showMessage(['Skriv inn den nye e-postadressen og velg Lagre profil. Den nye adressen må bekreftes.', 'Enter the new email address and select Save profile. You’ll need to verify the new address.']);
    return;
  }
  run(async () => {
    await api('customer/verification', 'POST');
    showMessage(['Bekreftelsen er lagt i utsendingskøen. Sjekk også søppelpost.', 'The verification email is queued. Remember to check your spam folder.']);
  });
};

$('accept').onclick = () => run(async () => {
  const result = await api('customer/invitations/accept', 'POST', {token: inviteToken});
  $('accept').hidden = true;
  showMessage(['Du har nå tilgang til hjemmet.', 'You now have access to the home.']);
  $('open').hidden = false;
  $('open').href = '/';
  $('open').onclick = event => {
    event.preventDefault();
    run(async () => location.assign((await api('customer/homes/' + result.home + '/open', 'POST')).url));
  };
});

$('delete-account').onclick = () => window.smartiDeleteAccount({
  path: 'customer/account', csrf, name: $('account-title').textContent, trigger: $('delete-account'), text,
});

const countries='AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ');
const countryList = document.createElement('datalist');
countryList.id = 'country-options';
document.body.append(countryList);
country.setAttribute('list', 'country-options');

function localizeCountries() {
  const locale = document.documentElement.lang;
  const names = new Intl.DisplayNames([locale], {type: 'region'});
  const previous = country.value;
  const previousDefault = country.defaultValue;
  countryList.replaceChildren(...countries.map(code => names.of(code)).sort((a, b) => a.localeCompare(b, locale)).map(name => new Option(name, name)));
  country.placeholder = text('Søk etter land', 'Search for a country');
  country.defaultValue = names.of('NO');
  country.value = previous === previousDefault && !profile?.country ? country.defaultValue : previous;
}

document.body.classList.add('account-page');
if (creatingAccount) {
  document.body.classList.add('registration-page');
  document.querySelector('#auth details').open = true;
  document.querySelector('.registration-login').hidden = false;
  $('login').hidden = true;
}
document.addEventListener('smarti-auth-language', renderLanguage);
document.addEventListener('smarti-auth-language', localizeCountries);
renderLanguage();
localizeCountries();

(async () => {
  if (verifyToken) await run(async () => {
    await api('customer/verify', 'POST', {token: verifyToken});
    showMessage(['E-postadressen er bekreftet. Fjernaksess er tilgjengelig igjen dersom den var satt på pause.', 'Your email address is verified. Remote access has resumed if it was paused.']);
  });
  try {
    await show();
  } catch {
    $('auth').hidden = false;
  }
})();

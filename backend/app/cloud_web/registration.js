// Shared registration requirements for account and onboarding screens.
(() => {
  const form = document.getElementById('signup');
  if (!form) return;
  const text = (nb, en) => window.smartiAuthLanguage?.text(nb, en) ?? nb;
  const password = form.elements.password;
  const submit = form.querySelector('button[type=submit],button:not([type])');
  const options = document.createElement('fieldset');
  options.className = 'registration-options';
  options.innerHTML = `
    <legend></legend>
    <div class="registration-passwords">
      <label class="confirmation-label">
        <span id="registration-confirmation-label"></span>
        <input name="password_confirmation" type="password" autocomplete="new-password" aria-labelledby="registration-confirmation-label" required maxlength="256">
      </label>
    </div>
    <div class="password-checks" aria-live="polite"><div data-length></div><div data-match></div></div>
    <label class="consent-choice">
      <input type="checkbox" name="terms_accepted" required>
      <span><span class="consent-prefix"></span> <a href="/terms" target="_blank" rel="noopener"></a>.</span>
    </label>`;
  const marketing = document.createElement('label');
  marketing.className = 'marketing-choice';
  marketing.innerHTML = '<input type="checkbox" name="marketing_opt_in"><span></span>';
  submit.before(options, marketing);
  submit.classList.add('primary');
  options.querySelector('.registration-passwords').prepend(password.closest('label'));

  const confirmation = form.elements.password_confirmation;
  function checkPasswords() {
    const match = !!confirmation.value && password.value === confirmation.value;
    confirmation.setCustomValidity(confirmation.value && !match ? text('Passordene er ikke like.', 'The passwords do not match.') : '');
    const checks = [
      ['[data-length]', password.value.length >= 12, text('Minst 12 tegn', 'At least 12 characters')],
      ['[data-match]', match, match ? text('Passordene er like', 'Passwords match') : text('Passordene må være like', 'Passwords must match')],
    ];
    for (const [selector, ok, label] of checks) {
      const line = options.querySelector(selector);
      line.classList.toggle('met', ok);
      line.textContent = (ok ? '✓ ' : '○ ') + label;
    }
  }
  function renderLanguage() {
    options.querySelector('legend').textContent = text('Sikkerhet og samtykke', 'Security and consent');
    options.querySelector('#registration-confirmation-label').textContent = text('Gjenta passord', 'Confirm password');
    options.querySelector('.consent-prefix').textContent = text('Jeg godtar', 'I accept');
    options.querySelector('.consent-choice a').textContent = text('SMARTis bruksvilkår', 'the SMARTi terms of use');
    marketing.querySelector('span').textContent = text(
      'Ja takk, jeg vil motta nyhetsbrev, tips og tilbud fra SMARTi på e-post. Valgfritt – kan slås av på Min konto.',
      'I’d like to receive email newsletters, tips and offers from SMARTi. This is optional. You can turn it off in My account.',
    );
    if (!options.disabled) checkPasswords();
  }

  password.addEventListener('input', checkPasswords);
  confirmation.addEventListener('input', checkPasswords);
  document.addEventListener('smarti-auth-language', renderLanguage);
  renderLanguage();

  window.smartiRegistration = {
    payload: () => ({
      password_confirmation: confirmation.value,
      terms_accepted: form.elements.terms_accepted.checked,
      terms_version: '2026-10-22',
      marketing_opt_in: form.elements.marketing_opt_in.checked,
    }),
    editProfile(optIn) {
      options.hidden = true;
      options.disabled = true;
      confirmation.setCustomValidity('');
      password.disabled = true;
      form.elements.marketing_opt_in.checked = !!optIn;
    },
  };
})();

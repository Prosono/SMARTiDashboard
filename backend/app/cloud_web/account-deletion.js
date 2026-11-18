/* Shared customer/operator confirmation. Eligibility is checked again by the server on DELETE. */
window.smartiDeleteAccount = function ({path, csrf, name, done, trigger, text = nb => nb}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'portal-dialog account-deletion-dialog';
  dialog.setAttribute('aria-labelledby', 'delete-account-title');
  dialog.innerHTML = `<form><h2 id="delete-account-title">${text('Slett konto?', 'Delete account?')}</h2><p class="deletion-name"></p>
    <p>${text('Dette kan ikke angres. Kontaktprofil, profilbilde, innlogginger, samtykker og kontoens supporthistorikk slettes. Alle økter avsluttes. En begrenset administrasjonslogg beholdes uten kontaktprofilen.', 'Deleting this account permanently removes the contact profile, profile photo, sign-in records, consent choices, and support history. All sessions end. SMARTi retains a limited administrative log without the contact profile.')}</p>
    <p>${text('Huber må være frikoblet og medlemskap i hjem fjernet først. Det er ikke nok å slå av huben eller fjernaksessen.', 'Disconnect any hubs and remove any home memberships before deleting the account. Turning off a hub or remote access still leaves it linked to your account.')}</p>
    <p class="deletion-status" role="status">${text('Kontrollerer om kontoen kan slettes …', 'Checking whether the account can be deleted…')}</p>
    <div class="deletion-confirm" hidden><label class="deletion-ack"><input type="checkbox" required> ${text('Jeg forstår at kontoen og opplysningene slettes.', 'I understand that the account and its data will be deleted.')}</label>
    <label>${text('Skriv DELETE for å bekrefte', 'Type DELETE to confirm')}<input name="confirmation" autocomplete="off" autocapitalize="characters" spellcheck="false" required pattern="DELETE"></label></div>
    <div class="dialog-actions"><button type="button">${text('Avbryt', 'Cancel')}</button><button type="submit" class="danger" disabled>${text('Slett konto permanent', 'Permanently delete account')}</button></div></form>`;
  const form = dialog.querySelector('form'), status = dialog.querySelector('.deletion-status');
  const confirm = dialog.querySelector('.deletion-confirm'), check = form.querySelector('input[type=checkbox]');
  const input = form.elements.confirmation, cancel = form.querySelector('button[type=button]'), submit = form.querySelector('button[type=submit]');
  dialog.querySelector('.deletion-name').textContent = name;
  let eligible = false, busy = false;
  const reasons = {
    account_has_hubs: text('Kontoen har fortsatt en hub eller et medlemskap i et hjem. Frikoble huben eller fjern medlemskapet før kontoen slettes.', 'The account is still linked to a hub or a home membership. Disconnect the hub or remove the membership before deleting the account.'),
    last_admin: text('Den siste administratorkontoen kan ikke slettes. Opprett en annen administrator først.', 'Create another administrator before deleting the last administrator account.'),
    onboarding_in_progress: text('Et huboppsett er i gang. Fullfør eller avslutt oppsettet først.', 'Hub setup is in progress. Finish or cancel setup first.'),
  };
  const failure = text('Kunne ikke slette kontoen. Oppdater siden og prøv igjen.', 'Could not delete the account. Refresh the page and try again.');
  async function request(url, method='GET', body) {
    const response = await fetch('/api/'+url, {method, credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},...(body?{body:JSON.stringify(body)}:{})}).catch(() => { throw Error(failure); });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !Object.keys(data).length) throw Error(reasons[data.detail] || (response.status===401?text('Økten er utløpt. Logg inn på nytt.', 'Your session expired. Sign in again.'):failure));
    return data;
  }
  const update = () => {submit.disabled = busy || !eligible || !check.checked || input.value !== 'DELETE';};
  form.addEventListener('input', update);
  cancel.onclick = () => dialog.close();
  dialog.addEventListener('cancel', e => {if(busy)e.preventDefault();});
  dialog.addEventListener('close', () => {dialog.remove();trigger?.focus();});
  form.onsubmit = async e => {
    e.preventDefault();if(submit.disabled)return;
    busy=true;update();cancel.disabled=true;status.textContent=text('Sletter kontoen …', 'Deleting the account…');
    try {
      const result=await request(path,'DELETE',{confirmation:input.value,understood:check.checked});
      dialog.close();
      if(result.self){delete document.documentElement.dataset.portalSession;window.webkit?.messageHandlers?.smartiSession?.postMessage('logout');location.replace('/');}
      else await done?.();
    } catch(error) {status.textContent=error.message;}
    finally {busy=false;cancel.disabled=false;update();}
  };
  document.body.append(dialog);dialog.showModal();cancel.focus();
  request(path+'/deletion').then(result=>{
    if(!dialog.isConnected)return;
    eligible=result.can_delete;confirm.hidden=!eligible;
    status.textContent=eligible?text('Kontoen kan slettes. Bekreft nedenfor.', 'You can delete this account. Confirm below.'):(reasons[result.reason]||text('Kontoen kan ikke slettes nå.', 'You cannot delete the account right now.'));update();
  }).catch(error=>{status.textContent=error.message;});
};

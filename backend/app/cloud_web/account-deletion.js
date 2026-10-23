/* Shared customer/operator confirmation. Eligibility is checked again by the server on DELETE. */
window.smartiDeleteAccount = function ({path, csrf, name, done, trigger}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'portal-dialog account-deletion-dialog';
  dialog.setAttribute('aria-labelledby', 'delete-account-title');
  dialog.innerHTML = `<form><h2 id="delete-account-title">Slett konto?</h2><p class="deletion-name"></p>
    <p>Dette kan ikke angres. Kontaktprofil, profilbilde, innlogginger, samtykker og kontoens supporthistorikk slettes. Alle økter avsluttes. En begrenset administrasjonslogg beholdes uten kontaktprofilen.</p>
    <p>Huber må være frikoblet og medlemskap i hjem fjernet først. Det er ikke nok å slå av huben eller fjernaksessen.</p>
    <p class="deletion-status" role="status">Kontrollerer om kontoen kan slettes …</p>
    <div class="deletion-confirm" hidden><label class="deletion-ack"><input type="checkbox" required> Jeg forstår at kontoen og opplysningene slettes.</label>
    <label>Skriv DELETE for å bekrefte<input name="confirmation" autocomplete="off" autocapitalize="characters" spellcheck="false" required pattern="DELETE"></label></div>
    <div class="dialog-actions"><button type="button">Avbryt</button><button type="submit" class="danger" disabled>Slett konto permanent</button></div></form>`;
  const form = dialog.querySelector('form'), status = dialog.querySelector('.deletion-status');
  const confirm = dialog.querySelector('.deletion-confirm'), check = form.querySelector('input[type=checkbox]');
  const input = form.elements.confirmation, cancel = form.querySelector('button[type=button]'), submit = form.querySelector('button[type=submit]');
  dialog.querySelector('.deletion-name').textContent = name;
  let eligible = false, busy = false;
  const reasons = {account_has_hubs:'Kontoen har fortsatt en hub eller et medlemskap i et hjem. Frikoble huben eller fjern medlemskapet før kontoen slettes.',last_admin:'Den siste administratorkontoen kan ikke slettes. Opprett en annen administrator først.',onboarding_in_progress:'Et huboppsett er i gang. Fullfør eller avslutt oppsettet først.'};
  async function request(url, method='GET', body) {
    const response = await fetch('/api/'+url, {method, credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},...(body?{body:JSON.stringify(body)}:{})});
    const data = await response.json();
    if (!response.ok) throw Error(reasons[data.detail] || (response.status===401?'Økten er utløpt. Logg inn på nytt.':'Kunne ikke slette kontoen. Oppdater siden og prøv igjen.'));
    return data;
  }
  const update = () => {submit.disabled = busy || !eligible || !check.checked || input.value !== 'DELETE';};
  form.addEventListener('input', update);
  cancel.onclick = () => dialog.close();
  dialog.addEventListener('cancel', e => {if(busy)e.preventDefault();});
  dialog.addEventListener('close', () => {dialog.remove();trigger?.focus();});
  form.onsubmit = async e => {
    e.preventDefault();if(submit.disabled)return;
    busy=true;update();cancel.disabled=true;status.textContent='Sletter kontoen …';
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
    status.textContent=eligible?'Kontoen kan slettes. Bekreft nedenfor.':(reasons[result.reason]||'Kontoen kan ikke slettes nå.');update();
  }).catch(error=>{status.textContent=error.message;});
};

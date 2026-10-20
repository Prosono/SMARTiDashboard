window.inviteHomeMember=function(home,api,notify){
 const dialog=document.createElement('dialog');dialog.className='portal-dialog';dialog.setAttribute('aria-labelledby','invite-title');
 dialog.innerHTML='<form><h2 id="invite-title">Legg til ny bruker</h2><p>Personen får en lenke for å opprette sin egen konto og bli med i hjemmet.</p><label>Navn<input name="name" autocomplete="name" required maxlength="120"></label><label>E-post<input name="email" type="email" autocomplete="email" required maxlength="254"></label><p role="status"></p><div class="dialog-actions"><button type="button">Avbryt</button><button type="submit" class="primary">Send invitasjon</button></div></form>';
 const form=dialog.querySelector('form'),status=dialog.querySelector('[role=status]');form.querySelector('[type=button]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove());
 form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('[type=submit]');button.disabled=true;status.textContent='Sender invitasjonen …';try{await api('customer/homes/'+home.installation_id+'/invitations','POST',Object.fromEntries(new FormData(form)));dialog.close();notify('Invitasjon sendt! Sjekk gjerne søppelposten hvis den ikke dukker opp i innboksen.');}catch(error){status.textContent=error.message;button.disabled=false;}};
 document.body.append(dialog);dialog.showModal();
}

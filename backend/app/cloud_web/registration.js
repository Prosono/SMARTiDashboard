// Shared registration requirements for account and onboarding screens.
(()=>{
 const form=document.getElementById('signup');if(!form)return;
 const password=form.elements.password,submit=form.querySelector('button[type=submit],button:not([type])');
 const options=document.createElement('fieldset');options.className='registration-options';
 options.innerHTML='<legend>Sikkerhet og samtykke</legend><label class="confirmation-label">Gjenta passord<input name="password_confirmation" type="password" autocomplete="new-password" required maxlength="256"></label><div class="password-checks" aria-live="polite"><div data-length>○ Minst 12 tegn</div><div data-match>○ Passordene må være like</div></div><label><input type="checkbox" name="terms_accepted" required><span>Jeg godtar <a href="/terms" target="_blank" rel="noopener">SMARTis bruksvilkår</a>.</span></label>';
 const marketing=document.createElement('label');marketing.className='marketing-choice';marketing.innerHTML='<input type="checkbox" name="marketing_opt_in"><span>Ja takk, jeg vil motta nyhetsbrev, tips og tilbud fra SMARTi på e-post. Valgfritt – kan slås av på Min konto.</span>';
 submit.before(options,marketing);submit.classList.add('primary');
 const passwords=document.createElement('div');passwords.className='registration-passwords';
 passwords.append(password.closest('label'),options.querySelector('.confirmation-label'));options.querySelector('legend').after(passwords);
 options.querySelector('input[type=checkbox]').closest('label').className='consent-choice';
 if(location.pathname==='/account'){
   document.body.classList.add('account-page');
   const intro=document.querySelector('.account-intro');
   if(new URLSearchParams(location.search).get('create')==='1'){
     document.body.classList.add('registration-page');
     document.querySelector('main h1').textContent='Ditt hjem starter her.';
     intro.textContent='Opprett SMARTi-kontoen din. Etter e-postbekreftelsen er du klar til å koble til huben.';
     const back=document.createElement('a');back.href='/';back.className='registration-login';back.textContent='Har du en konto? Logg inn';form.after(back);
   }
 }

 const confirmation=form.elements.password_confirmation;
 function check(){const match=!!confirmation.value&&password.value===confirmation.value;confirmation.setCustomValidity(confirmation.value&&!match?'Passordene er ikke like.':'');for(const [selector,ok,text] of [['[data-length]',password.value.length>=12,'Minst 12 tegn'],['[data-match]',match,'Passordene er like']]){const el=options.querySelector(selector);el.classList.toggle('met',ok);el.textContent=(ok?'✓ ':'○ ')+text;}}
 password.addEventListener('input',check);confirmation.addEventListener('input',check);
 window.smartiRegistration={payload:()=>({password_confirmation:confirmation.value,terms_accepted:form.elements.terms_accepted.checked,terms_version:'2026-10-22',marketing_opt_in:form.elements.marketing_opt_in.checked}),editProfile:optIn=>{document.body.classList.remove('registration-page');document.querySelector('main h1').textContent='Din SMARTi-konto';options.hidden=true;options.disabled=true;confirmation.setCustomValidity('');password.disabled=true;form.elements.marketing_opt_in.checked=!!optIn;}};
})();

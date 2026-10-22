// Shared registration requirements for account and onboarding screens.
(()=>{
 const form=document.getElementById('signup');if(!form)return;
 const password=form.elements.password,submit=form.querySelector('button[type=submit],button:not([type])');
 const options=document.createElement('fieldset');options.className='registration-options';
 options.innerHTML='<legend>Passord og vilkår</legend><label style="display:block!important">Gjenta passord<input name="password_confirmation" type="password" autocomplete="new-password" required maxlength="256"></label><div class="password-checks" aria-live="polite"><div data-length>○ Minst 12 tegn</div><div data-match>○ Passordene må være like</div></div><label><input type="checkbox" name="terms_accepted" required><span>Jeg godtar <a href="/terms" target="_blank" rel="noopener">SMARTis bruksvilkår</a>.</span></label>';
 const marketing=document.createElement('label');marketing.className='marketing-choice';marketing.innerHTML='<input type="checkbox" name="marketing_opt_in"><span>Ja takk, jeg vil motta nyhetsbrev, tips og tilbud fra SMARTi på e-post. Valgfritt – kan slås av på Min konto.</span>';
 submit.before(options,marketing);submit.classList.add('primary');
 const confirmation=form.elements.password_confirmation;
 function check(){const match=!!confirmation.value&&password.value===confirmation.value;confirmation.setCustomValidity(confirmation.value&&!match?'Passordene er ikke like.':'');for(const [selector,ok,text] of [['[data-length]',password.value.length>=12,'Minst 12 tegn'],['[data-match]',match,'Passordene er like']]){const el=options.querySelector(selector);el.classList.toggle('met',ok);el.textContent=(ok?'✓ ':'○ ')+text;}}
 password.addEventListener('input',check);confirmation.addEventListener('input',check);
 window.smartiRegistration={payload:()=>({password_confirmation:confirmation.value,terms_accepted:form.elements.terms_accepted.checked,terms_version:'2026-10-22',marketing_opt_in:form.elements.marketing_opt_in.checked}),editProfile:optIn=>{options.hidden=true;options.disabled=true;confirmation.setCustomValidity('');password.disabled=true;form.elements.marketing_opt_in.checked=!!optIn;}};
})();

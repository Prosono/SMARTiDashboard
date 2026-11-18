const text = window.smartiAuthLanguage.text;
const token = new URLSearchParams(location.hash.slice(1)).get("token");
history.replaceState(null, "", "/forgot-password");

const request = document.getElementById("request");
const reset = document.getElementById("reset");
const message = document.getElementById("message");
request.hidden = !!token;
reset.hidden = !token;

for (const form of [request, reset]) {
  form.onsubmit = async (event) => {
    event.preventDefault();
    const button = form.querySelector("button");
    const resetting = form === reset;
    const fallback = text("Kunne ikke fullføre. Kontroller feltene og prøv igjen.", "Could not complete the request. Check the fields and try again.");
    button.disabled = true;
    try {
      const body = Object.fromEntries(new FormData(form));
      if (resetting) {
        if (body.password !== body.password_repeat) {
          message.textContent = text("Passordene må være like.", "The passwords must match.");
          return;
        }
        body.token = token;
      }
      const response = await fetch(`/api/customer/password/${resetting ? "reset" : "forgot"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-SMARTi-Language": window.smartiAuthLanguage.language },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        message.textContent = response.status === 429
          ? text("For mange forsøk. Vent litt og prøv igjen.", "Too many attempts. Wait a while and try again.")
          : response.status === 400
            ? text("Lenken er utløpt eller brukt. Be om en ny lenke.", "The link has expired or was already used. Request a new link.")
            : fallback;
        return;
      }
      form.reset();
      message.textContent = resetting
        ? text("Passordet er endret. Logg inn med det nye passordet.", "Your password has been changed. Sign in with your new password.")
        : text("Hvis adressen er registrert, får du en lenke på e-post. Sjekk også søppelposten.", "If the address is registered, we’ll email you a link. Check your spam folder as well.");
      if (resetting) form.hidden = true;
    } catch {
      message.textContent = fallback;
    } finally {
      button.disabled = false;
    }
  };
}

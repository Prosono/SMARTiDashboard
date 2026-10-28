const $ = (id) => document.getElementById(id);
let csrf = "",
  busy = false,
  releases = [];
const names = {
  core: "SMARTi Core",
  os: "SMARTi OS",
  supervisor: "SMARTi Supervisor",
};
function el(tag, text) {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  return n;
}
async function api(path, method = "GET", body) {
  const r = await fetch("/api/" + path, {
    method,
    credentials: "same-origin",
    signal: AbortSignal.timeout(12000),
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!r.ok)
    throw Error(
      r.status === 401
        ? "Logg inn igjen på adminsiden."
        : r.status === 403
          ? "Du må være portaladministrator for å godkjenne oppdateringer."
          : "Kunne ikke fullføre. Prøv igjen.",
    );
  return r.json();
}
async function run(fn) {
  if (busy) return;
  busy = true;
  $("message").textContent = "";
  try {
    await fn();
  } catch (e) {
    $("message").textContent = e.message;
  } finally {
    busy = false;
  }
}
async function load() {
  releases = await api("admin/releases");
  document.documentElement.dataset.portalSession = "authenticated";
  render();
}
function render() {
  const root = $("releases");
  root.replaceChildren();
  if (!releases.length) {
    root.append(
      el(
        "p",
        "Ingen systemversjoner er rapportert ennå. Du kan også registrere en versjon manuelt.",
      ),
    );
    return;
  }
  for (const r of releases) {
    const card = el("article");
    card.className = "release-card";
    const header = el("header"),
      badge = el(
        "span",
        r.approved ? "Godkjent for kunder" : "Venter på godkjenning",
      );
    badge.className = "release-state" + (r.approved ? " approved" : "");
    header.append(el("h2", names[r.component] + " · " + r.version), badge);
    card.append(header);
    const meta = el(
      "p",
      "Sist endret " + new Date(r.updated * 1000).toLocaleString("nb-NO"),
    );
    meta.className = "release-meta";
    card.append(meta);
    const label = el("label", "Testnotater"),
      notes = el("textarea");
    notes.rows = 3;
    notes.maxLength = 4000;
    notes.value = r.notes;
    label.append(notes);
    card.append(label);
    const actions = el("div");
    actions.className = "release-actions";
    const save = el("button", "Lagre testnotater"),
      decision = el(
        "button",
        r.approved ? "Trekk tilbake godkjenning" : "Godkjenn for kunder",
      );
    decision.className = r.approved ? "" : "primary";
    const write = async (approved) => {
      await api("admin/releases", "POST", {
        component: r.component,
        version: r.version,
        approved,
        notes: notes.value,
      });
      await load();
      $("message").textContent = approved
        ? "Versjonen er godkjent og blir tilgjengelig i SMARTi på huber med godkjenningskontroll."
        : "Versjonen er ikke tilgjengelig for nye installasjoner i SMARTi.";
    };
    save.onclick = () => run(() => write(Boolean(r.approved)));
    decision.onclick = () => {
      const question = r.approved
        ? "Trekke tilbake " + names[r.component] + " " + r.version + "?"
        : "Publisere " +
          names[r.component] +
          " " +
          r.version +
          " til kundene? Bekreft at denne versjonen er testet.";
      if (confirm(question)) run(() => write(!r.approved));
    };
    actions.append(save, decision);
    card.append(actions);
    root.append(card);
  }
}
$("refresh").onclick = () => run(load);
$("release-form").onsubmit = (e) => {
  e.preventDefault();
  run(async () => {
    const data = Object.fromEntries(new FormData(e.target));
    if (
      releases.some(
        (r) => r.component === data.component && r.version === data.version,
      )
    ) {
      throw Error("Versjonen er allerede registrert. Bruk kortet nedenfor.");
    }
    await api("admin/releases", "POST", {
      ...data,
      approved: false,
      notes: "",
    });
    e.target.reset();
    await load();
  });
};
run(async () => {
  csrf = (await api("session")).csrf;
  await load();
});

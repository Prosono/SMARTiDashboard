(() => {
  "use strict";

  const params = new URLSearchParams(location.search);
  const lang = params.get("lang") === "en" ? "en" : "nb";
  const theme = ["light", "dark"].includes(params.get("theme"))
    ? params.get("theme")
    : null;
  const text = (nb, en) => (lang === "en" ? en : nb);
  const select = (id) => document.getElementById(id);
  const status = select("home-status");
  const list = select("home-list");
  const confirm = select("confirm-home");
  const portalLink = select("portal-link");
  const hubId = (name) => {
    const values = params.getAll(name);
    return values.length === 1 &&
      values[0].length === 36 &&
      /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
        values[0],
      )
      ? values[0]
      : null;
  };
  const current = hubId("current");
  const target = hubId("open");
  const standalone = window.self === window.top;

  document.documentElement.lang = lang;
  document.title = text("Mine hjem · SMARTi", "My homes · SMARTi");
  if (theme) document.documentElement.dataset.theme = theme;
  if (standalone) document.documentElement.classList.add("standalone");
  portalLink.textContent = text("Administrer hjem", "Manage homes");
  portalLink.hidden = !standalone;
  list.setAttribute("aria-label", text("Mine hjem", "My homes"));
  status.textContent = text("Henter hjem …", "Loading homes …");

  async function api(path, options = {}) {
    const response = await fetch(`/api/${path}`, {
      credentials: "same-origin",
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
      ...options,
    });
    if (!response.ok)
      throw Object.assign(new Error("Portal request failed"), {
        status: response.status,
      });
    return response.json();
  }

  function showError(error, opening) {
    status.hidden = false;
    if (error.status === 401) {
      status.textContent = text(
        "Logg inn på SMARTi for å se hjemmene dine.",
        "Sign in to SMARTi to see your homes.",
      );
      portalLink.textContent = text("Logg inn", "Sign in");
      portalLink.hidden = false;
    } else if (opening && [403, 404, 409].includes(error.status)) {
      status.textContent = text(
        "Hjemmet er utilgjengelig. Sjekk tilgangen i Mine hjem.",
        "This home is unavailable. Check your access in My homes.",
      );
      portalLink.textContent = text("Gå til Mine hjem", "Go to My homes");
    } else {
      status.textContent = opening
        ? text(
            "Kunne ikke åpne hjemmet. Prøv igjen.",
            "Could not open the home. Try again.",
          )
        : text("Kunne ikke hente hjemmene dine.", "Could not load your homes.");
    }
  }

  function homeStatus(home) {
    if (home.installation_id === current) return text("Åpent nå", "Open now");
    if (home.reset_phase) return text("Krever oppsett", "Setup needed");
    if (home.verification_required)
      return text("Bekreft e-post", "Verify email");
    if (!home.remote_enabled)
      return text("Fjerntilgang av", "Remote access off");
    return home.connected
      ? text("Tilkoblet", "Connected")
      : text("Frakoblet", "Offline");
  }

  function row(home) {
    const selected = home.installation_id === current;
    const available =
      home.connected &&
      home.remote_enabled &&
      !home.verification_required &&
      !home.reset_phase;
    const entry = document.createElement("li");
    const item = document.createElement(available && !selected ? "a" : "div");
    item.className = "home-row";
    if (selected) item.setAttribute("aria-current", "true");
    if (available && !selected) {
      const query = new URLSearchParams({ open: home.installation_id, lang });
      if (theme) query.set("theme", theme);
      item.href = `/home-switcher?${query}`;
      item.target = "_top";
    }
    const marker = document.createElement("i");
    marker.setAttribute("aria-hidden", "true");
    marker.className = `home-marker${available || selected ? " online" : ""}`;
    const details = document.createElement("span");
    const name = document.createElement("strong");
    name.textContent = home.name;
    const state = document.createElement("small");
    state.textContent = homeStatus(home);
    details.append(name, state);
    item.append(marker, details);
    entry.append(item);
    return entry;
  }

  async function showHomes() {
    try {
      const homes = await api("homes");
      const selected = homes.find((home) => home.installation_id === current);
      const others = homes.filter((home) => home.installation_id !== current);
      list.replaceChildren(
        ...(selected ? [row(selected)] : []),
        ...others.map(row),
      );
      list.hidden = homes.length === 0;
      status.hidden = homes.length !== 0;
      status.textContent = text(
        "Ingen hjem er knyttet til kontoen din ennå.",
        "No homes are linked to your account yet.",
      );
    } catch (error) {
      showError(error, false);
    }
  }

  async function openHome() {
    confirm.hidden = true;
    status.textContent = text("Åpner hjem …", "Opening home …");
    try {
      const session = await api("session");
      const result = await api(`customer/homes/${target}/open`, {
        method: "POST",
        headers: { "X-CSRF-Token": session.csrf, "X-SMARTi-Language": lang },
      });
      const url = new URL(result.url);
      if (
        url.origin !== `https://${target}.home.smarti.dev` ||
        url.username ||
        url.password ||
        url.pathname !== "/_account" ||
        url.search !== `?lang=${lang}` ||
        !/^#[A-Za-z0-9_-]{64}$/.test(url.hash)
      ) {
        throw new Error("Invalid home address");
      }
      location.replace(url.href);
    } catch (error) {
      showError(error, true);
      confirm.hidden =
        error.status === 401 || [403, 404, 409].includes(error.status);
    }
  }

  if (target && !params.has("current") && standalone) {
    status.textContent = text(
      "Fortsett for å bytte hjem.",
      "Continue to switch homes.",
    );
    confirm.textContent = text("Åpne hjem", "Open home");
    confirm.addEventListener("click", openHome);
    if (select("switcher").dataset.autoOpen === "true") void openHome();
    else confirm.hidden = false;
  } else {
    void showHomes();
  }
})();

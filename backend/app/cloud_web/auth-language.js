(() => {
  const key = "smarti.portal.auth-language";
  let language = "nb";
  let active = location.pathname !== "/admin/hubs";
  try {
    if (localStorage.getItem(key) === "en") language = "en";
  } catch {
    // The selector still works when the browser blocks storage.
  }
  if (location.pathname === "/account" || location.pathname === "/forgot-password") {
    const requested = new URLSearchParams(location.search).get("lang");
    if (requested === "en") {
      language = requested;
      try { localStorage.setItem(key, language); } catch {}
    }
  }

  const picker = document.getElementById("portal-language");
  const translations = [
    ["textContent", "data-auth-en"],
    ["aria-label", "data-auth-label-en"],
    ["placeholder", "data-auth-placeholder-en"],
    ["alt", "data-auth-alt-en"],
  ].flatMap(([target, attribute]) =>
    Array.from(document.querySelectorAll(`[${attribute}]`), (element) => {
      if (target === "textContent") {
        return { element, target, nb: element.textContent, en: element.getAttribute(attribute) };
      }
      return { element, target, nb: element.getAttribute(target), en: element.getAttribute(attribute) };
    }),
  );

  function apply() {
    const locale = active ? language : "nb";
    document.documentElement.lang = locale;
    for (const translation of translations) {
      const { element, target } = translation;
      const value = translation[locale];
      if (target === "textContent") element.textContent = value;
      else element.setAttribute(target, value);
    }
    if (active) window.webkit?.messageHandlers?.smartiOnboarding?.postMessage({ language });
    document.dispatchEvent(new Event("smarti-auth-language"));
  }

  window.smartiAuthLanguage = {
    get language() { return active ? language : "nb"; },
    text: (nb, en) => (active && language === "en" ? en : nb),
    setActive(value) {
      if (active === value) return;
      active = value;
      apply();
    },
  };
  if (picker) {
    picker.value = language;
    picker.addEventListener("change", () => {
      language = picker.value === "en" ? "en" : "nb";
      try { localStorage.setItem(key, language); } catch {}
      apply();
    });
  }
  apply();
})();

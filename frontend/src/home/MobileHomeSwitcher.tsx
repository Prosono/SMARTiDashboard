import { useState } from "react";
import { ArrowUpRight, House } from "lucide-react";
import type { Home } from "../types";
import { remoteHome } from "../remoteConsole";
import { SettingsDialog } from "./SettingsDialog";
import "./mobileHomeSwitcher.css";

const portal = "https://home.smarti.dev/";

export function homeSwitcherURL(
  location: Pick<Location, "hostname" | "protocol" | "port">,
  lang: string,
  theme: string,
) {
  if (
    location.protocol !== "https:" ||
    location.port ||
    !remoteHome(location.hostname)
  )
    return null;
  const url = new URL("home-switcher", portal);
  url.searchParams.set("current", location.hostname.split(".")[0]);
  url.searchParams.set("lang", lang === "en" ? "en" : "nb");
  url.searchParams.set("theme", theme === "dark" ? "dark" : "light");
  return url.href;
}

export function MobileHomeSwitcher({
  home,
  lang,
}: {
  home: Home;
  lang: string;
}) {
  const [open, setOpen] = useState(false);
  const en = lang === "en";
  const title = en ? "My homes" : "Mine hjem";
  const frame =
    open && window.top === window
      ? homeSwitcherURL(
          window.location,
          lang,
          document.documentElement.dataset.theme || "light",
        )
      : null;

  return (
    <>
      <button
        type="button"
        className="mobile-home-switcher"
        aria-label={title}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <img src="./brand/smarti-logo.png" alt="" />
      </button>
      {open && (
        <SettingsDialog
          title={title}
          lang={lang}
          compact
          onClose={() => setOpen(false)}
        >
          <div className="mobile-home-picker">
            {frame ? (
              <iframe
                title={title}
                src={frame}
                sandbox="allow-scripts allow-same-origin allow-top-navigation-by-user-activation"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="mobile-home-current">
                <House size={22} aria-hidden="true" />
                <span>
                  <strong>{home.home_name}</strong>
                  <small>{en ? "Current home" : "Dette hjemmet"}</small>
                </span>
              </div>
            )}
            <a
              href={portal}
              target="_top"
              rel="noreferrer"
              data-home-grid-leave
            >
              {en ? "Open My homes" : "Åpne Mine hjem"}
              <ArrowUpRight size={17} aria-hidden="true" />
            </a>
          </div>
        </SettingsDialog>
      )}
    </>
  );
}

import { Bell, Search, Settings, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import type { PageSearchAction } from "./PageSearch";
import type { Home } from "./types";
import { HomeAlertsDialog } from "./home/HomeAlerts";
import { overview } from "./home/homeModel";
import { MobileHomeSwitcher } from "./home/MobileHomeSwitcher";
import "./phoneTopbar.css";

export function PhoneTopbarTitle({
  home,
  lang,
  title,
  heading = false,
}: {
  home: Home;
  lang: string;
  title: string;
  heading?: boolean;
}) {
  const Title = heading ? "h1" : "span";
  return (
    <>
      <div className="phone-home-switcher-slot">
        <MobileHomeSwitcher home={home} lang={lang} />
      </div>
      <Title className="phone-page-heading" aria-hidden={!heading || undefined}>
        {title}
      </Title>
    </>
  );
}

export function PhoneTopbarAlerts({
  lang,
  count,
  onOpen,
}: {
  lang: string;
  count: number;
  onOpen: () => void;
}) {
  const en = lang === "en";
  const label = en ? "Show alerts" : "Vis varsler";
  return (
    <button
      type="button"
      className="home-toolbar-alert phone-topbar-alert"
      data-empty={count === 0}
      aria-label={
        count > 0
          ? `${en ? "Needs your attention" : "Trenger din oppmerksomhet"}: ${count}`
          : label
      }
      title={label}
      aria-haspopup="dialog"
      onClick={(event) => {
        event.currentTarget.focus({ preventScroll: true });
        onOpen();
      }}
    >
      <TriangleAlert size={23} aria-hidden="true" />
      <Bell className="phone-alert-bell" size={22} aria-hidden="true" />
      {count > 0 && <span aria-hidden="true">{count}</span>}
    </button>
  );
}

export function WorkspacePhoneTopbar({
  home,
  lang,
  title,
  offline,
  search,
  onSettings,
}: {
  home: Home;
  lang: string;
  title: string;
  offline: boolean;
  search: PageSearchAction | null;
  onSettings?: () => void;
}) {
  const [showAlerts, setShowAlerts] = useState(false);
  const alerts = useMemo(() => overview(home).alerts, [home]);
  const settingsLabel = lang === "en" ? "Open settings" : "Åpne innstillinger";
  return (
    <>
      <header className="phone-topbar workspace-phone-topbar">
        <PhoneTopbarTitle home={home} lang={lang} title={title} />
        <div className="phone-topbar-actions">
          {search && (
            <button
              type="button"
              aria-label={search.label}
              aria-controls={search.controls}
              aria-expanded={search.expanded}
              aria-haspopup={search.popup}
              title={search.label}
              className="page-topbar-search"
              onClick={(event) => {
                event.currentTarget.focus({ preventScroll: true });
                search.open();
              }}
            >
              <Search size={20} aria-hidden="true" />
            </button>
          )}
          <PhoneTopbarAlerts
            lang={lang}
            count={alerts.length}
            onOpen={() => setShowAlerts(true)}
          />
          {onSettings && (
            <button
              type="button"
              aria-label={settingsLabel}
              title={settingsLabel}
              onClick={onSettings}
            >
              <Settings size={20} aria-hidden="true" />
            </button>
          )}
        </div>
      </header>
      {showAlerts && (
        <HomeAlertsDialog
          alerts={alerts}
          home={home}
          lang={lang}
          offline={offline}
          onClose={() => setShowAlerts(false)}
        />
      )}
    </>
  );
}

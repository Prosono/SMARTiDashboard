import { Bell, MapPin, TriangleAlert, type LucideIcon } from "lucide-react";
import { useState } from "react";
import type { Home } from "../types";
import { HomeDeviceSearch } from "./HomeDeviceSearch";
import { HomePageToolButtons, type useHomePageTools } from "./HomePageTools";
import { MobileHomeSwitcher } from "./MobileHomeSwitcher";
import "./homeToolbar.css";

export function HomeToolbar({
  home,
  lang,
  title,
  date,
  alerts,
  tools,
  offline,
  openAlerts,
  searchDevices,
  LocationIcon = MapPin,
}: {
  home: Home;
  lang: string;
  title: string;
  date: Date;
  alerts: number;
  tools: ReturnType<typeof useHomePageTools>;
  offline: boolean;
  openAlerts: () => void;
  searchDevices: boolean;
  LocationIcon?: LucideIcon;
}) {
  const en = lang === "en";
  const alertLabel = en ? "Show alerts" : "Vis varsler";
  const [searchOpen, setSearchOpen] = useState(false);
  return (
    <header className="home-toolbar">
      <div className="home-location">
        <LocationIcon size={15} aria-hidden="true" />
        <span>{home.home_name}</span>
        <span className="home-date">
          {date.toLocaleDateString(en ? "en-GB" : "nb-NO", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </span>
      </div>
      <div className="phone-home-switcher-slot">
        <MobileHomeSwitcher home={home} lang={lang} />
      </div>
      <h1 className="phone-page-heading">{title}</h1>
      <div className="home-toolbar-actions">
        <HomePageToolButtons
          tools={tools}
          lang={lang}
          openSearch={searchDevices ? () => setSearchOpen(true) : undefined}
          alert={
            <button
              type="button"
              className="home-toolbar-alert"
              data-empty={alerts === 0}
              aria-label={
                alerts > 0
                  ? `${en ? "Needs your attention" : "Trenger din oppmerksomhet"}: ${alerts}`
                  : alertLabel
              }
              title={alertLabel}
              aria-haspopup="dialog"
              onClick={openAlerts}
            >
              <TriangleAlert size={23} aria-hidden="true" />
              <Bell className="phone-alert-bell" size={22} aria-hidden="true" />
              {alerts > 0 && <span aria-hidden="true">{alerts}</span>}
            </button>
          }
        />
      </div>
      {searchDevices && searchOpen && (
        <HomeDeviceSearch
          home={home}
          lang={lang}
          offline={offline}
          onClose={() => setSearchOpen(false)}
        />
      )}
    </header>
  );
}

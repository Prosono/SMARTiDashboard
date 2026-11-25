import { MapPin, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { PhoneTopbarAlerts, PhoneTopbarTitle } from "../PhoneTopbar";
import type { Home } from "../types";
import { HomeDeviceSearch } from "./HomeDeviceSearch";
import { HomePageToolButtons, type useHomePageTools } from "./HomePageTools";
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
  const [searchOpen, setSearchOpen] = useState(false);
  return (
    <header className="home-toolbar phone-topbar">
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
      <PhoneTopbarTitle home={home} lang={lang} title={title} heading />
      <div className="home-toolbar-actions phone-topbar-actions">
        <HomePageToolButtons
          tools={tools}
          lang={lang}
          openSearch={searchDevices ? () => setSearchOpen(true) : undefined}
          alert={
            <PhoneTopbarAlerts lang={lang} count={alerts} onOpen={openAlerts} />
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

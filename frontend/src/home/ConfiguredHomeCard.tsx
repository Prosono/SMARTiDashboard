import { useContext, useState, type ReactNode } from "react";
import { Activity, ChevronRight, WifiOff } from "lucide-react";
import type { Home } from "../types";
import type { CardConfig } from "./homeGridModel";
import {
  CardIcon,
  CardPresentation,
  CardTitle,
  cardImageURL,
} from "./CardPresentation";
import { HomeDeviceCard } from "./HomeDeviceCard";
import { MultiSourceCard } from "./MultiSourceCard";
import { MetricDeviceRenderer } from "./MetricDetails";
import { SettingsDialog } from "./SettingsDialog";
import { EquipmentArtwork } from "./EquipmentArtwork";
import { numeric, reading, usable, temperature } from "./homeModel";
import { CameraCard } from "./HomeMedia";
import { controlState } from "../controlState";
import { isAmbientType } from "./ambientModel";
import { AmbientCard } from "./AmbientCard";

function StatusCard({
  config,
  home,
  offline,
  lang,
}: {
  config: CardConfig;
  home: Home;
  offline: boolean;
  lang: string;
}) {
  const render = useContext(MetricDeviceRenderer);
  const [opened, open] = useState(false);
  const c = home.controls.find((c) => c.entity_id === config.sources[0]);
  const available = !!c && !offline && home.connected && usable(c);
  const en = lang === "en";
  const title =
    config.title || c?.name || (en ? "Device unavailable" : "Enhet mangler");
  const status = !available
    ? en
      ? "Unavailable"
      : "Utilgjengelig"
    : c.domain === "climate" && temperature(c) !== null
      ? `${temperature(c)!.toLocaleString(en ? "en-GB" : "nb-NO", { maximumFractionDigits: 1 })} °C`
      : c.domain === "media_player" &&
          ["playing", "paused", "idle", "standby"].includes(c.state)
        ? {
            playing: en ? "Playing" : "Spiller",
            paused: en ? "Paused" : "På pause",
            idle: en ? "Ready" : "Klar",
            standby: en ? "Standby" : "Hvilemodus",
          }[c.state as "playing"]
        : c.domain === "sensor" && numeric(c) !== null
          ? reading(c, lang)
          : controlState(c, c.state, lang);
  const photo =
    config.type === "picture"
      ? cardImageURL(config.image === "auto" ? "living" : config.image)
      : undefined;
  return (
    <>
      <button
        className="personal-status-card"
        data-picture={!!photo}
        onClick={() => c && open(true)}
        disabled={!c || !render}
      >
        {photo && <img className="personal-status-photo" src={photo} alt="" />}
        <header>
          <CardIcon fallback={Activity} size={24} />
          <strong>
            <CardTitle>{title}</CardTitle>
          </strong>
          <ChevronRight size={17} />
        </header>
        <small>
          {home.areas.find((area) => area.area_id === c?.area_id)?.name ||
            (en ? "No room" : "Uten rom")}
        </small>
        <div>
          <strong>{status}</strong>
          {config.type !== "picture" && c && (
            <EquipmentArtwork c={c} available={available} />
          )}
        </div>
        {!available && (
          <span>
            <WifiOff size={14} />
            {en ? "Waiting for a current status" : "Venter på fersk status"}
          </span>
        )}
      </button>
      {opened && c && render && (
        <SettingsDialog title={title} lang={lang} onClose={() => open(false)}>
          {c.domain === "camera" ? (
            <CameraCard c={c} lang={lang} offline={offline} />
          ) : (
            render(c)
          )}
        </SettingsDialog>
      )}
    </>
  );
}
export function ConfiguredHomeCard({
  config,
  home,
  offline,
  lang,
  original,
  originalEntity,
}: {
  config: CardConfig;
  home: Home;
  offline: boolean;
  lang: string;
  original?: ReactNode;
  originalEntity?: string;
}) {
  const source = home.controls.find((c) => c.entity_id === config.sources[0]);
  let content: ReactNode;
  if (isAmbientType(config.type))
    content = <AmbientCard config={config} home={home} lang={lang} />;
  else if (config.type === "graph")
    content = (
      <MultiSourceCard
        config={config}
        home={home}
        lang={lang}
        offline={offline}
      />
    );
  else if (config.type !== "auto")
    content = (
      <StatusCard config={config} home={home} offline={offline} lang={lang} />
    );
  else if (
    original &&
    (!config.sources.length || config.sources[0] === originalEntity)
  )
    content = original;
  else if (source)
    content = (
      <HomeDeviceCard c={source} home={home} lang={lang} offline={offline} />
    );
  else
    content = (
      <StatusCard config={config} home={home} offline={offline} lang={lang} />
    );
  return (
    <CardPresentation.Provider value={config}>
      {content}
    </CardPresentation.Provider>
  );
}

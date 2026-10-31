import { ChevronRight } from "lucide-react";
import type { Home } from "../types";
import { roomMood } from "./HomeOverview";
import { temperature, usable } from "./homeModel";
import { GridLightingCard } from "./GridLightingCard";
import { TemperatureValue } from "./TemperatureValue";

export function RoomSummaryCard({
  home,
  area,
  lang,
  offline,
  open,
}: {
  home: Home;
  area: { area_id: string; name: string };
  lang: string;
  offline: boolean;
  open: () => void;
}) {
  const { Icon } = roomMood(area.name);
  const controls = home.controls.filter(
    (c) => !c.diagnostic && c.area_id === area.area_id,
  );
  const thermostat = controls.find(
    (c) => c.domain === "climate" && usable(c) && temperature(c) !== null,
  );
  const readings = thermostat
    ? [temperature(thermostat)!]
    : controls
        .filter(
          (c) =>
            c.domain === "sensor" &&
            c.attributes.device_class === "temperature" &&
            usable(c),
        )
        .flatMap((c) => (temperature(c) !== null ? [temperature(c)!] : []));
  const value =
    !offline && home.connected && readings.length
      ? readings.reduce((sum, value) => sum + value, 0) / readings.length
      : null;
  return (
    <section className="equipment-room-summary">
      <button
        className="grid-card-heading"
        onClick={open}
        aria-label={`${lang === "en" ? "Open room" : "Åpne rom"} ${area.name}`}
      >
        <Icon size={25} />
        <strong>{area.name}</strong>
        <ChevronRight size={17} />
      </button>
      <div className="equipment-room-reading">
        <strong>
          <TemperatureValue value={value} lang={lang} />
        </strong>
        <Icon size={85} strokeWidth={0.7} aria-hidden="true" />
      </div>
      {controls.some((c) => c.domain === "light") ? (
        <GridLightingCard
          home={home}
          areaId={area.area_id}
          lang={lang}
          offline={offline}
          open={open}
          compact
        />
      ) : (
        <p>
          {controls.length}{" "}
          {lang === "en" ? "devices in this room" : "enheter i rommet"}
        </p>
      )}
    </section>
  );
}

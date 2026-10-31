import { useContext, useState } from "react";
import type { Control, Home } from "../types";
import { HomeGrid, type HomeGridCard } from "./HomeGrid";
import type { HomeGridPage } from "./homeGridModel";
import { HarmonyDevices } from "./HarmonyDevices";
import { MediaCard } from "./Multimedia";
import { VacuumCard } from "./Cleaning";
import { HomeMetric } from "./HomeMetrics";
import { MetricDeviceRenderer } from "./MetricDetails";
import { SettingsDialog } from "./SettingsDialog";

function SensorCard({
  c,
  home,
  offline,
  lang,
}: {
  c: Control;
  home: Home;
  offline: boolean;
  lang: string;
}) {
  const render = useContext(MetricDeviceRenderer);
  const [opened, open] = useState(false);
  const kind =
    c.attributes.device_class === "humidity"
      ? "humidity"
      : ["W", "kW", "Wh", "kWh"].includes(
            String(c.attributes.unit_of_measurement),
          )
        ? "energy"
        : "temperature";
  return (
    <>
      <HomeMetric
        control={c}
        kind={kind}
        enhanced
        offline={offline}
        lang={lang}
        open={() => open(true)}
      />
      {opened && render && (
        <SettingsDialog title={c.name} lang={lang} onClose={() => open(false)}>
          {render(c)}
        </SettingsDialog>
      )}
    </>
  );
}

export function deviceGridCards({
  controls,
  home,
  offline,
  lang,
  visible,
}: {
  controls: Control[];
  home: Home;
  offline: boolean;
  lang: string;
  visible?: Set<string>;
}): HomeGridCard[] {
  return controls.slice(0, 290).map((c) => ({
    id: `device:${c.entity_id}`,
    entityId: c.entity_id,
    title: c.name,
    hidden: visible ? !visible.has(c.entity_id) : false,
    content:
      c.domain === "media_player" ? (
        <MediaCard
          c={c}
          home={home}
          lang={lang}
          offline={offline}
          photo={new URL("home/home-multimedia.webp", document.baseURI).href}
        />
      ) : c.domain === "vacuum" ? (
        <VacuumCard c={c} home={home} lang={lang} offline={offline} simple />
      ) : c.domain === "sensor" &&
        ["°C", "°F", "%", "W", "kW", "Wh", "kWh"].includes(
          String(c.attributes.unit_of_measurement),
        ) &&
        ["temperature", "humidity", "power", "energy"].includes(
          String(c.attributes.device_class),
        ) ? (
        <SensorCard c={c} home={home} lang={lang} offline={offline} />
      ) : (
        <HarmonyDevices
          controls={[c]}
          home={home}
          lang={lang}
          offline={offline}
        />
      ),
  }));
}

export function HomeDeviceGrid({
  page,
  controls,
  home,
  offline,
  lang,
  visible,
}: {
  page: HomeGridPage;
  controls: Control[];
  home: Home;
  offline: boolean;
  lang: string;
  visible?: Set<string>;
}) {
  return (
    <HomeGrid
      page={page}
      cards={deviceGridCards({ controls, home, offline, lang, visible })}
      lang={lang}
    />
  );
}

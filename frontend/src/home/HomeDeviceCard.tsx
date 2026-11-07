import { useContext, useState } from "react";
import type { Control, Home } from "../types";
import { HarmonyDevices } from "./HarmonyDevices";
import { MediaCard } from "./Multimedia";
import { VacuumCard } from "./Cleaning";
import { HomeMetric } from "./HomeMetrics";
import { MetricDeviceRenderer } from "./MetricDetails";
import { SettingsDialog } from "./SettingsDialog";
import { CameraCard } from "./HomeMedia";

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
        deviceArtwork
        offline={offline || !home.connected}
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
export function HomeDeviceCard({
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
  if (c.domain === "camera")
    return (
      <CameraCard c={c} lang={lang} offline={offline || !home.connected} />
    );
  if (c.domain === "media_player")
    return (
      <MediaCard
        c={c}
        home={home}
        lang={lang}
        offline={offline || !home.connected}
        photo={new URL("home/home-multimedia.webp", document.baseURI).href}
      />
    );
  if (c.domain === "vacuum")
    return (
      <VacuumCard
        c={c}
        home={home}
        lang={lang}
        offline={offline || !home.connected}
        simple
      />
    );
  if (
    c.domain === "sensor" &&
    ["°C", "°F", "%", "W", "kW", "Wh", "kWh"].includes(
      String(c.attributes.unit_of_measurement),
    ) &&
    ["temperature", "humidity", "power", "energy"].includes(
      String(c.attributes.device_class),
    )
  )
    return (
      <SensorCard
        c={c}
        home={home}
        lang={lang}
        offline={offline || !home.connected}
      />
    );
  return (
    <HarmonyDevices
      controls={[c]}
      home={home}
      lang={lang}
      offline={offline || !home.connected}
    />
  );
}

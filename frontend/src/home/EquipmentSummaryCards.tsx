import { useContext, useState } from "react";
import {
  Battery,
  ChevronRight,
  Network,
  TriangleAlert,
  WifiOff,
} from "lucide-react";
import type { Control, Home } from "../types";
import type { HomeGridCard } from "./HomeGrid";
import { MetricDeviceRenderer } from "./MetricDetails";
import { SettingsDialog } from "./SettingsDialog";
import { finiteReading } from "./equipmentModel";
import { numeric, overview, usable } from "./homeModel";
import { controlState } from "../controlState";
import { integrationName } from "../branding";
import { CardIcon, CardTitle } from "./CardPresentation";

function SummaryCard({
  kind,
  home,
  lang,
  offline,
  openDevices,
}: {
  kind: "alerts" | "batteries" | "connection";
  home: Home;
  lang: string;
  offline: boolean;
  openDevices: () => void;
}) {
  const en = lang === "en",
    t = (nb: string, english: string) => (en ? english : nb);
  const render = useContext(MetricDeviceRenderer);
  const [selected, select] = useState<Control | null>(null);
  const labels = {
    alerts: t("Varsler", "Alerts"),
    batteries: t("Batterier", "Batteries"),
    connection: t("Hub og tilkoblinger", "Hub and connections"),
  };
  const Icon =
    kind === "alerts"
      ? TriangleAlert
      : kind === "batteries"
        ? Battery
        : Network;
  const connected = !offline && home.connected;
  const alerts = overview(home).alerts;
  const batteries = home.controls
    .flatMap((c) => {
      if (
        c.domain === "sensor" &&
        c.attributes.device_class === "battery" &&
        c.attributes.unit_of_measurement === "%"
      ) {
        const value = finiteReading(numeric(c), 0, 100);
        return value !== null ? [{ c, value }] : [];
      }
      const value = finiteReading(c.attributes.battery_level, 0, 100);
      const sensorExists =
        c.device_id &&
        home.controls.some(
          (item) =>
            item.device_id === c.device_id &&
            item.domain === "sensor" &&
            item.attributes.device_class === "battery",
        );
      return value !== null && usable(c) && !sensorExists ? [{ c, value }] : [];
    })
    .sort((a, b) => a.value - b.value);
  const sources = [
    ...new Set(
      home.controls.flatMap((c) => (c.integration ? [c.integration] : [])),
    ),
  ];
  const devices = new Set(
    home.controls.flatMap((c) => (c.device_id ? [c.device_id] : [])),
  ).size;
  return (
    <section className="equipment-summary-card" data-kind={kind}>
      <button className="grid-card-heading" onClick={openDevices}>
        <CardIcon fallback={Icon} size={24} />
        <strong>
          <CardTitle>{labels[kind]}</CardTitle>
        </strong>
        <ChevronRight size={17} />
      </button>
      {kind === "alerts" ? (
        <>
          <strong className="equipment-summary-number">
            {alerts.length} {t("varsler", "alerts")}
          </strong>
          {!connected && (
            <p className="equipment-summary-note">
              {t(
                "Sist rapporterte status. Venter på forbindelse.",
                "Last reported status. Waiting for connection.",
              )}
            </p>
          )}
          <div className="equipment-summary-rows">
            {alerts.slice(0, 3).map((c) => (
              <button
                key={c.id}
                onClick={() => (render ? select(c) : openDevices())}
              >
                <TriangleAlert size={20} />
                <span>
                  <strong>{c.name}</strong>
                  <small>
                    {controlState(
                      c,
                      usable(c) ? c.state : c.availability,
                      lang,
                    )}
                  </small>
                </span>
                <ChevronRight size={15} />
              </button>
            ))}
          </div>
          {!alerts.length && (
            <p className="equipment-summary-note">
              {connected
                ? t("Ingen registrerte avvik.", "No reported issues.")
                : t("Ingen ferske målinger ennå.", "No current readings yet.")}
            </p>
          )}
        </>
      ) : kind === "batteries" ? (
        <div className="equipment-summary-rows">
          {connected && batteries.length ? (
            batteries.slice(0, 3).map(({ c, value }) => (
              <button
                key={c.id}
                onClick={() => (render ? select(c) : openDevices())}
              >
                <Battery size={22} />
                <span>
                  <strong>
                    {c.name}
                    <b>{value} %</b>
                  </strong>
                  <progress
                    className="equipment-battery-progress"
                    max={100}
                    value={value}
                    data-low={value < 20}
                    aria-label={`${c.name}: ${value} %`}
                  />
                </span>
              </button>
            ))
          ) : (
            <p className="equipment-summary-note">
              {t(
                "Ingen tilgjengelige batterimålinger.",
                "No available battery readings.",
              )}
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="equipment-connection-reading">
            <img
              src={new URL("brand/smarti-hub.png", document.baseURI).href}
              alt=""
            />
            <div>
              <strong>
                <i data-connected={connected} />
                {connected
                  ? t("Tilkoblet", "Connected")
                  : t("Frakoblet", "Disconnected")}
              </strong>
              <small>
                {devices} {t("enheter", "devices")}
              </small>
            </div>
          </div>
          <p className="equipment-summary-note">
            {t("Forbindelse til hjemmet", "Connection to your home")}
          </p>
          <div className="equipment-connection-sources">
            {sources.slice(0, 3).map((source) => (
              <div key={source}>
                <Network size={16} />
                <span>{integrationName(source)}</span>
                <small>
                  {home.controls.filter((c) => c.integration === source).length}{" "}
                  {t("målepunkter", "signals")}
                </small>
              </div>
            ))}
          </div>
          {!connected && (
            <p className="equipment-summary-note">
              <WifiOff size={15} />
              {t(
                "Styring venter på forbindelse.",
                "Controls are waiting for a connection.",
              )}
            </p>
          )}
        </>
      )}
      {selected && render && (
        <SettingsDialog
          title={selected.name}
          lang={lang}
          onClose={() => select(null)}
        >
          {render(selected)}
        </SettingsDialog>
      )}
    </section>
  );
}

export function equipmentSummaryCards(
  home: Home,
  lang: string,
  offline: boolean,
  openDevices: () => void,
): HomeGridCard[] {
  return (["alerts", "batteries", "connection"] as const).map((kind) => ({
    id: `summary:${kind}`,
    title: {
      alerts: lang === "en" ? "Alerts" : "Varsler",
      batteries: lang === "en" ? "Batteries" : "Batterier",
      connection: lang === "en" ? "Hub and connections" : "Hub og tilkoblinger",
    }[kind],
    defaultHidden: true,
    content: (
      <SummaryCard
        kind={kind}
        home={home}
        lang={lang}
        offline={offline}
        openDevices={openDevices}
      />
    ),
  }));
}

import {
  Activity,
  Cpu,
  HardDrive,
  MemoryStick,
  CircleCheck,
  CircleAlert,
  CircleHelp,
} from "lucide-react";
import { SystemGraph } from "./SystemGraph";
import type { System } from "./HomeSettings";
import type { Home } from "../types";
export function metricLevel(value: number | null | undefined) {
  return value == null || !Number.isFinite(value)
    ? "unknown"
    : value < 40
      ? "good"
      : value <= 70
        ? "moderate"
        : "high";
}
export function HubStatus({
  system,
  home,
  lang,
  stale,
}: {
  system?: System;
  home: Home;
  lang: string;
  stale: boolean;
}) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const number = (n: number | null | undefined, unit: string) =>
    n == null || !Number.isFinite(n)
      ? "—"
      : `${n.toLocaleString(lang === "en" ? "en-GB" : "nb-NO", { maximumFractionDigits: 1 })} ${unit}`;
  const s = system,
    disk =
      s?.host.disk_total != null &&
      s.host.disk_total > 0 &&
      s.host.disk_used != null
        ? (s.host.disk_used / s.host.disk_total) * 100
        : null;
  const metrics = [
    {
      key: "cpu" as const,
      Icon: Cpu,
      label: t("Prosessor", "Processor"),
      value: s?.core.cpu_percent,
      detail: t(
        "SMARTi-kjerne · kan overstige 100 % med flere kjerner",
        "SMARTi core · may exceed 100% across multiple cores",
      ),
    },
    {
      key: "memory" as const,
      Icon: MemoryStick,
      label: t("Minne", "Memory"),
      value: s?.core.memory_percent,
      detail: `${number(s?.core.memory_usage == null ? null : s.core.memory_usage / 1048576, "MiB")} / ${number(s?.core.memory_limit == null ? null : s.core.memory_limit / 1048576, "MiB")}`,
    },
    {
      key: "storage" as const,
      Icon: HardDrive,
      label: t("Lagring", "Storage"),
      value: disk,
      detail: `${number(s?.host.disk_free, "GB")} ${t("ledig av", "free of")} ${number(s?.host.disk_total, "GB")}`,
    },
  ];
  const status = stale ? "unknown" : home.connected ? "good" : "high";
  return (
    <section className="hub-overview" aria-label="SMARTi Hub">
      <div className="hub-product">
        <img src="brand/smarti-hub.png" alt="SMARTi Hub" />
        <div>
          <span className="eyebrow">SMARTi HUB</span>
          <h2>{t("Hjertet i hjemmet ditt", "The heart of your home")}</h2>
          <span className={`hub-connection metric-${status}`}>
            <Activity size={17} />
            {stale
              ? t("Status må oppdateres", "Status needs refreshing")
              : home.connected
                ? t("Tilkoblet hjemmesentralen", "Connected to controller")
                : t(
                    "Ingen forbindelse til sentralen",
                    "Controller disconnected",
                  )}
          </span>
          <small>
            {home.ha_version
              ? `SMARTi ${home.ha_version}`
              : t("Versjon utilgjengelig", "Version unavailable")}
          </small>
        </div>
      </div>
      <div className="hub-readings">
        <div className="section-heading">
          <h3>{t("Systemstatus", "System status")}</h3>
          <span className="muted">
            {t("Oppdateres hvert 30. sekund", "Refreshes every 30 seconds")}
          </span>
        </div>
        <div className="system-metrics">
          {metrics.map(({ key, Icon, label, value, detail }) => {
            const level = stale ? "unknown" : metricLevel(value);
            const StateIcon =
              level === "good"
                ? CircleCheck
                : level === "unknown"
                  ? CircleHelp
                  : CircleAlert;
            return (
              <article
                key={key}
                className={`metric-${level}`}
                data-metric={key}
              >
                <SystemGraph
                  history={s?.history || []}
                  metric={key}
                  unit={key === "storage" ? "GB" : "%"}
                  lang={lang}
                />
                <Icon className="metric-icon" />
                <h3>{label}</h3>
                <strong>{stale ? "—" : number(value, "%")}</strong>
                <span className="metric-status">
                  <StateIcon size={15} />
                  {level === "good"
                    ? t("Lav belastning", "Low usage")
                    : level === "moderate"
                      ? t("Moderat bruk", "Moderate usage")
                      : level === "high"
                        ? t("Høy belastning", "High usage")
                        : t("Ukjent", "Unknown")}
                </span>
                <small>{detail}</small>
              </article>
            );
          })}
        </div>
        <p className="metric-legend">
          {t(
            "Grønt < 40 % · Oransje 40–70 % · Rødt > 70 %. Lagring viser brukt plass.",
            "Green < 40% · Orange 40–70% · Red > 70%. Storage shows used space.",
          )}
        </p>
      </div>
    </section>
  );
}

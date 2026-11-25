import { useContext, useState } from "react";
import { BatteryLow, ChevronRight, TriangleAlert } from "lucide-react";
import type { Home } from "../types";
import { controlState } from "../controlState";
import { deviceName } from "./deviceMetadata";
import { usable, type DashboardAlert } from "./homeModel";
import { MetricDeviceRenderer } from "./MetricDetails";
import { SettingsDialog } from "./SettingsDialog";
import "./homeAlerts.css";

export function alertTitle(alert: DashboardAlert, home: Home) {
  return alert.kind === "battery"
    ? deviceName(alert.control, home) || alert.control.name
    : alert.control.name;
}

export function alertStatus(alert: DashboardAlert, lang: string) {
  if (alert.kind === "battery") {
    const text = lang === "en" ? "Low battery" : "Lavt batteri";
    const level = alert.level?.toLocaleString(
      lang === "en" ? "en-GB" : "nb-NO",
    );
    return level === undefined ? text : `${text}: ${level} %`;
  }
  const c = alert.control;
  return controlState(c, usable(c) ? c.state : c.availability, lang);
}

export function HomeAlertsDialog({
  alerts,
  home,
  lang,
  offline,
  onClose,
  onOpenSecurity,
}: {
  alerts: DashboardAlert[];
  home: Home;
  lang: string;
  offline: boolean;
  onClose: () => void;
  onOpenSecurity?: () => void;
}) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const render = useContext(MetricDeviceRenderer);
  const [selectedId, select] = useState<string | null>(null);
  const selected = home.controls.find((c) => c.id === selectedId);

  return (
    <SettingsDialog
      title={t("Trenger din oppmerksomhet", "Needs your attention")}
      lang={lang}
      compact
      phoneSafeArea
      onClose={onClose}
    >
      {offline && (
        <p className="home-alert-note">
          {t(
            "Forbindelsen er brutt. Viser sist rapporterte status.",
            "Connection lost. Showing the last reported status.",
          )}
        </p>
      )}
      {alerts.length ? (
        <ul className="home-alert-list">
          {alerts.map((alert) => {
            const { control: c, kind } = alert;
            const name = alertTitle(alert, home);
            const status = alertStatus(alert, lang);
            const area = home.areas.find((a) => a.area_id === c.area_id)?.name;
            const Icon = kind === "battery" ? BatteryLow : TriangleAlert;
            const content = (
              <>
                <Icon
                  aria-hidden="true"
                  size={22}
                  className="home-alert-icon"
                />
                <span className="home-alert-label">
                  <strong>{name}</strong>
                  <small>{[status, area].filter(Boolean).join(" · ")}</small>
                </span>
              </>
            );
            return (
              <li key={`${kind}:${c.id}`} data-kind={kind}>
                {render ? (
                  <button
                    type="button"
                    className="home-alert-item"
                    aria-haspopup="dialog"
                    onClick={() => select(c.id)}
                  >
                    {content}
                    <ChevronRight size={16} aria-hidden="true" />
                  </button>
                ) : (
                  <div className="home-alert-item">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="home-alert-note">
          {t("Ingen aktive varsler rapportert.", "No active alerts reported.")}
        </p>
      )}
      {onOpenSecurity && alerts.some((alert) => alert.kind === "security") && (
        <button
          type="button"
          className="home-customize"
          onClick={onOpenSecurity}
        >
          {t("Åpne sikkerhet", "Open security")}
          <ChevronRight size={17} aria-hidden="true" />
        </button>
      )}
      {selected && render && (
        <SettingsDialog
          title={selected.name}
          presentation="device"
          lang={lang}
          onClose={() => select(null)}
        >
          <div className="metric-device-detail">{render(selected)}</div>
        </SettingsDialog>
      )}
    </SettingsDialog>
  );
}

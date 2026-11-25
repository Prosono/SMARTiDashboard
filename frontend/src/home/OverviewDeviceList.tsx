import { useEffect, useId, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight, LoaderCircle } from "lucide-react";
import { api } from "../api";
import {
  deviceWorkspaceRoom,
  deviceWorkspaceRoomId,
  deviceWorkspaceStatus,
} from "../deviceWorkspaceModel";
import type { Control, Home } from "../types";
import { DeviceArtwork } from "./DeviceArtwork";
import { finiteReading, lightPercentage } from "./equipmentModel";
import { usable } from "./homeModel";
import "./overviewDeviceList.css";

export type OverviewDeviceKind =
  "lighting" | "climate" | "media" | "locks" | "covers" | "readings";

type ListProps = {
  home: Home;
  lang: string;
  offline: boolean;
  kind: OverviewDeviceKind;
  controls: readonly Control[];
  onSelect: (control: Control) => void;
};

type ListEntry =
  { key: string; room: string } | { key: string; control: Control };

function roomRows(
  controls: readonly Control[],
  home: Home,
  lang: string,
  section: string,
): ListEntry[] {
  const rooms = new Map(
    home.areas.map(({ area_id }) => [area_id, [] as Control[]]),
  );
  rooms.set("", []);
  for (const control of controls) {
    rooms.get(deviceWorkspaceRoomId(control, home))?.push(control);
  }
  const entries: ListEntry[] = [];
  for (const [room, devices] of rooms) {
    if (devices.length === 0) continue;
    entries.push({
      key: `${section}/room/${room}`,
      room: deviceWorkspaceRoom(devices[0], home, lang),
    });
    for (const control of devices)
      entries.push({ key: `device/${control.id}`, control });
  }
  return entries;
}

function isLit(control: Control) {
  return usable(control) && control.state === "on";
}

const playerStates = new Map([
  ["playing", ["Spiller", "Playing"]],
  ["paused", ["På pause", "Paused"]],
  ["idle", ["Klar", "Ready"]],
  ["standby", ["Standby", "Standby"]],
  ["buffering", ["Laster …", "Buffering …"]],
]);

function rowStatus(control: Control, lang: string, offline: boolean) {
  const status = deviceWorkspaceStatus(control, lang, offline);
  if (offline || !usable(control)) return status;
  if (["climate", "humidifier"].includes(control.domain)) {
    const parts: string[] = [];
    const measured = finiteReading(control.attributes.current_temperature);
    const humidity = finiteReading(control.attributes.current_humidity, 0, 100);
    const format = (value: number) =>
      value.toLocaleString(lang === "en" ? "en-GB" : "nb-NO", {
        maximumFractionDigits: 1,
      });
    if (measured !== null) {
      const unit =
        control.attributes.temperature_unit ||
        control.capabilities.find(({ kind }) => kind === "temperature")?.unit;
      const value = format(measured);
      parts.push(typeof unit === "string" && unit ? `${value} ${unit}` : value);
    }
    if (humidity !== null) parts.push(`${format(humidity)} %`);
    if (parts.length > 0) return { ...status, label: parts.join(" · ") };
  }
  if (control.domain === "media_player") {
    const label = playerStates.get(control.state);
    if (label) return { ...status, label: label[lang === "en" ? 1 : 0] };
  }
  if (control.domain === "light" && isLit(control)) {
    const level = lightPercentage(control);
    if (level !== null)
      return { ...status, label: `${status.label} · ${level} %` };
  }
  return status;
}

/** Keep each control in the same keyed list when its on/off section changes. */
export function OverviewDeviceList({
  home,
  lang,
  offline,
  kind,
  controls,
  onSelect,
}: ListProps) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const disconnected = offline || !home.connected;
  const lighting = kind === "lighting";
  const permitted =
    !home.permissions || home.permissions.includes("lights.control");
  const active = lighting && !disconnected ? controls.filter(isLit) : [];
  const others =
    active.length > 0
      ? controls.filter((control) => !isLit(control))
      : controls;
  const entries = [
    ...roomRows(active, home, lang, "on"),
    ...(active.length > 0 && others.length > 0
      ? [{ key: "other-lights", room: t("Andre lys", "Other lights") }]
      : []),
    ...roomRows(others, home, lang, "other"),
  ];
  if (entries.length === 0) {
    return (
      <p className="overview-device-list-empty">
        {t("Ingen enheter å vise.", "No devices to show.")}
      </p>
    );
  }
  return (
    <ul className="overview-device-list" role="list">
      {entries.map((entry) =>
        "control" in entry ? (
          <OverviewDeviceRow
            key={entry.key}
            control={entry.control}
            lang={lang}
            offline={disconnected}
            adjustable={lighting && entry.control.domain === "light"}
            permitted={permitted}
            onSelect={onSelect}
          />
        ) : (
          <li
            key={entry.key}
            role="presentation"
            className="overview-device-list-heading"
            data-section={entry.key === "other-lights" || undefined}
          >
            {entry.key === "other-lights" ? (
              <h3>{entry.room}</h3>
            ) : (
              <p>{entry.room}</p>
            )}
          </li>
        ),
      )}
    </ul>
  );
}

function OverviewDeviceRow({
  control,
  lang,
  offline,
  adjustable,
  permitted,
  onSelect,
}: Omit<ListProps, "controls" | "kind" | "home"> & {
  control: Control;
  adjustable: boolean;
  permitted: boolean;
}) {
  const id = useId();
  const query = useQueryClient();
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<"on" | "off" | "failed" | null>(
    null,
  );
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const status = rowStatus(control, lang, offline);
  const active = adjustable && !offline && isLit(control);
  const action = active ? "turn_off" : "turn_on";
  const supportsPower = control.capabilities.some((cap) =>
    cap.actions.includes(action),
  );
  const showSwitch = adjustable && permitted && supportsPower;
  const blocked = !showSwitch || offline || !usable(control);
  const confirmed =
    feedback !== null && feedback !== "failed" && feedback === control.state;
  useEffect(() => {
    if (confirmed) setFeedback(null);
  }, [confirmed]);

  async function toggle() {
    if (blocked || running.current) return;
    running.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await api<{ status: string }>(
        `controls/${encodeURIComponent(control.entity_id)}/commands`,
        "POST",
        { action },
      );
      if (result.status === "failed") setFeedback("failed");
      else if (result.status === "accepted_unconfirmed") {
        setFeedback(active ? "off" : "on");
      }
    } catch {
      setFeedback("failed");
    } finally {
      await query.invalidateQueries({ queryKey: ["home"] });
      running.current = false;
      setBusy(false);
    }
  }

  return (
    <li className="overview-device-list-row" data-active={active || undefined}>
      <button
        type="button"
        className="overview-device-list-open"
        aria-label={`${t("Åpne", "Open")} ${control.name}`}
        aria-describedby={`${id}-status`}
        aria-haspopup="dialog"
        onClick={() => onSelect(control)}
      >
        <DeviceArtwork
          c={control}
          available={!offline && usable(control)}
          size={38}
        />
        <strong>{control.name}</strong>
        <span
          id={`${id}-status`}
          className="overview-device-list-status"
          data-tone={status.tone}
        >
          {status.label}
        </span>
        <ChevronRight size={16} aria-hidden="true" />
      </button>
      {showSwitch && (
        <button
          type="button"
          className="overview-device-list-power"
          role="switch"
          aria-label={control.name}
          aria-checked={active}
          aria-disabled={busy || undefined}
          aria-busy={busy || undefined}
          disabled={blocked}
          onClick={() => void toggle()}
        >
          {busy ? (
            <LoaderCircle size={18} className="spin" aria-hidden="true" />
          ) : (
            <span aria-hidden="true" />
          )}
        </button>
      )}
      {feedback && !confirmed && (
        <p
          className="overview-device-list-feedback"
          role={feedback === "failed" ? "alert" : "status"}
        >
          {feedback === "failed"
            ? t(
                "Kunne ikke bekrefte endringen. Sjekk lyset før du prøver igjen.",
                "Could not confirm the change. Check the light before retrying.",
              )
            : t(
                "Sendt. Venter på bekreftelse fra lyset.",
                "Sent. Waiting for the light to confirm.",
              )}
        </p>
      )}
    </li>
  );
}

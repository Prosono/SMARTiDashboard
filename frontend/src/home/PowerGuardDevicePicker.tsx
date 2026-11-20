import { useState } from "react";
import {
  CarFront,
  Droplet,
  House,
  Plug,
  Plus,
  Search,
  Thermometer,
} from "lucide-react";
import { SettingsDialog } from "./SettingsDialog";

export type PowerGuardMeter = { id: string; name: string };

export type PowerGuardDevice = {
  id: string;
  name: string;
  room: string | null;
  kind: "switch" | "climate";
  state: string;
  power_meter?: PowerGuardMeter | null;
  power_meters?: PowerGuardMeter[];
  automatic_power_meter_id?: string | null;
  power_watts?: number | null;
  paused_watts?: number | null;
};

export function powerGuardDeviceIcon(device: PowerGuardDevice | undefined) {
  const name = device?.name.toLowerCase() ?? "";
  if (/(elbil|charger|car charging|easee|zaptec|wallbox)/.test(name))
    return CarFront;
  if (/(bereder|water heater|hot water)/.test(name)) return Droplet;
  return device?.kind === "climate" ? Thermometer : Plug;
}

type DeviceFilter = "all" | PowerGuardDevice["kind"];

export function PowerGuardDevicePicker({
  lang,
  devices,
  remainingSlots,
  disabled,
  onAdd,
  onClose,
}: {
  lang: string;
  devices: PowerGuardDevice[];
  remainingSlots: number;
  disabled: boolean;
  onAdd: (ids: string[]) => void;
  onClose: () => void;
}) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<DeviceFilter>("all");
  const [selection, setSelection] = useState<string[]>([]);
  const available = new Set(devices.map(({ id }) => id));
  const chosen = selection.filter((id) => available.has(id));
  const limitReached = chosen.length >= remainingSlots;
  const terms = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const groups = new Map<string | null, PowerGuardDevice[]>();
  const typeLabels = {
    switch: t("Bryter", "Switch"),
    climate: t("Termostat", "Thermostat"),
  };
  const noRoom = t("Uten rom", "No room");

  for (const device of devices) {
    if (filter !== "all" && device.kind !== filter) continue;
    const text =
      `${device.name} ${device.room ?? noRoom} ${typeLabels[device.kind]}`.toLocaleLowerCase();
    if (!terms.every((term) => text.includes(term))) continue;
    const room = device.room || null;
    const group = groups.get(room);
    if (group) group.push(device);
    else groups.set(room, [device]);
  }

  const collator = new Intl.Collator(lang === "en" ? "en" : "nb", {
    numeric: true,
    sensitivity: "base",
  });
  const orderedGroups = [...groups].sort(([a], [b]) => {
    if (a === null) return 1;
    if (b === null) return -1;
    return collator.compare(a, b);
  });
  const filters: { value: DeviceFilter; label: string }[] = [
    { value: "all", label: t("Alle", "All") },
    { value: "switch", label: t("Brytere", "Switches") },
    { value: "climate", label: t("Termostater", "Thermostats") },
  ];

  return (
    <SettingsDialog
      lang={lang}
      compact
      title={t("Legg til enheter", "Add devices")}
      onClose={onClose}
    >
      <div className="power-guard-picker">
        <div className="power-guard-picker-tools">
          <p>
            {t(
              "Velg enhetene PowerGuard kan sette på pause. Du kan velge effektmåler eller oppgi effekten selv.",
              "Choose the devices PowerGuard can pause. You can select a power meter or enter the power yourself.",
            )}
          </p>
          <label className="power-guard-picker-search">
            <Search size={20} aria-hidden="true" />
            <input
              type="search"
              aria-label={t(
                "Søk etter enhet eller rom",
                "Search for a device or room",
              )}
              placeholder={t(
                "Søk etter enhet eller rom",
                "Search for a device or room",
              )}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <div
            className="power-guard-picker-filters"
            role="group"
            aria-label={t("Filtrer på enhetstype", "Filter by device type")}
          >
            {filters.map(({ value, label }) => (
              <button
                type="button"
                key={value}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="power-guard-picker-list">
          {orderedGroups.map(([room, items]) => (
            <section key={room === null ? "unassigned" : `room:${room}`}>
              <h3>
                <House size={16} aria-hidden="true" /> {room ?? noRoom}
              </h3>
              <ul role="list">
                {items
                  .sort((a, b) => collator.compare(a.name, b.name))
                  .map((device) => {
                    const Icon = powerGuardDeviceIcon(device);
                    const selected = chosen.includes(device.id);
                    const stateLabel =
                      device.state === "on"
                        ? t("På", "On")
                        : device.state === "off"
                          ? t("Av", "Off")
                          : t("Utilgjengelig", "Unavailable");
                    return (
                      <li key={device.id}>
                        <label
                          className="power-guard-picker-option"
                          data-selected={selected}
                        >
                          <span
                            className="power-guard-load-icon"
                            aria-hidden="true"
                          >
                            <Icon size={21} />
                          </span>
                          <span className="power-guard-picker-device">
                            <strong>{device.name}</strong>
                            <small>
                              {typeLabels[device.kind]}
                              {device.automatic_power_meter_id
                                ? ` · ${t("Effektmåler", "Power meter")}`
                                : device.power_meters?.length
                                  ? ` · ${t("Måler kan velges", "Meter available")}`
                                  : ""}
                            </small>
                          </span>
                          {!disabled && (
                            <small
                              className="power-guard-picker-state"
                              data-state={device.state}
                            >
                              {stateLabel}
                            </small>
                          )}
                          <input
                            type="checkbox"
                            aria-label={
                              device.room
                                ? `${device.name} · ${device.room}`
                                : device.name
                            }
                            checked={selected}
                            disabled={disabled || (limitReached && !selected)}
                            onChange={() =>
                              setSelection(
                                selected
                                  ? chosen.filter((id) => id !== device.id)
                                  : [...chosen, device.id],
                              )
                            }
                          />
                        </label>
                      </li>
                    );
                  })}
              </ul>
            </section>
          ))}
          {!orderedGroups.length && (
            <div className="power-guard-picker-empty" role="status">
              <Search size={25} aria-hidden="true" />
              <p>
                {devices.length
                  ? t(
                      "Ingen enheter matcher søket.",
                      "No devices match your search.",
                    )
                  : t(
                      "Ingen flere enheter kan legges til.",
                      "There are no more devices to add.",
                    )}
              </p>
              {devices.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setFilter("all");
                  }}
                >
                  {t("Nullstill filtre", "Reset filters")}
                </button>
              )}
            </div>
          )}
        </div>

        <footer className="power-guard-picker-footer">
          <div role="status">
            <strong>
              {chosen.length} {t("valgt", "selected")}
            </strong>
            {(disabled || limitReached) && (
              <small>
                {disabled
                  ? t(
                      "Endringer er midlertidig utilgjengelige.",
                      "Changes are temporarily unavailable.",
                    )
                  : t(
                      "Enhetsgrensen er nådd.",
                      "The device limit has been reached.",
                    )}
              </small>
            )}
          </div>
          <button
            type="button"
            className="power-guard-save"
            disabled={
              disabled || !chosen.length || chosen.length > remainingSlots
            }
            onClick={() => onAdd(chosen)}
          >
            <Plus size={18} aria-hidden="true" />
            {t("Legg til valgte", "Add selected")}
          </button>
        </footer>
      </div>
    </SettingsDialog>
  );
}

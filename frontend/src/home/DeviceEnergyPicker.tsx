import { useState } from "react";
import { Check, Gauge, Plug, Search, Sparkles } from "lucide-react";
import { SettingsDialog } from "./SettingsDialog";

export type DeviceEnergyMeter = {
  id: string;
  name: string;
  room: string | null;
  kind: "energy" | "power";
  meter: string;
  unit: "kWh" | "Wh" | "kW" | "W";
  group: string;
  automatic: boolean;
};

export function DeviceEnergyPicker({
  lang,
  meters,
  selection,
  limit,
  automatic,
  busy,
  failed,
  onSave,
  onClose,
}: {
  lang: string;
  meters: DeviceEnergyMeter[];
  selection: string[];
  limit: number;
  automatic: boolean;
  busy: boolean;
  failed: boolean;
  onSave: (selection: string[] | null) => void;
  onClose: () => void;
}) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const locale = lang === "en" ? "en-GB" : "nb-NO";
  const [search, setSearch] = useState("");
  const [chosen, setChosen] = useState(() => {
    const available = new Set(meters.map(({ id }) => id));
    return new Set(selection.filter((id) => available.has(id)));
  });
  const noRoom = t("Uten rom", "No room");
  const terms = search
    .trim()
    .toLocaleLowerCase(locale)
    .split(/\s+/)
    .filter(Boolean);
  const groups = new Map<string | null, DeviceEnergyMeter[]>();
  for (const meter of meters) {
    const label =
      `${meter.name} ${meter.meter} ${meter.room || noRoom}`.toLocaleLowerCase(
        locale,
      );
    if (terms.some((term) => !label.includes(term))) continue;
    const room = meter.room || null;
    const group = groups.get(room);
    if (group) group.push(meter);
    else groups.set(room, [meter]);
  }
  const collator = new Intl.Collator(locale, {
    numeric: true,
    sensitivity: "base",
  });
  const chosenByGroup = new Map(
    meters
      .filter(({ id }) => chosen.has(id))
      .map(({ group, id }) => [group, id]),
  );
  const ordered = [...groups].sort(([a], [b]) => {
    if (a === null) return 1;
    if (b === null) return -1;
    return collator.compare(a, b);
  });

  return (
    <SettingsDialog
      title={t("Velg enheter å følge", "Choose devices to track")}
      lang={lang}
      compact
      busy={busy}
      onClose={onClose}
    >
      <div className="device-energy-picker">
        <p>
          {t(
            "Velg én måler per enhet for å se forbruk og estimert kostnad.",
            "Choose one meter per device to see usage and estimated costs.",
          )}
        </p>
        <label className="device-energy-search">
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            aria-label={t(
              "Søk etter enhet eller rom",
              "Search by device or room",
            )}
            placeholder={t(
              "Søk etter enhet eller rom",
              "Search by device or room",
            )}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <div className="device-energy-catalog">
          {ordered.map(([room, group]) => (
            <section key={room === null ? "unassigned" : `room:${room}`}>
              <h3>{room ?? noRoom}</h3>
              <ul role="list">
                {group
                  .sort((a, b) => collator.compare(a.name, b.name))
                  .map((meter) => {
                    const selected = chosen.has(meter.id);
                    const alternate = chosenByGroup.get(meter.group);
                    const Icon = meter.kind === "power" ? Gauge : Plug;
                    return (
                      <li key={meter.id}>
                        <label
                          className="device-energy-option"
                          data-selected={selected || undefined}
                        >
                          <Icon size={18} aria-hidden="true" />
                          <span>
                            <strong>{meter.name}</strong>
                            <small>
                              {meter.meter ? `${meter.meter} · ` : ""}
                              {meter.kind === "power"
                                ? t("Effektmåler", "Power meter")
                                : t("Energimåler", "Energy meter")}{" "}
                              ({meter.unit})
                            </small>
                          </span>
                          {meter.automatic && (
                            <small className="device-energy-auto">
                              {t("Funnet automatisk", "Detected automatically")}
                            </small>
                          )}
                          <input
                            type="checkbox"
                            checked={selected}
                            aria-label={[
                              meter.name,
                              meter.meter !== meter.name && meter.meter,
                              room,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                            disabled={
                              busy || (!alternate && chosen.size >= limit)
                            }
                            onChange={() =>
                              setChosen((previous) => {
                                const next = new Set(previous);
                                if (selected) next.delete(meter.id);
                                else {
                                  if (alternate) next.delete(alternate);
                                  next.add(meter.id);
                                }
                                return next;
                              })
                            }
                          />
                        </label>
                      </li>
                    );
                  })}
              </ul>
            </section>
          ))}
          {ordered.length === 0 && (
            <p className="device-energy-picker-empty" role="status">
              {meters.length
                ? t(
                    "Ingen match. Prøv et annet navn eller rom.",
                    "No matches. Try a different device name or room.",
                  )
                : t(
                    "Fant ingen målere som rapporterer energi eller effekt.",
                    "No meters that report energy or power were found.",
                  )}
            </p>
          )}
        </div>
        {failed && (
          <p className="device-energy-picker-error" role="alert">
            {t(
              "Kunne ikke lagre valget. Prøv igjen.",
              "Couldn’t save your choices. Try again.",
            )}
          </p>
        )}
        <footer>
          <span role="status">
            {t(
              `${chosen.size} av ${limit} valgt`,
              `${chosen.size} of ${limit} selected`,
            )}
          </span>
          {!automatic && (
            <button
              type="button"
              className="device-energy-auto-action"
              disabled={busy}
              onClick={() => onSave(null)}
            >
              <Sparkles size={16} aria-hidden="true" />{" "}
              {t("Bruk automatisk valg", "Use automatic selection")}
            </button>
          )}
          <button
            type="button"
            className="device-energy-save"
            disabled={busy}
            onClick={() => onSave([...chosen])}
          >
            <Check size={17} aria-hidden="true" />
            {busy ? t("Lagrer…", "Saving…") : t("Lagre valg", "Save selection")}
          </button>
        </footer>
      </div>
    </SettingsDialog>
  );
}

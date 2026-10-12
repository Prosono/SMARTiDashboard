import { entityState } from "./entityWords";
import { useRef, useState } from "react";
import {
  Search,
  DoorOpen,
  Activity,
  Thermometer,
  Lightbulb,
  Plug,
  Radio,
  Check,
  ChevronRight,
  X,
} from "lucide-react";
import type { Home } from "../types";
import { words } from "./shared";
export type EntityChoice = { entity_id: string; name: string };
export function EntityPicker({
  value,
  onChange,
  choices,
  home,
  lang,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  choices: EntityChoice[];
  home: Home;
  lang: string;
  label: string;
}) {
  const t = (nb: string, en: string) => words(lang, nb, en);
  const dialog = useRef<HTMLDialogElement>(null),
    opener = useRef<HTMLButtonElement>(null);
  const [search, setSearch] = useState(""),
    [area, setArea] = useState("*");
  const control = (id: string) => home.controls.find((c) => c.entity_id === id);
  const room = (id: string) =>
    home.areas.find((a) => a.area_id === control(id)?.area_id)?.name ||
    t("Uten rom", "No room");
  const icon = (id: string) => {
    const c = control(id),
      type = c?.attributes.device_class;
    return ["door", "window", "opening"].includes(String(type))
      ? DoorOpen
      : type === "temperature"
        ? Thermometer
        : ["motion", "occupancy", "presence"].includes(String(type))
          ? Activity
          : id.startsWith("light.")
            ? Lightbulb
            : id.startsWith("switch.")
              ? Plug
              : Radio;
  };
  const selected = choices.find((c) => c.entity_id === value);
  const Icon = icon(value);
  const visible = choices.filter(
    (c) =>
      (area === "*" || (control(c.entity_id)?.area_id || "none") === area) &&
      (c.name + " " + room(c.entity_id))
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()),
  );
  const areas = [
    ...new Set(choices.map((c) => control(c.entity_id)?.area_id || "none")),
  ];
  function close() {
    dialog.current?.close();
    opener.current?.focus();
  }
  return (
    <div className="entity-picker">
      <button
        ref={opener}
        className="entity-picker-opener"
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        onClick={() => {
          setSearch("");
          setArea("*");
          dialog.current?.showModal();
        }}
      >
        <Icon size={24} />
        <span>
          <strong>
            {selected?.name || value || t("Velg enhet", "Choose device")}
          </strong>
          <small>
            {value
              ? room(value)
              : t("Finn etter rom eller navn", "Find by room or name")}
          </small>
        </span>
        <ChevronRight size={18} />
      </button>
      <dialog
        ref={dialog}
        className="entity-dialog"
        aria-label={label}
        onCancel={() => opener.current?.focus()}
        onClick={(e) => {
          if (e.target === dialog.current) close();
        }}
      >
        <div className="entity-dialog-head">
          <div>
            <span className="eyebrow">{t("Hjemmet ditt", "Your home")}</span>
            <h2>{label}</h2>
          </div>
          <button
            type="button"
            aria-label={t("Lukk enhetsvalg", "Close device picker")}
            onClick={close}
          >
            <X size={20} />
          </button>
        </div>
        <div className="entity-search">
          <Search size={20} />
          <input
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") e.preventDefault();
            }}
            aria-label={t("Søk etter navn eller rom", "Search by name or room")}
            placeholder={t(
              "Hvilken enhet ser du etter?",
              "Which device are you looking for?",
            )}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div
          className="entity-room-filter"
          aria-label={t("Filtrer på rom", "Filter by room")}
        >
          <button
            type="button"
            aria-pressed={area === "*"}
            onClick={() => setArea("*")}
          >
            {t("Alle rom", "All rooms")}
          </button>
          {areas.map((id) => (
            <button
              type="button"
              key={id}
              aria-pressed={area === id}
              onClick={() => setArea(id)}
            >
              {home.areas.find((a) => a.area_id === id)?.name ||
                t("Uten rom", "No room")}
            </button>
          ))}
        </div>
        <div className="entity-results">
          <p role="status">
            {visible.length}{" "}
            {visible.length === 1
              ? t("enhet", "device")
              : t("enheter", "devices")}
          </p>
          {areas
            .filter((id) =>
              visible.some(
                (c) => (control(c.entity_id)?.area_id || "none") === id,
              ),
            )
            .map((id) => (
              <section key={id}>
                <h3>
                  {home.areas.find((a) => a.area_id === id)?.name ||
                    t("Uten rom", "No room")}
                </h3>
                <div className="entity-card-grid">
                  {visible
                    .filter(
                      (c) => (control(c.entity_id)?.area_id || "none") === id,
                    )
                    .map((c) => {
                      const Glyph = icon(c.entity_id),
                        known = control(c.entity_id);
                      const unavailable = known?.availability === "unavailable";
                      return (
                        <button
                          type="button"
                          key={c.entity_id}
                          aria-pressed={value === c.entity_id}
                          onClick={() => {
                            onChange(c.entity_id);
                            close();
                          }}
                        >
                          <Glyph size={26} />
                          <span>
                            <strong>{c.name}</strong>
                            <small>
                              {unavailable
                                ? t("Frakoblet", "Offline")
                                : known
                                  ? entityState(
                                      c.entity_id,
                                      known.state,
                                      home,
                                      lang,
                                    ) +
                                    (known.attributes.unit_of_measurement
                                      ? " " +
                                        known.attributes.unit_of_measurement
                                      : "")
                                  : t(
                                      "Status ikke tilgjengelig",
                                      "Status unavailable",
                                    )}
                            </small>
                          </span>
                          {value === c.entity_id && <Check size={18} />}
                        </button>
                      );
                    })}
                </div>
              </section>
            ))}
          {!visible.length && (
            <div className="entity-empty">
              <Search size={28} />
              <h3>{t("Ingen treff her", "No matches here")}</h3>
              <p>
                {t(
                  "Prøv et annet navn eller velg alle rom.",
                  "Try another name or choose all rooms.",
                )}
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setArea("*");
                }}
              >
                {t("Vis alle enheter", "Show all devices")}
              </button>
            </div>
          )}
        </div>
      </dialog>
    </div>
  );
}

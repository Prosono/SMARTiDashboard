import { useEffect, useMemo, useState } from "react";
import { ChartNoAxesCombined, Search, ScrollText } from "lucide-react";
import { DeviceArtwork } from "./home/DeviceArtwork";
import {
  filterHouseLog,
  houseLogCategory,
  houseLogCategories,
  houseLogDays,
  houseLogMessage,
  type HouseLogEntry,
} from "./houseLogModel";
import type { Control, Home } from "./types";

export function HouseLogTimeline({
  entries,
  home,
  controls,
  lang,
  onInspect,
}: {
  entries: HouseLogEntry[];
  home: Home;
  controls: Control[];
  lang: string;
  onInspect?: (entityId: string) => void;
}) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const [search, setSearch] = useState("");
  const [area, setArea] = useState("");
  const [category, setCategory] = useState("");
  const [limit, setLimit] = useState(50);
  const byId = useMemo(
    () => new Map(controls.map((c) => [c.entity_id, c])),
    [controls],
  );
  const filtered = useMemo(
    () => filterHouseLog(entries, byId, { text: search, area, category }, lang),
    [entries, byId, search, area, category, lang],
  );
  useEffect(() => setLimit(50), [entries, search, area, category]);
  const days = houseLogDays(filtered.slice(0, limit), lang);
  const hasFilter = !!(search || area || category);
  const clear = () => {
    setSearch("");
    setArea("");
    setCategory("");
  };
  return (
    <div className="house-log-view">
      <div
        className="house-log-filters"
        role="search"
        aria-label={t("Søk i husloggen", "Search activity log")}
      >
        <label className="house-log-search">
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={t("Søk i hendelser", "Search events")}
            placeholder={t(
              "Søk etter hendelse, enhet eller opphav …",
              "Search event, device or source …",
            )}
          />
        </label>
        <label>
          {t("Rom", "Room")}
          <select
            aria-label={t("Rom", "Room")}
            value={area}
            onChange={(e) => setArea(e.target.value)}
          >
            <option value="">{t("Alle rom", "All rooms")}</option>
            {home.areas.map((room) => (
              <option key={room.area_id} value={room.area_id}>
                {room.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("Hendelsestype", "Event category")}
          <select
            aria-label={t("Hendelsestype", "Event category")}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">{t("Alle hendelser", "All events")}</option>
            {houseLogCategories.map(([id, nb, en]) => (
              <option key={id} value={id}>
                {t(nb, en)}
              </option>
            ))}
          </select>
        </label>
        {hasFilter && (
          <button type="button" onClick={clear}>
            {t("Nullstill filtre", "Clear filters")}
          </button>
        )}
      </div>
      <p className="house-log-count" role="status">
        {t(
          `Viser ${Math.min(limit, filtered.length)} av ${filtered.length} hendelser i utvalget · nyeste først`,
          `Showing ${Math.min(limit, filtered.length)} of ${filtered.length} matching events · newest first`,
        )}
      </p>
      {!filtered.length ? (
        <div className="history-empty">
          <ScrollText size={32} aria-hidden="true" />
          <h2>
            {hasFilter
              ? t(
                  "Ingen treff i de hentede hendelsene",
                  "No matching events in this selection",
                )
              : t(
                  "Ingen hendelser i dette tidsrommet",
                  "No activity in this period",
                )}
          </h2>
          <p>
            {hasFilter
              ? t(
                  "Prøv et annet søk eller nullstill filtrene.",
                  "Try another search or clear the filters.",
                )
              : t(
                  "Velg et annet tidsrom for å se registrerte hendelser.",
                  "Choose another period to see recorded events.",
                )}
          </p>
          {hasFilter && (
            <button type="button" onClick={clear}>
              {t(
                "Vis alle hendelser i utvalget",
                "Show all events in this selection",
              )}
            </button>
          )}
        </div>
      ) : (
        days.map((day) => (
          <section
            className="house-log-day"
            key={day.key}
            aria-label={day.title}
          >
            <h3>{day.title}</h3>
            <ol className="house-log">
              {day.entries.map((entry, index) => {
                const control = byId.get(entry.entity_id || "");
                const kind = houseLogCategory(entry, control);
                const label = houseLogCategories.find(([id]) => id === kind)!;
                const validTime = Number.isFinite(Date.parse(entry.when));
                return (
                  <li key={`${entry.when}-${index}`}>
                    <time dateTime={validTime ? entry.when : undefined}>
                      {validTime
                        ? new Date(entry.when).toLocaleTimeString(
                            lang === "en" ? "en-GB" : "nb-NO",
                            {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            },
                          )
                        : t("Ukjent tid", "Unknown time")}
                    </time>
                    <span className="house-log-marker" aria-hidden="true">
                      {control ? (
                        <DeviceArtwork c={control} size={32} />
                      ) : (
                        <ScrollText size={20} />
                      )}
                    </span>
                    <div className="house-log-entry">
                      <span className="house-log-kind">
                        {t(label[1], label[2])}
                      </span>
                      <strong>
                        {entry.name ||
                          control?.name ||
                          entry.entity_id ||
                          t("Hjemmet", "Home")}
                      </strong>
                      <p>{houseLogMessage(entry, control, lang)}</p>
                      {entry.context_name && (
                        <small>
                          {t("Registrert opphav", "Recorded source")}:{" "}
                          {entry.context_name}
                        </small>
                      )}
                      {control && onInspect && (
                        <button
                          type="button"
                          className="house-log-inspect"
                          aria-label={t(
                            `Vis historikk for ${control.name}`,
                            `View history for ${control.name}`,
                          )}
                          onClick={() => onInspect(control.entity_id)}
                        >
                          <ChartNoAxesCombined size={16} aria-hidden="true" />
                          {t("Se utvikling i graf", "Explore in chart")}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        ))
      )}
      {filtered.length > limit && (
        <button
          type="button"
          className="house-log-more"
          onClick={() => setLimit((value) => value + 50)}
        >
          {t("Vis flere hendelser", "Show more events")}
        </button>
      )}
      {entries.length > 0 && (
        <p className="note house-log-note">
          {t(
            "Opphav vises bare når det er registrert. Grafvisningen viser målinger og tilstander over tid.",
            "Sources appear only when recorded. Charts show measurements and states over time.",
          )}
        </p>
      )}
    </div>
  );
}

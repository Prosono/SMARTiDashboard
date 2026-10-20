import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
  History,
  ListFilter,
  Download,
} from "lucide-react";
import { api } from "./api";
import { HistoryChart, type HistoryData } from "./ControlHistory";
import { controlState } from "./controlState";
import type { Control, Home } from "./types";
import "./historyExplorer.css";

type Entry = {
  when: string;
  name: string | null;
  entity_id: string | null;
  state: string | null;
  message: string | null;
  context_name: string | null;
  context_entity_id: string | null;
};
type Series = HistoryData & { entity_id: string; truncated: boolean };
const localDate = (date: Date) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
export function HistoryExplorer({
  home,
  lang,
  activity,
}: {
  home: Home;
  lang: string;
  activity: boolean;
}) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const [selected, select] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [area, setArea] = useState("");
  const [domain, setDomain] = useState("");
  const [sources, showSources] = useState(() => window.innerWidth > 900);
  const [range, setRange] = useState(() => ({
    start: new Date(Date.now() - 86400000).toISOString(),
    end: new Date().toISOString(),
  }));
  const [draft, setDraft] = useState(() => ({
    start: localDate(new Date(range.start)),
    end: localDate(new Date(range.end)),
  }));
  const [error, setError] = useState("");
  const catalog = useQuery({
    queryKey: ["history-entities"],
    queryFn: () => api<Control[]>("history/entities"),
    staleTime: 60000,
  });
  const controls = catalog.data || home.controls;
  const params = new URLSearchParams({
    ...range,
    entity_ids: selected.join(","),
  });
  const events = useQuery({
    queryKey: ["house-log", range, selected],
    queryFn: () =>
      api<{ entries: Entry[]; truncated: boolean }>(
        `history/activity?${params}`,
      ),
    enabled: activity,
    staleTime: 30000,
  });
  const history = useQuery({
    queryKey: ["history-explorer", range, selected],
    queryFn: () => api<{ series: Series[] }>(`history/states?${params}`),
    enabled: !activity && selected.length > 0,
    staleTime: 30000,
  });
  const query = activity ? events : history;
  const choices = controls.filter(
    (c) =>
      (!area || c.area_id === area) &&
      (!domain || c.domain === domain) &&
      `${c.name} ${c.entity_id}`
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()),
  );
  function changeRange(start: Date, end: Date) {
    if (
      !Number.isFinite(+start) ||
      !Number.isFinite(+end) ||
      +end <= +start ||
      +end - +start > 31 * 86400000 ||
      +end > Date.now() + 60000
    ) {
      setError(
        t(
          "Velg et gyldig tidsrom på opptil 31 dager, frem til nå.",
          "Choose a valid period of up to 31 days, ending no later than now.",
        ),
      );
      return;
    }
    setError("");
    setRange({ start: start.toISOString(), end: end.toISOString() });
    setDraft({ start: localDate(start), end: localDate(end) });
  }
  function shift(direction: number) {
    const duration = Date.parse(range.end) - Date.parse(range.start);
    const end = Math.min(
      Date.now(),
      Date.parse(range.end) + direction * duration,
    );
    changeRange(new Date(end - duration), new Date(end));
  }
  function exportData() {
    const rows = [
      ["entity_id", "time", "state", "value", "unit"],
      ...(history.data?.series || []).flatMap((s) =>
        s.points.map((p) => [
          s.entity_id,
          p.time,
          p.state,
          p.value ?? "",
          s.unit || "",
        ]),
      ),
    ];
    const csv = rows
      .map((r) =>
        r
          .map(
            (v) =>
              '"' +
              String(v)
                .replace(/^[=+@-]/, "'$&")
                .replaceAll('"', '""') +
              '"',
          )
          .join(","),
      )
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "smarti-historikk.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="history-explorer">
      <header className="history-heading">
        <div>
          <h1>
            {activity ? t("Huslogg", "Activity") : t("Historikk", "History")}
          </h1>
          <p>
            {activity
              ? t(
                  "Se hva som har skjedd i hjemmet ditt.",
                  "See what happened in your home.",
                )
              : t(
                  "Utforsk målinger og tilstander over tid.",
                  "Explore measurements and states over time.",
                )}
          </p>
        </div>
        <button
          onClick={() => showSources(!sources)}
          aria-expanded={sources}
          aria-controls="history-sources"
        >
          <ListFilter size={18} />
          {t("Kilder", "Sources")}
          {selected.length > 0 && ` (${selected.length})`}
        </button>
      </header>
      <div className="history-period">
        <div className="history-presets">
          {[1, 24, 168].map((hours) => (
            <button
              key={hours}
              onClick={() =>
                changeRange(new Date(Date.now() - hours * 3600000), new Date())
              }
            >
              {hours === 1
                ? t("Siste time", "Last hour")
                : hours === 24
                  ? t("Siste døgn", "Last day")
                  : t("7 dager", "7 days")}
            </button>
          ))}
          <button
            onClick={() => shift(-1)}
            aria-label={t("Forrige tidsrom", "Previous period")}
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={() => shift(1)}
            disabled={Date.parse(range.end) > Date.now() - 60000}
            aria-label={t("Neste tidsrom", "Next period")}
          >
            <ChevronRight size={20} />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            changeRange(new Date(draft.start), new Date(draft.end));
          }}
        >
          <label>
            {t("Fra", "From")}
            <input
              type="datetime-local"
              value={draft.start}
              onChange={(e) => setDraft({ ...draft, start: e.target.value })}
              required
            />
          </label>
          <label>
            {t("Til", "To")}
            <input
              type="datetime-local"
              value={draft.end}
              onChange={(e) => setDraft({ ...draft, end: e.target.value })}
              required
            />
          </label>
          <button type="submit">{t("Vis", "Show")}</button>
        </form>
        <button
          onClick={() => void query.refetch()}
          disabled={(!activity && !selected.length) || query.isFetching}
          aria-label={t("Oppdater", "Refresh")}
        >
          <RefreshCw size={18} />
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="history-layout" data-sources={sources}>
        {sources && (
          <aside id="history-sources" className="history-sources">
            <h2>{t("Velg enheter", "Select entities")}</h2>
            <label className="history-search">
              <Search size={18} />
              <input
                placeholder={t("Søk etter enhet …", "Search entities …")}
                aria-label={t("Søk etter enhet", "Search entities")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <label>
              {t("Rom", "Area")}
              <select value={area} onChange={(e) => setArea(e.target.value)}>
                <option value="">{t("Alle rom", "All areas")}</option>
                {home.areas.map((a) => (
                  <option key={a.area_id} value={a.area_id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("Type", "Type")}
              <select
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
              >
                <option value="">{t("Alle typer", "All types")}</option>
                {[...new Set(controls.map((c) => c.domain))].sort().map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </label>
            <div className="history-selection">
              <small>
                {selected.length}/12 {t("valgt", "selected")}
              </small>
              <button onClick={() => select([])} disabled={!selected.length}>
                {t("Nullstill", "Clear")}
              </button>
            </div>
            {catalog.isError && (
              <p role="alert">
                {t(
                  "Kunne ikke hente alle enhetene.",
                  "Could not load entities.",
                )}
                <button onClick={() => void catalog.refetch()}>
                  {t("Prøv igjen", "Retry")}
                </button>
              </p>
            )}
            <div className="history-choices">
              {choices.map((c) => (
                <label key={c.entity_id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(c.entity_id)}
                    disabled={
                      selected.length >= 12 && !selected.includes(c.entity_id)
                    }
                    onChange={(e) =>
                      select(
                        e.target.checked
                          ? [...selected, c.entity_id]
                          : selected.filter((id) => id !== c.entity_id),
                      )
                    }
                  />
                  <span>
                    {c.name}
                    <small>{c.entity_id}</small>
                  </span>
                </label>
              ))}
              {!choices.length && (
                <p>
                  {t("Ingen enheter passer søket.", "No matching entities.")}
                </p>
              )}
            </div>
            <button className="history-sources-done" onClick={() => showSources(false)}>{t("Vis resultat", "Show results")}</button>
          </aside>
        )}
        <div className="history-results" aria-busy={query.isFetching}>
          {!activity && !selected.length ? (
            <div className="history-empty">
              <History size={40} />
              <h2>
                {t(
                  "Hva vil du se historikken til?",
                  "What would you like to explore?",
                )}
              </h2>
              <p>
                {t(
                  "Velg en eller flere enheter under Kilder.",
                  "Select one or more entities under Sources.",
                )}
              </p>
              <button onClick={() => showSources(true)}>
                {t("Velg kilder", "Select sources")}
              </button>
            </div>
          ) : query.isPending ? (
            <p role="status">
              {t("Henter historikken …", "Loading history …")}
            </p>
          ) : query.isError ? (
            <div role="alert">
              <p>
                {t(
                  "Kunne ikke hente historikken fra hjemmesentralen.",
                  "Could not load history from the controller.",
                )}
              </p>
              <button onClick={() => void query.refetch()}>
                {t("Prøv igjen", "Retry")}
              </button>
            </div>
          ) : activity ? (
            <>
              {events.data?.truncated && (
                <p role="status">
                  {t(
                    "Viser de 1 000 nyeste hendelsene. Velg et kortere tidsrom for å se flere detaljer.",
                    "Showing the latest 1,000 entries. Choose a shorter period for more detail.",
                  )}
                </p>
              )}
              {!events.data?.entries.length ? (
                <div className="history-empty">
                  <h2>
                    {t(
                      "Ingen hendelser i dette tidsrommet",
                      "No activity in this period",
                    )}
                  </h2>
                  <p>
                    {t(
                      "Prøv et annet tidsrom eller andre kilder. Husloggen viser hendelser som er lagret i HA.",
                      "Try another period or selection. Activity shows events recorded by HA.",
                    )}
                  </p>
                </div>
              ) : (
                <ol className="house-log">
                  {events.data.entries.map((e, i) => {
                    const c = controls.find((c) => c.entity_id === e.entity_id);
                    return (
                      <li key={`${e.when}-${i}`}>
                        <time dateTime={e.when}>
                          {new Date(e.when).toLocaleString(
                            lang === "en" ? "en-GB" : "nb-NO",
                            {
                              day: "2-digit",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            },
                          )}
                        </time>
                        <div>
                          <strong>
                            {e.name ||
                              c?.name ||
                              e.entity_id ||
                              t("Hjemmet", "Home")}
                          </strong>
                          <p>
                            {e.message ||
                              (c && e.state !== null
                                ? controlState(c, e.state, lang)
                                : e.state) ||
                              t("Aktivitet registrert", "Activity recorded")}
                          </p>
                          {e.context_name && (
                            <small>
                              {t("Utløst av", "Triggered by")} {e.context_name}
                            </small>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </>
          ) : (
            <>
              <div className="history-export">
                <button onClick={exportData}>
                  <Download size={18} />
                  {t("Last ned CSV", "Download CSV")}
                </button>
              </div>
              {history.data?.series.map((series) => {
                const control = controls.find(
                  (c) => c.entity_id === series.entity_id,
                );
                return (
                  control && (
                    <article className="history-series" key={series.entity_id}>
                      <h2>{control.name}</h2>
                      <small>{control.entity_id}</small>
                      {series.truncated && (
                        <p role="status">
                          {t(
                            "Kun de 2 000 siste punktene vises. Velg et kortere tidsrom for komplett historikk.",
                            "Only the latest 2,000 points are shown. Select a shorter period for complete history.",
                          )}
                        </p>
                      )}
                      {series.points.length ? (
                        <HistoryChart
                          key={series.entity_id + range.start + range.end}
                          data={series}
                          control={control}
                          lang={lang}
                        />
                      ) : (
                        <p>
                          {t(
                            "Ingen lagret historikk i dette tidsrommet.",
                            "No recorded history in this period.",
                          )}
                        </p>
                      )}
                    </article>
                  )
                );
              })}
              <p className="note">
                {t(
                  "Historikken følger lagringstiden i HA. Enheter som er unntatt fra opptak, har ingen historikk.",
                  "History follows HA retention. Entities excluded from recording have no history.",
                )}
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

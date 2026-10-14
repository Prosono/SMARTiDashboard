import { SettingsDialog } from "./SettingsDialog";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Settings2,
  Check,
  RefreshCw,
} from "lucide-react";
import { api } from "../api";
import { smartiName } from "../branding";
import "./calendar.css";

type CalendarInfo = {
  sources: { id: string; name: string }[];
  calendars: string[];
  today: string;
  timezone: string;
};
type Event = {
  calendar: string;
  start: string;
  end: string;
  all_day: boolean;
  summary: string;
  location: string;
  description: string;
};
type Agenda = {
  days: Record<string, Event[]>;
  failed: string[];
  truncated: boolean;
  timezone: string;
};
const dayDate = (day: string) => new Date(day + "T12:00:00Z");
function addDays(day: string, delta: number) {
  const d = dayDate(day);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
export function Calendar({
  lang,
  offline,
}: {
  lang: string;
  offline: boolean;
}) {
  const en = lang === "en",
    locale = en ? "en-GB" : "nb-NO";
  const t = (nb: string, english: string) => (en ? english : nb);
  const qc = useQueryClient();
  const info = useQuery({
    queryKey: ["calendar"],
    queryFn: () => api<CalendarInfo>("home/calendar"),
    refetchInterval: 60000,
  });
  const [offset, setOffset] = useState(0),
    [chosenDay, chooseDay] = useState("");
  const [draft, setDraft] = useState<string[] | null>(null),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const [count, setCount] = useState(10);
  const today = info.data?.today || "",
    start = today ? addDays(today, offset) : "";
  const days = start
    ? Array.from({ length: 7 }, (_, i) => addDays(start, i))
    : [];
  const selectedDay = days.includes(chosenDay) ? chosenDay : start;
  const selected = info.data?.calendars || [];
  const availableSelection = () =>
    selected.filter((id) =>
      info.data?.sources.some((source) => source.id === id),
    );
  const agenda = useQuery({
    queryKey: ["calendar-events", start, selected],
    queryFn: () => api<Agenda>(`home/calendar/events?start=${start}`),
    enabled: !!start && !!selected.length && !offline,
    refetchInterval: 300000,
    staleTime: 60000,
    retry: false,
  });
  const events =
    !offline && !agenda.isError ? agenda.data?.days[selectedDay] || [] : [];
  const fullDate = (day: string) =>
    dayDate(day).toLocaleDateString(locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    });
  const clock = (value: string) =>
    new Date(value).toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: info.data?.timezone,
    });
  const timeLabel = (event: Event) =>
    event.all_day
      ? t("Hele dagen", "All day")
      : `${event.start.slice(0, 10) < selectedDay ? t("Fra tidligere", "From earlier") : clock(event.start)} – ${event.end.slice(0, 10) > selectedDay ? t("fortsetter", "continues") : clock(event.end)}`;
  async function save() {
    setSaving(true);
    setError("");
    try {
      await api("home/calendar", "PUT", { calendars: draft });
      await qc.invalidateQueries({ queryKey: ["calendar"] });
      await qc.invalidateQueries({ queryKey: ["calendar-events"] });
      setDraft(null);
    } catch {
      setError(
        t(
          "Kunne ikke lagre kalenderne. Prøv igjen.",
          "Could not save calendars. Try again.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }
  function navigate(delta: number) {
    setOffset(offset + delta);
    chooseDay("");
    setCount(10);
  }
  return (
    <section className="home-calendar" aria-label={t("Kalender", "Calendar")}>
      <header className="calendar-heading">
        <div>
          <span className="eyebrow">
            {t("Plass til hverdagen", "Room for everyday life")}
          </span>
          <h2>
            <CalendarDays size={23} />
            {t("På planen", "On the agenda")}
          </h2>
        </div>
        <button
          onClick={() => {
            setDraft(draft === null ? availableSelection() : null);
            setError("");
          }}
          disabled={!info.data || saving}
          aria-expanded={draft !== null}
        >
          <Settings2 size={17} />
          {t("Velg kalendere", "Choose calendars")}
        </button>
      </header>
      {info.isError && (
        <p role="alert">
          {t("Kalenderne kunne ikke hentes.", "Could not load calendars.")}{" "}
          <button onClick={() => info.refetch()}>
            {t("Prøv igjen", "Retry")}
          </button>
        </p>
      )}
      {info.isPending && <p>{t("Henter kalendere…", "Loading calendars…")}</p>}
      {draft !== null && (
        <SettingsDialog
          title={t("Velg kalendere", "Choose calendars")}
          lang={lang}
          busy={saving}
          onClose={() => setDraft(null)}
        >
          <fieldset className="calendar-settings" disabled={saving}>
            <legend>
              {t("Kalendere på din Hjem-side", "Calendars on your Home page")}
            </legend>
            <p>
              {t(
                "Velg inntil 12 kalendere. Valget lagres for din bruker.",
                "Choose up to 12 calendars. Your selection is personal.",
              )}
            </p>
            {info.data?.sources.map((source) => (
              <label key={source.id}>
                <input
                  type="checkbox"
                  checked={draft.includes(source.id)}
                  disabled={!draft.includes(source.id) && draft.length >= 12}
                  onChange={(e) =>
                    setDraft(
                      e.target.checked
                        ? [...draft, source.id]
                        : draft.filter((id) => id !== source.id),
                    )
                  }
                />
                {smartiName(source.name)}
              </label>
            ))}
            {!info.data?.sources.length && (
              <p>
                {t(
                  "Ingen kalendere er tilkoblet ennå. Koble til en kalender på hjemmesentralen, så dukker den opp her.",
                  "No calendars connected yet. Connect a calendar to your home hub and it will appear here.",
                )}
              </p>
            )}
            {error && <p role="alert">{error}</p>}
            <div>
              <button className="calendar-save" onClick={save}>
                <Check size={16} />
                {saving
                  ? t("Lagrer…", "Saving…")
                  : t("Lagre valg", "Save selection")}
              </button>
              <button onClick={() => setDraft(null)}>
                {t("Avbryt", "Cancel")}
              </button>
            </div>
          </fieldset>
        </SettingsDialog>
      )}
      {info.data && (
        <div className="calendar-layout">
          <div className="calendar-datebook">
            <div className="calendar-month">
              <span>
                {dayDate(start).toLocaleDateString(locale, {
                  month: "long",
                  year: "numeric",
                  timeZone: "UTC",
                })}
              </span>
              <div>
                <button
                  aria-label={t("Forrige uke", "Previous week")}
                  disabled={offset <= -357}
                  onClick={() => navigate(-7)}
                >
                  <ChevronLeft size={19} />
                </button>
                <button
                  onClick={() => {
                    setOffset(0);
                    chooseDay("");
                    setCount(10);
                  }}
                >
                  {t("I dag", "Today")}
                </button>
                <button
                  aria-label={t("Neste uke", "Next week")}
                  disabled={offset >= 357}
                  onClick={() => navigate(7)}
                >
                  <ChevronRight size={19} />
                </button>
              </div>
            </div>
            <div
              className="calendar-week"
              aria-label={t("Velg dag", "Choose day")}
            >
              {days.map((day) => (
                <button
                  key={day}
                  aria-pressed={selectedDay === day}
                  aria-current={day === today ? "date" : undefined}
                  aria-label={fullDate(day)}
                  onClick={() => {
                    chooseDay(day);
                    setCount(10);
                  }}
                >
                  <span>
                    {dayDate(day).toLocaleDateString(locale, {
                      weekday: "short",
                      timeZone: "UTC",
                    })}
                  </span>
                  <strong>{Number(day.slice(-2))}</strong>
                  <i
                    aria-hidden="true"
                    className={
                      !offline &&
                      !agenda.isError &&
                      agenda.data?.days[day]?.length
                        ? "has-events"
                        : ""
                    }
                  />
                </button>
              ))}
            </div>
            <p className="calendar-caption">
              {t(
                "En liten oversikt. Litt mer ro.",
                "A little overview. A little more calm.",
              )}
            </p>
          </div>
          <div className="calendar-agenda">
            <div className="calendar-agenda-heading">
              <h3>
                {selectedDay === today
                  ? t("I dag", "Today")
                  : fullDate(selectedDay)}
              </h3>
              {!!selected.length && !offline && (
                <button
                  aria-label={t("Oppdater avtaler", "Refresh events")}
                  onClick={() => agenda.refetch()}
                  disabled={agenda.isFetching}
                >
                  <RefreshCw size={16} />
                </button>
              )}
            </div>
            {offline ? (
              <p role="status">
                {t(
                  "Kalenderen er frakoblet. Avtaler vises når forbindelsen er tilbake.",
                  "Calendar is offline. Events will appear when reconnected.",
                )}
              </p>
            ) : !selected.length ? (
              <div className="calendar-empty">
                <CalendarDays size={30} />
                <h4>{t("Samle dagene her", "Bring your days together")}</h4>
                <p>
                  {t(
                    "Familie, jobb og små ting å huske. Velg kalenderne du vil ha på Hjem.",
                    "Family, work and little things to remember. Choose the calendars you want on Home.",
                  )}
                </p>
                <button onClick={() => setDraft(availableSelection())}>
                  {t("Velg kalendere", "Choose calendars")}
                </button>
              </div>
            ) : agenda.isPending ? (
              <p>{t("Henter avtaler…", "Loading events…")}</p>
            ) : agenda.isError ? (
              <p role="alert">
                {t(
                  "Avtalene kunne ikke hentes. Prøv oppdater-knappen.",
                  "Events could not be loaded. Try the refresh button.",
                )}
              </p>
            ) : (
              <>
                {!!agenda.data?.failed.length && (
                  <p className="calendar-warning" role="status">
                    {t(
                      "Noen kalendere kunne ikke hentes:",
                      "Some calendars could not be loaded:",
                    )}{" "}
                    {agenda.data.failed
                      .map((id) =>
                        smartiName(
                          info.data.sources.find((s) => s.id === id)?.name ||
                            id,
                        ),
                      )
                      .join(", ")}
                  </p>
                )}
                {agenda.data?.truncated && (
                  <p className="calendar-warning">
                    {t(
                      "Mange avtaler denne uken. Viser inntil 200 per kalender.",
                      "Busy week. Showing up to 200 events per calendar.",
                    )}
                  </p>
                )}
                {!events.length && (
                  <div className="calendar-empty">
                    <Check size={26} />
                    <h4>
                      {agenda.data?.failed.length
                        ? t("Ingen avtaler å vise", "No events to show")
                        : t("Luft i kalenderen", "Room in your day")}
                    </h4>
                    <p>
                      {t(
                        "Ingen avtaler fra de tilgjengelige, valgte kalenderne denne dagen.",
                        "No events from your available selected calendars on this day.",
                      )}
                    </p>
                  </div>
                )}
                <ol className="calendar-events">
                  {events.slice(0, count).map((event, i) => (
                    <li key={event.calendar + event.start + i}>
                      <details>
                        <summary>
                          <span className="calendar-event-time">
                            {timeLabel(event)}
                          </span>
                          <span className="calendar-event-title">
                            <strong>
                              {event.summary || t("Uten tittel", "Untitled")}
                            </strong>
                            <small>
                              {smartiName(
                                info.data.sources.find(
                                  (s) => s.id === event.calendar,
                                )?.name || event.calendar,
                              )}
                            </small>
                          </span>
                          <ChevronRight size={17} />
                        </summary>
                        <div className="calendar-event-details">
                          <p>
                            {event.all_day
                              ? t("Heldagsavtale", "All-day event")
                              : `${new Date(event.start).toLocaleString(locale, { timeZone: info.data.timezone })} – ${new Date(event.end).toLocaleString(locale, { timeZone: info.data.timezone })}`}
                          </p>
                          {event.location && (
                            <p>
                              <MapPin size={15} />
                              {event.location}
                            </p>
                          )}
                          {event.description && (
                            <p className="calendar-description">
                              {event.description}
                            </p>
                          )}
                          {!event.location && !event.description && (
                            <p>
                              {t(
                                "Ingen flere detaljer.",
                                "No further details.",
                              )}
                            </p>
                          )}
                        </div>
                      </details>
                    </li>
                  ))}
                </ol>
                {events.length > count && (
                  <button onClick={() => setCount(count + 10)}>
                    {t("Vis flere avtaler", "Show more events")}
                  </button>
                )}
              </>
            )}
            <small className="calendar-timezone">{info.data.timezone}</small>
          </div>
        </div>
      )}
    </section>
  );
}

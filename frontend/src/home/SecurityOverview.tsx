import { ToolbarToggle, useToolbarDisclosure } from "./ToolbarToggle";
import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Shield,
  Camera,
  LockKeyhole,
  Radio,
  History,
  Search,
  House,
  ChevronRight,
  DoorOpen,
  Droplets,
  Flame,
  Wind,
  Zap,
  Bell,
} from "lucide-react";
import type { Control, Home } from "../types";
import { api } from "../api";
import { controlState } from "../controlState";
import { overview, usable } from "./homeModel";
import { homeAsset } from "./HomeOverview";
import { CameraCard } from "./HomeMedia";
import { SettingsDialog } from "./SettingsDialog";
import "./lightOverview.css";
import "./securityOverview.css";

function deviceIcon(c: Control) {
  if (c.domain === "lock") return LockKeyhole;
  if (c.domain === "alarm_control_panel") return Shield;
  const kind = String(c.attributes.device_class);
  if (kind === "moisture") return Droplets;
  if (kind === "smoke") return Flame;
  if (["gas", "carbon_monoxide"].includes(kind)) return Wind;
  if (
    ["door", "window", "opening", "garage_door"].includes(kind) ||
    c.domain === "cover"
  )
    return DoorOpen;
  return Radio;
}
function attention(c: Control) {
  return (
    c.state === "triggered" ||
    (c.domain === "binary_sensor" &&
      c.state === "on" &&
      [
        "smoke",
        "gas",
        "carbon_monoxide",
        "moisture",
        "safety",
        "tamper",
      ].includes(String(c.attributes.device_class)))
  );
}
export function SecurityOverview({
  home,
  lang,
  offline,
  renderControls,
}: {
  home: Home;
  lang: string;
  offline: boolean;
  renderControls: (c: Control[]) => ReactNode;
}) {
  const toolbar = useToolbarDisclosure();
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const [tab, setTab] = useState("all"),
    [search, setSearch] = useState(""),
    [room, setRoom] = useState("all"),
    [chosen, choose] = useState<string | null>(null),
    [opened, open] = useState<string | null>(null);
  const [failedPreviews, failPreview] = useState<string[]>([]);
  const model = overview(home);
  const extra = home.controls.filter(
    (c) =>
      !c.diagnostic &&
      c.domain === "binary_sensor" &&
      ["carbon_monoxide", "tamper", "glass_break", "occupancy"].includes(
        String(c.attributes.device_class),
      ),
  );
  const devices = [
    ...model.security,
    ...extra.filter((c) => !model.security.some((d) => d.id === c.id)),
  ];
  const matches = (c: Control) =>
    (room === "all" || c.area_id === room) &&
    `${c.name} ${home.areas.find((a) => a.area_id === c.area_id)?.name || ""}`
      .toLocaleLowerCase()
      .includes(search.toLocaleLowerCase());
  const cameras = model.cameras.filter(matches),
    locks = devices.filter(
      (c) => ["lock", "cover"].includes(c.domain) && matches(c),
    ),
    alarms = devices.filter(
      (c) => c.domain === "alarm_control_panel" && matches(c),
    ),
    sensors = devices.filter((c) => c.domain === "binary_sensor" && matches(c));
  const selected = cameras.find((c) => c.id === chosen) || cameras[0];
  const unknown = [...devices, ...model.cameras].filter(
    (c) => !usable(c),
  ).length;
  const alerts = devices.filter((c) => usable(c) && attention(c));
  const totalLocks = devices.filter((c) => c.domain === "lock");
  const locked = totalLocks.filter(
    (c) => usable(c) && c.state === "locked",
  ).length;
  const openings = devices.filter(
    (c) =>
      usable(c) &&
      ((c.domain === "lock" && c.state === "unlocked") ||
        (c.domain === "cover" && c.state === "open") ||
        (c.domain === "binary_sensor" &&
          c.state === "on" &&
          ["door", "window", "opening", "garage_door"].includes(
            String(c.attributes.device_class),
          ))),
  );
  const activity = useQuery({
    queryKey: ["home-activity"],
    queryFn: () =>
      api<{ entity_id: string; state: string; time: string }[]>(
        "home/activity",
      ),
    enabled: !offline,
    refetchInterval: 15000,
    staleTime: 10000,
  });
  const events = (activity.data || []).flatMap((e) => {
    const c = devices.find((c) => c.entity_id === e.entity_id);
    return c && matches(c) ? [{ ...e, c }] : [];
  });
  const tabs = [
    { id: "all", label: t("Oversikt", "Overview"), Icon: Shield },
    { id: "cameras", label: t("Kameraer", "Cameras"), Icon: Camera },
    { id: "locks", label: t("Låser", "Locks"), Icon: LockKeyhole },
    { id: "alarms", label: t("Alarmer", "Alarms"), Icon: Bell },
    { id: "sensors", label: t("Sensorer", "Sensors"), Icon: Radio },
    { id: "history", label: t("Hendelser", "Events"), Icon: History },
  ];
  const details =
    opened === "locks"
      ? locks
      : opened === "alarms"
        ? alarms
        : devices.filter((c) => c.id === opened);
  const time = (date: string) =>
    new Date(date).toLocaleString(lang === "en" ? "en-GB" : "nb-NO", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  function rows(
    items: Control[],
    label: string,
    kind: string,
    Icon: typeof Shield,
  ) {
    return (
      <section className="security-panel">
        <header>
          <h2>
            <Icon size={21} />
            {label}
          </h2>
          {tab === "all" && (
            <button onClick={() => setTab(kind)}>
              {t("Se alle", "View all")}
              <ChevronRight size={16} />
            </button>
          )}
        </header>
        {items.length ? (
          <div className="security-device-list">
            {(tab === "all" ? items.slice(0, 4) : items).map((c) => {
              const DeviceIcon = deviceIcon(c);
              const missing = offline || !usable(c);
              return (
                <button
                  key={c.id}
                  onClick={() => open(c.id)}
                  className="security-device-row"
                >
                  <span className="security-device-icon">
                    <DeviceIcon size={21} />
                  </span>
                  <span>
                    <strong>{c.name}</strong>
                    <small>
                      {home.areas.find((a) => a.area_id === c.area_id)?.name ||
                        t("Uten rom", "No room")}
                    </small>
                  </span>
                  <span
                    className="security-device-status"
                    data-tone={
                      missing ? "unknown" : attention(c) ? "alert" : "known"
                    }
                  >
                    <strong>
                      {missing
                        ? t("Ukjent status", "Unknown status")
                        : controlState(c, c.state, lang)}
                    </strong>
                    <small>
                      {c.updated_at
                        ? time(c.updated_at)
                        : t("Ingen tidspunkt", "No timestamp")}
                    </small>
                  </span>
                  <ChevronRight size={16} />
                </button>
              );
            })}
          </div>
        ) : (
          <p className="security-empty">
            {t(
              "Ingen enheter å vise med disse filtrene.",
              "No devices match these filters.",
            )}
          </p>
        )}
      </section>
    );
  }
  return (
    <section className="security-overview">
      <header className="security-heading toolbar-heading">
        <Shield size={36} />
        <div>
          <h1>{t("Sikkerhet", "Security")}</h1>
          <p>
            {t(
              "Et tryggere hjem. Full kontroll, uansett hvor du er.",
              "A safer home. Stay in control, wherever you are.",
            )}
          </p>
        </div>
        <ToolbarToggle {...toolbar} lang={lang} />
      </header>
      <div
        className="lighting-toolbar security-toolbar"
        id={toolbar.id}
        hidden={!toolbar.expanded}
        data-collapsible-toolbar
        role="group"
        aria-label={t("Filtrer sikkerhet", "Filter security")}
      >
        <label className="lighting-search">
          <Search size={18} />
          <input
            aria-label={t("Søk i sikkerhet", "Search security")}
            placeholder={t(
              "Søk etter rom eller enhet…",
              "Search rooms or devices…",
            )}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="lighting-room-filter">
          <House size={18} />
          <select
            aria-label={t("Velg sikkerhetsrom", "Choose security room")}
            value={room}
            onChange={(e) => setRoom(e.target.value)}
          >
            <option value="all">{t("Alle rom", "All rooms")}</option>
            {home.areas.map((a) => (
              <option key={a.area_id} value={a.area_id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <nav
          className="security-tabs"
          aria-label={t("Sikkerhetskategorier", "Security categories")}
        >
          {tabs.map(({ id, label, Icon }) => (
            <button
              key={id}
              aria-pressed={tab === id}
              onClick={() => setTab(id)}
            >
              <Icon size={17} />
              {label}
            </button>
          ))}
        </nav>
      </div>
      <section className="security-summary" data-alert={alerts.length > 0}>
        <img src={homeAsset("home-security")} alt="" />
        <div>
          <small>{t("SIKKERHET I HJEMMET", "HOME SECURITY")}</small>
          <h2>
            {offline
              ? t("Tilkoblingen er brutt", "Connection lost")
              : alerts.length
                ? t("Se aktive varsler", "Check active alerts")
                : unknown
                  ? t(
                      "Noen enheter svarer ikke",
                      "Some devices are unavailable",
                    )
                  : openings.length
                    ? t("Noe står åpent", "An opening needs attention")
                    : devices.length
                      ? t("Ingen aktive varsler", "No active alerts")
                      : t("Din sikkerhetsoversikt", "Your security overview")}
          </h2>
          <p>
            {offline
              ? t(
                  "Status kan være utdatert. Styring er utilgjengelig.",
                  "Status may be stale. Controls are unavailable.",
                )
              : t(
                  "Oversikten viser det enhetene rapporterer akkurat nå.",
                  "This overview shows what your devices report right now.",
                )}
          </p>
        </div>
        <div className="security-metrics">
          {[
            {
              Icon: Camera,
              value: offline
                ? "—"
                : `${model.cameras.filter(usable).length} / ${model.cameras.length}`,
              label: t("Kameraer tilgjengelige", "Cameras available"),
            },
            {
              Icon: LockKeyhole,
              value: offline ? "—" : `${locked} / ${totalLocks.length}`,
              label: t("Dører låst", "Doors locked"),
            },
            {
              Icon: Shield,
              value: offline ? "—" : String(alerts.length),
              label: t("Aktive varsler", "Active alerts"),
            },
            {
              Icon: Radio,
              value: offline ? "—" : String(unknown),
              label: t("Utilgjengelige", "Unavailable"),
            },
          ].map(({ Icon, value, label }) => (
            <div key={label}>
              <Icon size={24} />
              <span>
                <strong>{value}</strong>
                <small>{label}</small>
              </span>
            </div>
          ))}
        </div>
      </section>
      <div className="security-layout" data-tab={tab}>
        <div className="security-main">
          {(tab === "all" || tab === "cameras") && (
            <section className="security-panel security-camera-panel">
              <header>
                <h2>
                  <Camera size={21} />
                  {t("Live kameraer", "Live cameras")}
                </h2>
                <small>
                  {cameras.length} {t("kameraer", "cameras")}
                </small>
              </header>
              {selected ? (
                <>
                  <CameraCard
                    key={selected.id}
                    c={selected}
                    offline={offline}
                    lang={lang}
                  />
                  <div className="security-camera-picker">
                    {cameras.map((c) => (
                      <button
                        key={c.id}
                        aria-pressed={c.id === selected.id}
                        onClick={() => choose(c.id)}
                      >
                        {!offline &&
                          usable(c) &&
                          !failedPreviews.includes(c.id) && (
                            <img
                              src={
                                new URL(
                                  `api/home/camera/${encodeURIComponent(c.id)}`,
                                  document.baseURI,
                                ).href
                              }
                              alt=""
                              loading="lazy"
                              onError={() =>
                                failPreview((ids) => [...ids, c.id])
                              }
                            />
                          )}
                        <Camera size={19} />
                        <span>
                          {c.name}
                          <small>
                            {offline || !usable(c)
                              ? t("Utilgjengelig", "Unavailable")
                              : c.id === selected.id
                                ? t("Valgt kamera", "Selected camera")
                                : t("Vis live", "View live")}
                          </small>
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="security-empty">
                  {t(
                    "Ingen kameraer å vise. Tilkoblede kameraer vises automatisk her.",
                    "No cameras to show. Connected cameras appear here automatically.",
                  )}
                </p>
              )}
            </section>
          )}
          {(tab === "all" || tab === "history") && (
            <section className="security-panel">
              <header>
                <h2>
                  <History size={21} />
                  {t("Siste hendelser", "Recent events")}
                </h2>
                {tab === "all" && (
                  <button onClick={() => setTab("history")}>
                    {t("Se alle", "View all")}
                    <ChevronRight size={16} />
                  </button>
                )}
              </header>
              <p className="security-history-note">
                {t(
                  "Observerte endringer siden SMARTi startet. Ikke en komplett hendelseslogg.",
                  "Observed changes since SMARTi started. Not a complete event log.",
                )}
              </p>
              {activity.isError ? (
                <p role="alert">
                  {t("Kunne ikke hente hendelser.", "Could not load events.")}
                </p>
              ) : events.length ? (
                <div className="security-events">
                  {events.slice(0, tab === "all" ? 6 : 20).map((e, i) => {
                    const Icon = deviceIcon(e.c);
                    return (
                      <button
                        key={`${e.entity_id}-${e.time}-${i}`}
                        onClick={() => open(e.c.id)}
                      >
                        <Icon size={17} />
                        <span>
                          <strong>{e.c.name}</strong>
                          <small>{controlState(e.c, e.state, lang)}</small>
                        </span>
                        <time>{time(e.time)}</time>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="security-empty">
                  {offline
                    ? t(
                        "Koble til for å hente hendelser.",
                        "Connect to load events.",
                      )
                    : activity.isPending
                      ? t("Henter hendelser…", "Loading events…")
                      : t(
                          "Ingen registrerte hendelser i dette utvalget.",
                          "No recorded events in this selection.",
                        )}
                </p>
              )}
            </section>
          )}
        </div>
        <div className="security-side">
          {tab === "all" && (
            <section className="security-panel">
              <header>
                <h2>
                  <Zap size={21} />
                  {t("Hurtigtilgang", "Quick access")}
                </h2>
              </header>
              <div className="security-shortcuts">
                <button disabled={!locks.length} onClick={() => open("locks")}>
                  <LockKeyhole />
                  {t("Styr låser", "Control locks")}
                </button>
                <button
                  disabled={!alarms.length}
                  onClick={() => open("alarms")}
                >
                  <Shield />
                  {t("Alarmkontroll", "Alarm controls")}
                </button>
                <button
                  disabled={!cameras.length}
                  onClick={() => setTab("cameras")}
                >
                  <Camera />
                  {t("Kameraer", "Cameras")}
                </button>
                <button
                  disabled={!sensors.length}
                  onClick={() => setTab("sensors")}
                >
                  <Radio />
                  {t("Sensorer", "Sensors")}
                </button>
              </div>
            </section>
          )}
          {(tab === "all" || tab === "locks") &&
            rows(
              locks,
              t("Dører og låser", "Doors and locks"),
              "locks",
              LockKeyhole,
            )}
          {(tab === "alarms" || (tab === "all" && alarms.length > 0)) &&
            rows(alarms, t("Alarmer", "Alarms"), "alarms", Shield)}
          {(tab === "all" || tab === "sensors") &&
            rows(sensors, t("Sensorer", "Sensors"), "sensors", Radio)}
        </div>
      </div>
      {opened && (
        <SettingsDialog
          title={
            details.length === 1
              ? details[0].name
              : t("Sikkerhetskontroller", "Security controls")
          }
          lang={lang}
          onClose={() => open(null)}
        >
          {details.length ? (
            renderControls(details)
          ) : (
            <p>
              {t(
                "Enheten er ikke lenger tilgjengelig.",
                "The device is no longer available.",
              )}
            </p>
          )}
        </SettingsDialog>
      )}
    </section>
  );
}

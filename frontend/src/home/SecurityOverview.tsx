import { HomeGrid } from "./HomeGrid";
import { CardIcon, CardTitle } from "./CardPresentation";
import { deviceGridCards } from "./HomeDeviceGrid";
import { MetricDetails } from "./MetricDetails";
import { CategoryHeading, CategorySummary } from "./CategoryIntro";
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
  Bell,
  LayoutGrid,
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
  openDevices,
}: {
  home: Home;
  lang: string;
  offline: boolean;
  renderControls: (c: Control[]) => ReactNode;
  openDevices?: () => void;
}) {
  const toolbar = useToolbarDisclosure();
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const [tab, setTab] = useState("all"),
    [search, setSearch] = useState(""),
    [room, setRoom] = useState("all"),
    [opened, open] = useState<string | null>(null);
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
  const locks = devices.filter(
      (c) => ["lock", "cover"].includes(c.domain) && matches(c),
    ),
    alarms = devices.filter(
      (c) => c.domain === "alarm_control_panel" && matches(c),
    );
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
  const summary = (
    <CategorySummary
      image={homeAsset("home-security")}
      eyebrow={t("SIKKERHET I HJEMMET", "HOME SECURITY")}
      title={
        offline
          ? t("Tilkoblingen er brutt", "Connection lost")
          : alerts.length
            ? t("Se aktive varsler", "Check active alerts")
            : unknown
              ? t("Noen enheter svarer ikke", "Some devices are unavailable")
              : openings.length
                ? t("Noe står åpent", "An opening needs attention")
                : devices.length
                  ? t("Ingen aktive varsler", "No active alerts")
                  : t("Din sikkerhetsoversikt", "Your security overview")
      }
      description={
        offline
          ? t(
              "Status kan være utdatert. Styring er utilgjengelig.",
              "Status may be stale. Controls are unavailable.",
            )
          : t(
              "Oversikten viser det enhetene rapporterer akkurat nå.",
              "This overview shows what your devices report right now.",
            )
      }
      alert={alerts.length > 0}
    >
      {[
        {
          Icon: Camera,
          value: offline
            ? "—"
            : `${model.cameras.filter(usable).length} / ${model.cameras.length}`,
          label: t("Kameraer tilgjengelige", "Cameras available"),
          controls: model.cameras.filter(usable),
        },
        {
          Icon: LockKeyhole,
          value: offline ? "—" : `${locked} / ${totalLocks.length}`,
          label: t("Dører låst", "Doors locked"),
          controls: totalLocks.filter((c) => usable(c) && c.state === "locked"),
        },
        {
          Icon: Shield,
          value: offline ? "—" : String(alerts.length),
          label: t("Aktive varsler", "Active alerts"),
          controls: alerts,
        },
        {
          Icon: Radio,
          value: offline ? "—" : String(unknown),
          label: t("Utilgjengelige", "Unavailable"),
          controls: [...devices, ...model.cameras].filter((c) => !usable(c)),
        },
      ].map(({ Icon, value, label, controls }) => (
        <MetricDetails
          key={label}
          label={label}
          controls={controls}
          home={home}
          lang={lang}
        >
          <Icon size={24} />
          <span>
            <strong>{value}</strong>
            <small>{label}</small>
          </span>
        </MetricDetails>
      ))}
    </CategorySummary>
  );
  return (
    <section className="security-overview">
      <CategoryHeading
        summary={summary}
        image={homeAsset("home-security")}
        Icon={Shield}
        title={t("Sikkerhet", "Security")}
        subtitle={t(
          "Et tryggere hjem. Full kontroll, uansett hvor du er.",
          "A safer home. Stay in control, wherever you are.",
        )}
      >
        <ToolbarToggle {...toolbar} lang={lang} />
      </CategoryHeading>
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
      {openDevices && (
        <button className="phone-security-all" onClick={openDevices}>
          <LayoutGrid size={21} />
          {t("Vis alle enheter", "View all devices")}
          <ChevronRight size={20} />
        </button>
      )}
      <HomeGrid
        page="security"
        home={home}
        offline={offline}
        lang={lang}
        cards={[
          ...model.cameras.slice(0, 100).map((c) => ({
            id: `camera:${c.entity_id}`,
            entityId: c.entity_id,
            title: c.name,
            hidden: !matches(c) || !["all", "cameras"].includes(tab),
            content: <CameraCard c={c} offline={offline} lang={lang} />,
          })),
          ...deviceGridCards({
            controls: devices.slice(0, 190),
            home,
            offline,
            lang,
            visible: new Set(
              devices
                .filter(
                  (c) =>
                    matches(c) &&
                    (tab === "all" ||
                      (tab === "locks" &&
                        ["lock", "cover"].includes(c.domain)) ||
                      (tab === "alarms" &&
                        c.domain === "alarm_control_panel") ||
                      (tab === "sensors" && c.domain === "binary_sensor")),
                )
                .map((c) => c.entity_id),
            ),
          }),
          {
            id: "events",
            title: t("Siste hendelser", "Recent events"),
            hidden: !["all", "history"].includes(tab),
            content: (
              <section className="home-grid-events">
                <header>
                  <CardIcon fallback={History} size={21} />
                  <h2>
                    <CardTitle>
                      {t("Siste hendelser", "Recent events")}
                    </CardTitle>
                  </h2>
                </header>
                <p>
                  {t(
                    "Observerte endringer siden SMARTi startet.",
                    "Observed changes since SMARTi started.",
                  )}
                </p>
                {activity.isError ? (
                  <p role="alert">
                    {t("Kunne ikke hente hendelser.", "Could not load events.")}
                  </p>
                ) : events.length ? (
                  <div className="security-events">
                    {events.slice(0, 20).map((e, index) => (
                      <button
                        key={`${e.entity_id}-${index}`}
                        onClick={() => open(e.c.id)}
                      >
                        <span>
                          <strong>{e.c.name}</strong>
                          <small>{controlState(e.c, e.state, lang)}</small>
                        </span>
                        <time>{time(e.time)}</time>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p>
                    {offline
                      ? t(
                          "Koble til for å hente hendelser.",
                          "Connect to load events.",
                        )
                      : activity.isPending
                        ? t("Henter hendelser…", "Loading events…")
                        : t(
                            "Ingen registrerte hendelser.",
                            "No recorded events.",
                          )}
                  </p>
                )}
              </section>
            ),
          },
        ]}
      />
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

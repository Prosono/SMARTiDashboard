import { Miscellaneous, hasMiscellaneous } from "./Miscellaneous";
import { useExperience } from "../Experience";
import { SecurityOverview } from "./SecurityOverview";
import { LightOverview } from "./LightOverview";
import { Multimedia } from "./Multimedia";
import { SettingsDialog } from "./SettingsDialog";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  House,
  TriangleAlert,
  Moon,
  Briefcase,
  Plane,
  Settings2,
  Zap,
  LayoutGrid,
  Sofa,
  CookingPot,
  BedDouble,
  Bath,
  Trees,
  Car,
  ChevronRight,
  MapPin,
  Play,
  Bell,
} from "lucide-react";
import { api } from "../api";
import type { Home, Control } from "../types";
import { entityState } from "../manage/entityWords";
import { overview, usable } from "./homeModel";
import { Energy } from "./EnergyOverview";
import { EnergyPlatform } from "./EnergyPlatform";
import { EnergyFlow } from "./EnergyFlow";
import { Scenes } from "./Scenes";
import { HomeModeSetup, type HomeMode } from "./HomeModeSetup";
import { allControls } from "../access";
import { HomeTabs, homeTabs, type HomeTab } from "./HomeTabs";
import { ClimateOverview } from "./ClimateOverview";
import { Presence } from "./People";
import { Vehicle } from "./Vehicle";
import { SimpleDashboard } from "./SimpleDashboard";
import { HomeMetrics } from "./HomeMetrics";
import { CategoryHeading, HomeBannerless } from "./CategoryIntro";
import { HomeGrid } from "./HomeGrid";
import { equipmentSummaryCards } from "./EquipmentSummaryCards";
import { RoomSummaryCard } from "./RoomSummaryCard";
import { CardIcon, CardTitle } from "./CardPresentation";
import { HomeGridGuard } from "./HomeGridGuard";
import {
  HomePageTools,
  HomePageToolButtons,
  useHomePageTools,
} from "./HomePageTools";
import { deviceGridCards } from "./HomeDeviceGrid";
import "./homeHighlights.css";
import "./overviewDashboard.css";
import "./home.css";
import "./homeTabs.css";
export type HomePreferences = {
  rooms: string[];
  energy: string | null;
  cameras: string[];
  modes: Record<string, string | null>;
  images: Record<string, boolean>;
  icons?: Record<string, string>;
};
const modes: { id: HomeMode; nb: string; en: string; Icon: typeof House }[] = [
  { id: "home", nb: "Hjemme", en: "Home", Icon: House },
  { id: "away", nb: "Borte", en: "Away", Icon: Briefcase },
  { id: "night", nb: "Natt", en: "Night", Icon: Moon },
  { id: "holiday", nb: "Ferie", en: "Holiday", Icon: Plane },
];
// These are decorative room moods; personal room photos always take precedence.
export const homeAsset = (name: string) =>
  new URL(`home/${name}.webp`, document.baseURI).href;
export function roomMood(name: string) {
  const n = name.toLocaleLowerCase();
  if (/kjøkken|kitchen/.test(n))
    return { Icon: CookingPot, photo: "home-kitchen" };
  if (/soverom|bedroom|gjesterom/.test(n))
    return { Icon: BedDouble, photo: "home-bedroom" };
  if (/baderom|bathroom|^bad$|^bad\s/.test(n))
    return { Icon: Bath, photo: "home-bathroom" };
  if (/stue|living|lounge/.test(n)) return { Icon: Sofa, photo: "home-living" };
  if (/hage|garden|terrasse|ute/.test(n)) return { Icon: Trees, photo: null };
  if (/garasje|garage/.test(n)) return { Icon: Car, photo: null };
  return { Icon: LayoutGrid, photo: null };
}
export function HomeOverview({
  home: h,
  offline,
  lang,
  admin,
  renderControls,
  openRooms,
  openDevices,
}: {
  home: Home;
  offline: boolean;
  lang: string;
  admin: boolean;
  renderControls: (c: Control[]) => ReactNode;
  openRooms: (id?: string) => void;
  openDevices: () => void;
}) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const mode = useExperience();
  const qc = useQueryClient();
  const [tab, setTab] = useState<HomeTab>("overview");
  const leaveGrid = useRef<(() => boolean) | null>(null);
  function changeTab(next: HomeTab) {
    if (next !== tab && leaveGrid.current && !leaveGrid.current()) return;
    setTab(next);
  }
  const [lightScenes, showLightScenes] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const canView = (feature: string) =>
    !h.permissions || h.permissions.includes(feature + ".view");
  const canScenes =
    !h.permissions ||
    [
      "lights",
      "climate",
      "media",
      "cleaning",
      "security",
      "cameras",
      "energy",
      "people",
      "calendar",
      "other",
      "scenes",
    ].every((f) => canView(f));
  const allowedTabs: HomeTab[] = [
    "overview",
    ...(
      [
        "lights",
        "energy",
        "security",
        "climate",
        "media",
        ...(hasMiscellaneous(h) ? ["misc"] : []),
      ] as HomeTab[]
    ).filter(
      (f) =>
        f === "misc" || canView(f) || (f === "security" && canView("cameras")),
    ),
  ];
  useEffect(() => {
    if (!allowedTabs.includes(tab)) setTab("overview");
  }, [h.permissions, tab]);

  const prefs = useQuery({
    queryKey: ["home-preferences"],
    queryFn: () => api<HomePreferences>("home/preferences"),
  });
  const [configuring, configure] = useState(false),
    [search, searchFor] = useState("");
  const [settingUpMode, setSettingUpMode] = useState<HomeMode | null>(null);
  const canManageModes = admin && allControls(h);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const tools = useHomePageTools(configure);
  const [clock, setClock] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);
  const model = useMemo(() => overview(h), [h]);
  const pref = prefs.data;
  const roomList = pref?.rooms.length
    ? h.areas.filter((a) => pref.rooms.includes(a.area_id))
    : h.areas.slice(0, 4);
  const favorites = model.controls.filter(
    (c) => c.domain !== "scene" && h.favorites.includes(c.entity_id),
  );
  async function change(work: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await work();
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["home-preferences"] }),
        qc.invalidateQueries({ queryKey: ["home"] }),
      ]);
    } catch {
      setMessage(
        t(
          "Kunne ikke lagre endringen. Prøv igjen.",
          "Could not save the change. Try again.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  function savePreference(update: Partial<HomePreferences>) {
    if (!pref || busy) return;
    qc.setQueryData(["home-preferences"], { ...pref, ...update });
    return change(async () => {
      try {
        return await api("home/preferences", "PUT", {
          rooms: pref.rooms,
          energy: pref.energy,
          cameras: pref.cameras,
          ...update,
        });
      } catch (error) {
        qc.setQueryData(["home-preferences"], pref);
        throw error;
      }
    });
  }
  async function uploadRoom(id: string, file: File) {
    await change(async () => {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 15000000)
        throw new Error("image");
      const image = await createImageBitmap(file);
      const ratio = Math.min(1, 1400 / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * ratio));
      canvas.height = Math.max(1, Math.round(image.height * ratio));
      canvas
        .getContext("2d")!
        .drawImage(image, 0, 0, canvas.width, canvas.height);
      image.close();
      await api(`home/room-image/${encodeURIComponent(id)}`, "PUT", {
        data: canvas.toDataURL("image/jpeg", 0.78).split(",")[1],
      });
    });
  }
  async function runMode(id: string, label: string) {
    const target = h.controls.find((c) => c.id === pref?.modes[id]);
    if (
      !target ||
      !window.confirm(
        t(
          `Aktivere ${label} via «${target.name}»? Dette kjører den konfigurerte rutinen og kan påvirke lys, låser og andre enheter.`,
          `Activate ${label} using “${target.name}”? This runs the configured routine and may affect lights, locks and other devices.`,
        ),
      )
    )
      return;
    setBusy(true);
    setMessage("");
    try {
      const v = await api<{ status: string }>(`home/modes/${id}/run`, "POST", {
        confirmed: true,
      });
      setMessage(
        v.status === "simulated"
          ? t("Simulert i demohjemmet.", "Simulated in the demo home.")
          : t(
              "Forespørselen er sendt. Fysisk utførelse er ikke bekreftet.",
              "Request sent. Physical execution is not confirmed.",
            ),
      );
    } catch {
      setMessage(
        t(
          "Handlingen kunne ikke bekreftes. Kontroller hjemmet før du prøver igjen.",
          "The action could not be confirmed. Check your home before retrying.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  const routines = (
    <nav className="home-modes" aria-label={t("Hjemmemoduser", "Home modes")}>
      {modes.map((m) => {
        const target = h.controls.find((c) => c.id === pref?.modes[m.id]);
        return (
          <button
            key={m.id}
            className={target ? "mode-configured" : "mode-unconfigured"}
            aria-label={`${t(m.nb, m.en)}: ${target ? t("Kjør rutine", "Run routine") : t("Lag rutine", "Create routine")}`}
            title={
              target
                ? target.name
                : canManageModes
                  ? t("Lag eller velg rutine", "Create or choose routine")
                  : t(
                      "En administrator kan lage en rutine.",
                      "An administrator can create a routine.",
                    )
            }
            disabled={
              busy ||
              offline ||
              !h.connected ||
              (!!target && !usable(target)) ||
              !pref ||
              (!target && !canManageModes)
            }
            onClick={() =>
              target ? runMode(m.id, t(m.nb, m.en)) : setSettingUpMode(m.id)
            }
          >
            <m.Icon size={19} />
            <span>
              {t(m.nb, m.en)}
              <small>
                {target
                  ? t("Kjør rutine", "Run routine")
                  : t("Lag rutine", "Create routine")}
              </small>
            </span>
            {target && (
              <span className="mode-run" aria-hidden="true">
                <Play size={21} fill="currentColor" />
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
  return (
    <HomeGridGuard.Provider value={leaveGrid}>
      <HomePageTools.Provider value={tools.context}>
        <HomeBannerless.Provider value={true}>
          <div
            className="home-overview"
            data-home-banners="off"
            data-phone-section={true}
            data-overview-detail={mode === "advanced"}
          >
            <div className="home-toolbar">
              <div className="home-location">
                <img
                  className="phone-home-mark"
                  src={new URL("brand/smarti-logo.png", document.baseURI).href}
                  alt="SMARTi"
                />
                <MapPin size={15} />
                <span>{h.home_name}</span>
                <span className="home-date">
                  {clock.toLocaleDateString(lang === "en" ? "en-GB" : "nb-NO", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}
                </span>
              </div>
              <div className="home-toolbar-actions">
                {!!model.alerts.length && (
                  <button
                    className="home-toolbar-alert"
                    aria-label={`${t("Trenger din oppmerksomhet", "Needs your attention")}: ${model.alerts.length}`}
                    title={t("Vis varsler", "Show alerts")}
                    aria-haspopup="dialog"
                    onClick={() => setShowAlerts(true)}
                  >
                    <TriangleAlert size={23} aria-hidden="true" />
                    <Bell
                      className="phone-alert-bell"
                      size={22}
                      aria-hidden="true"
                    />
                    <span aria-hidden="true">{model.alerts.length}</span>
                  </button>
                )}
                <HomePageToolButtons tools={tools} lang={lang} />
              </div>
            </div>
            <div className="phone-page-heading" role="heading" aria-level={1}>
              {tab === "misc" && lang !== "en"
                ? "Mer"
                : homeTabs.find((item) => item.id === tab)?.[
                    lang === "en" ? "en" : "nb"
                  ]}
            </div>
            <HomeTabs
              tab={tab}
              change={changeTab}
              lang={lang}
              allowed={allowedTabs}
            >
              {tab === "overview" && (
                <h1 className="home-page-title">{t("Oversikt", "Overview")}</h1>
              )}
              {offline && (
                <p className="home-offline-notice" role="status">
                  {t(
                    "Hjemmet er frakoblet. Tallene kan være gamle, og styringen er satt på pause.",
                    "The home is disconnected. Values may be old; controls are paused.",
                  )}
                </p>
              )}
              {tab === "misc" && (
                <Miscellaneous home={h} lang={lang} offline={offline} />
              )}
              {tab === "media" && (
                <Multimedia
                  home={h}
                  lang={lang}
                  offline={offline}
                  admin={admin}
                />
              )}
              {showAlerts && (
                <SettingsDialog
                  title={t("Trenger din oppmerksomhet", "Needs your attention")}
                  lang={lang}
                  compact
                  onClose={() => setShowAlerts(false)}
                >
                  {offline && (
                    <p>
                      {t(
                        "Forbindelsen er brutt. Dette er sist rapporterte status.",
                        "Connection lost. These are the last reported states.",
                      )}
                    </p>
                  )}
                  <ul className="home-alert-list">
                    {model.alerts.map((c) => (
                      <li key={c.id}>
                        <TriangleAlert size={20} />
                        <span>
                          <strong>{c.name}</strong>
                          <small>
                            {h.areas.find((a) => a.area_id === c.area_id)
                              ?.name || t("Uten rom", "Unassigned")}{" "}
                            ·{" "}
                            {offline
                              ? t("Sist rapportert", "Last reported")
                              : entityState(c.entity_id, c.state, h, lang)}
                          </small>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <button
                    className="home-customize"
                    onClick={() => {
                      setShowAlerts(false);
                      setTab("security");
                    }}
                  >
                    {t("Åpne sikkerhet", "Open security")}{" "}
                    <ChevronRight size={17} />
                  </button>
                </SettingsDialog>
              )}
              {message && (
                <p className="notice" role="status">
                  {message}
                </p>
              )}
              {prefs.isError && (
                <p role="alert">
                  {t(
                    "Favorittvalg kunne ikke lastes.",
                    "Could not load your preferences.",
                  )}{" "}
                  <button onClick={() => prefs.refetch()}>
                    {t("Prøv igjen", "Retry")}
                  </button>
                </p>
              )}
              {configuring && (
                <SettingsDialog
                  title={t("Tilpass Hjem", "Customize Home")}
                  lang={lang}
                  busy={busy}
                  onClose={() => configure(false)}
                >
                  <section className="home-panel home-preferences">
                    <h2>
                      {t(
                        "Dine favoritter. Vårt oppsett.",
                        "Your favorites. Our layout.",
                      )}
                    </h2>
                    <p>
                      {t(
                        "Velg det du vil ha nærmest. SMARTi organiserer resten.",
                        "Choose what matters most. SMARTi organizes the rest.",
                      )}
                    </p>
                    {!pref ? (
                      <p>{t("Laster valg…", "Loading preferences…")}</p>
                    ) : (
                      <fieldset disabled={busy}>
                        <details open>
                          <summary>
                            {t(
                              "Favorittrom og rombilder",
                              "Favorite rooms and room photos",
                            )}
                          </summary>
                          <div className="home-room-options">
                            {h.areas.map((a) => (
                              <div key={a.area_id}>
                                <label>
                                  <input
                                    type="checkbox"
                                    checked={pref.rooms.includes(a.area_id)}
                                    onChange={() =>
                                      savePreference({
                                        rooms: pref.rooms.includes(a.area_id)
                                          ? pref.rooms.filter(
                                              (id) => id !== a.area_id,
                                            )
                                          : [...pref.rooms, a.area_id].slice(
                                              0,
                                              12,
                                            ),
                                      })
                                    }
                                  />
                                  {a.name}
                                </label>
                                {admin && (
                                  <>
                                    <label className="home-upload">
                                      {t("Velg rombilde", "Choose room photo")}
                                      <input
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp"
                                        aria-label={`${t("Rombilde", "Room photo")}: ${a.name}`}
                                        onChange={(e) => {
                                          if (e.target.files?.[0])
                                            void uploadRoom(
                                              a.area_id,
                                              e.target.files[0],
                                            );
                                          e.target.value = "";
                                        }}
                                      />
                                    </label>
                                    {pref.images[a.area_id] && (
                                      <button
                                        onClick={() =>
                                          change(() =>
                                            api(
                                              `home/room-image/${encodeURIComponent(a.area_id)}`,
                                              "PUT",
                                              { data: "" },
                                            ),
                                          )
                                        }
                                      >
                                        {t("Fjern bilde", "Remove photo")}
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            ))}
                          </div>
                          <small>
                            {t(
                              "Uten valgte favoritter vises opptil fire rom automatisk.",
                              "Without favorites, up to four rooms are shown automatically.",
                            )}
                          </small>
                        </details>
                        <details>
                          <summary>
                            {t(
                              "Favorittenheter og handlinger",
                              "Favorite devices and actions",
                            )}
                          </summary>
                          <input
                            aria-label={t(
                              "Søk etter favoritt",
                              "Search favorites",
                            )}
                            value={search}
                            onChange={(e) => searchFor(e.target.value)}
                            placeholder={t(
                              "Søk etter navn eller rom…",
                              "Search by name or room…",
                            )}
                          />
                          <div className="home-favorite-options">
                            {model.controls
                              .filter((c) =>
                                `${c.name} ${h.areas.find((a) => a.area_id === c.area_id)?.name || ""}`
                                  .toLowerCase()
                                  .includes(search.toLowerCase()),
                              )
                              .slice(0, 50)
                              .map((c) => (
                                <label key={c.id}>
                                  <input
                                    type="checkbox"
                                    checked={h.favorites.includes(c.entity_id)}
                                    onChange={() =>
                                      change(() =>
                                        api(
                                          `favorites/${encodeURIComponent(c.entity_id)}`,
                                          "PUT",
                                        ),
                                      )
                                    }
                                  />
                                  {c.name}
                                  <small>
                                    {
                                      h.areas.find(
                                        (a) => a.area_id === c.area_id,
                                      )?.name
                                    }
                                  </small>
                                </label>
                              ))}
                          </div>
                          <small>
                            {t(
                              "Viser opptil 50 treff. Søk for å finne flere.",
                              "Showing up to 50 results. Search to find more.",
                            )}
                          </small>
                        </details>
                        {model.cameras.length > 0 && (
                          <details>
                            <summary>
                              {t("Utvalgte kameraer", "Selected cameras")}
                            </summary>
                            {model.cameras.map((c) => (
                              <label className="home-check" key={c.id}>
                                <input
                                  type="checkbox"
                                  checked={pref.cameras.includes(c.id)}
                                  onChange={() =>
                                    savePreference({
                                      cameras: pref.cameras.includes(c.id)
                                        ? pref.cameras.filter(
                                            (id) => id !== c.id,
                                          )
                                        : [...pref.cameras, c.id].slice(0, 8),
                                    })
                                  }
                                />
                                {c.name}
                              </label>
                            ))}
                          </details>
                        )}
                        <details>
                          <summary>
                            {t(
                              "Hjemme, Borte, Natt og Ferie",
                              "Home, Away, Night and Holiday",
                            )}
                          </summary>
                          <p>
                            {t(
                              "Ingen rutiner velges automatisk. Hver aktivering må bekreftes. Modusknappene viser ikke en målt tilstand.",
                              "No routines are selected automatically. Each activation requires confirmation. Mode buttons do not represent a measured state.",
                            )}
                          </p>
                          {admin ? (
                            modes.map((m) => (
                              <label key={m.id}>
                                {t(m.nb, m.en)}
                                <select
                                  aria-label={`${t("Rutine for", "Routine for")} ${t(m.nb, m.en)}`}
                                  value={pref.modes[m.id] || ""}
                                  onChange={(e) =>
                                    change(() =>
                                      api(`home/modes/${m.id}`, "PUT", {
                                        control_id: e.target.value || null,
                                      }),
                                    )
                                  }
                                >
                                  <option value="">
                                    {t("Ikke konfigurert", "Not configured")}
                                  </option>
                                  {h.controls
                                    .filter((c) =>
                                      [
                                        "scene",
                                        "script",
                                        "automation",
                                      ].includes(c.domain),
                                    )
                                    .map((c) => (
                                      <option key={c.id} value={c.id}>
                                        {c.name} · {c.domain}
                                      </option>
                                    ))}
                                </select>
                              </label>
                            ))
                          ) : (
                            <p>
                              {t(
                                "En administrator kan koble til rutiner.",
                                "An administrator can connect routines.",
                              )}
                            </p>
                          )}
                        </details>
                      </fieldset>
                    )}
                    <button
                      className="home-customize"
                      disabled={busy}
                      onClick={() => configure(false)}
                    >
                      {t("Ferdig", "Done")}
                    </button>
                  </section>
                </SettingsDialog>
              )}
              {tab === "overview" && (
                <SimpleDashboard
                  home={h}
                  lang={lang}
                  offline={offline}
                  renderCards={(dashboardCards) => (
                    <HomeMetrics
                      home={h}
                      selectedEnergy={pref?.energy || null}
                      enhanced
                      offline={offline}
                      lang={lang}
                      openEnergy={() => changeTab("energy")}
                      openClimate={() => changeTab("climate")}
                      renderCards={(metricCards) => (
                        <HomeGrid
                          page="overview"
                          home={h}
                          offline={offline}
                          lang={lang}
                          title={t("Hjemmet med et blikk", "Home at a glance")}
                          cards={[
                            ...dashboardCards.filter(
                              (card) => card.id === "weather",
                            ),
                            {
                              id: "routines",
                              title: t("Rutiner", "Routines"),
                              content: (
                                <section className="home-grid-routines">
                                  <header>
                                    <CardIcon fallback={LayoutGrid} size={22} />
                                    <h2>
                                      <CardTitle>
                                        {t("Rutiner", "Routines")}
                                      </CardTitle>
                                    </h2>
                                    <button
                                      onClick={() => configure(true)}
                                      aria-label={t(
                                        "Velg rutiner",
                                        "Choose routines",
                                      )}
                                    >
                                      <Settings2 size={18} />
                                    </button>
                                  </header>
                                  {routines}
                                </section>
                              ),
                            },
                            ...(canView("people")
                              ? [
                                  {
                                    id: "people",
                                    title: t("Hvem er hjemme", "Who's home"),
                                    content: (
                                      <Presence
                                        home={h}
                                        offline={offline}
                                        lang={lang}
                                        admin={admin}
                                      />
                                    ),
                                  },
                                ]
                              : []),
                            ...dashboardCards.filter(
                              (card) => card.id !== "weather",
                            ),
                            ...metricCards,
                            ...deviceGridCards({
                              controls: model.controls.filter((c) =>
                                [
                                  "light",
                                  "climate",
                                  "media_player",
                                  "vacuum",
                                  "switch",
                                  "input_boolean",
                                  "cover",
                                  "fan",
                                  "lock",
                                  "alarm_control_panel",
                                  "sensor",
                                  "binary_sensor",
                                ].includes(c.domain),
                              ),
                              home: h,
                              offline,
                              lang,
                            }).map((card) => ({
                              ...card,
                              defaultHidden: !favorites.some(
                                (c) =>
                                  `device:${c.entity_id}` === card.id &&
                                  !metricCards.some(
                                    (metric) => metric.entityId === c.entity_id,
                                  ) &&
                                  !dashboardCards.some(
                                    (widget) => widget.entityId === c.entity_id,
                                  ) &&
                                  ![
                                    "climate",
                                    "media_player",
                                    "vacuum",
                                  ].includes(c.domain),
                              ),
                            })),
                            ...equipmentSummaryCards(
                              h,
                              lang,
                              offline,
                              openDevices,
                            ),
                            ...roomList.map((a) => ({
                              id: `room:${a.area_id}`,
                              title: a.name,
                              content: (
                                <RoomSummaryCard
                                  home={h}
                                  area={a}
                                  lang={lang}
                                  offline={offline}
                                  open={() => openRooms(a.area_id)}
                                />
                              ),
                            })),
                            ...(canScenes
                              ? [
                                  {
                                    id: "scenes",
                                    title: t("Scener", "Scenes"),
                                    content: (
                                      <Scenes
                                        home={h}
                                        offline={offline}
                                        admin={admin}
                                        lang={lang}
                                      />
                                    ),
                                    w: 2,
                                    h: 3,
                                  },
                                ]
                              : []),
                          ]}
                        />
                      )}
                    />
                  )}
                />
              )}

              {tab === "lights" && (
                <LightOverview
                  home={h}
                  offline={offline}
                  lang={lang}
                  scenes={canScenes ? () => showLightScenes(true) : undefined}
                />
              )}
              {tab === "climate" && (
                <ClimateOverview
                  key={tab}
                  home={h}
                  offline={offline}
                  lang={lang}
                />
              )}
              {tab === "lights" && lightScenes && canScenes && (
                <SettingsDialog
                  title={t("Scener", "Scenes")}
                  lang={lang}
                  onClose={() => showLightScenes(false)}
                >
                  <Scenes
                    home={h}
                    offline={offline}
                    admin={admin}
                    lang={lang}
                  />
                </SettingsDialog>
              )}
              {tab === "security" && (
                <SecurityOverview
                  home={h}
                  lang={lang}
                  offline={offline}
                  renderControls={renderControls}
                  openDevices={openDevices}
                />
              )}
              {tab === "energy" && (
                <>
                  <CategoryHeading
                    Icon={Zap}
                    title={t("Energi", "Energy")}
                    subtitle={t(
                      "Forbruk og innsikt for hjemmet ditt.",
                      "Consumption and insights for your home.",
                    )}
                    image={homeAsset("home-outdoor")}
                  />
                  <EnergyPlatform
                    admin={admin}
                    lang={lang}
                    home={h}
                    offline={offline}
                    overview={(managedEquipment) => (
                      <EnergyFlow
                        home={h}
                        offline={offline}
                        lang={lang}
                        managedEquipment={managedEquipment}
                        embedded
                      />
                    )}
                    historyExtras={
                      <>
                        {model.meters.length > 0 && (
                          <details id="home-energy">
                            <summary>Detaljert målerhistorikk</summary>
                            <Energy
                              controls={h.controls}
                              meters={model.meters}
                              selected={pref?.energy || null}
                              onSelect={(id) => savePreference({ energy: id })}
                              offline={offline}
                              lang={lang}
                            />
                          </details>
                        )}
                        <Vehicle home={h} offline={offline} lang={lang} />
                      </>
                    }
                  />
                </>
              )}
            </HomeTabs>
            {settingUpMode && canManageModes && (
              <HomeModeSetup
                key={settingUpMode}
                mode={settingUpMode}
                label={t(
                  modes.find((m) => m.id === settingUpMode)!.nb,
                  modes.find((m) => m.id === settingUpMode)!.en,
                )}
                home={h}
                offline={offline}
                lang={lang}
                close={() => setSettingUpMode(null)}
                saved={() => {
                  setSettingUpMode(null);
                  setMessage(
                    t(
                      "Rutinen er lagret og knyttet til modusen. Den ble ikke aktivert.",
                      "The routine is saved and linked to the mode. It was not activated.",
                    ),
                  );
                }}
              />
            )}
          </div>
        </HomeBannerless.Provider>
      </HomePageTools.Provider>
    </HomeGridGuard.Provider>
  );
}

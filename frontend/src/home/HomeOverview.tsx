import { SecurityOverview } from "./SecurityOverview";
import { LightOverview } from "./LightOverview";
import { Multimedia } from "./Multimedia";
import { SettingsDialog } from "./SettingsDialog";
import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  type CSSProperties,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  House,
  Moon,
  Briefcase,
  Plane,
  Settings2,
  Star,
  ArrowUpRight,
  Shield,
  Zap,
  Thermometer,
  Leaf,
  Camera,
  Lightbulb,
  LayoutGrid,
  Sofa,
  CookingPot,
  BedDouble,
  Bath,
  Trees,
  Car,
  ChevronRight,
  MapPin,
  Radio,
  AlertCircle,
} from "lucide-react";
import { api } from "../api";
import type { Home, Control } from "../types";
import { entityState } from "../manage/entityWords";
import { overview, reading, temperature, usable } from "./homeModel";
import { Energy } from "./EnergyOverview";
import { EnergyFlow } from "./EnergyFlow";
import { Scenes } from "./Scenes";
import { HomeTabs, type HomeTab } from "./HomeTabs";
import { ClimateOverview } from "./ClimateOverview";
import { Presence } from "./People";
import { Calendar } from "./Calendar";
import { Vehicle } from "./Vehicle";
import { HomeHighlights } from "./HomeHighlights";
import "./home.css";
import "./homeTabs.css";
export type HomePreferences = {
  rooms: string[];
  energy: string | null;
  cameras: string[];
  modes: Record<string, string | null>;
  images: Record<string, boolean>;
};
const modes = [
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
  residentName,
  home: h,
  offline,
  lang,
  admin,
  renderControls,
  openRooms,
  openDevices,
  add,
}: {
  residentName: string;
  home: Home;
  offline: boolean;
  lang: string;
  admin: boolean;
  renderControls: (c: Control[]) => ReactNode;
  openRooms: (id?: string) => void;
  openDevices: () => void;
  add: () => void;
}) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const qc = useQueryClient();
  const [tab, setTab] = useState<HomeTab>("overview");
  const prefs = useQuery({
    queryKey: ["home-preferences"],
    queryFn: () => api<HomePreferences>("home/preferences"),
  });
  const activity = useQuery({
    queryKey: ["home-activity"],
    queryFn: () =>
      api<{ entity_id: string; state: string; time: string }[]>(
        "home/activity",
      ),
    enabled: !offline && tab === "overview",
    staleTime: 10000,
    refetchInterval: 15000,
  });
  const [configuring, configure] = useState(false),
    [search, searchFor] = useState("");
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [clock, setClock] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);
  const model = useMemo(() => overview(h), [h]);
  const pref = prefs.data;
  const degrees = (value: number) =>
    value.toLocaleString(lang === "en" ? "en-GB" : "nb-NO", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  const roomList = pref?.rooms.length
    ? h.areas.filter((a) => pref.rooms.includes(a.area_id))
    : h.areas.slice(0, 4);
  const favorites = model.controls.filter(
    (c) => c.domain !== "scene" && h.favorites.includes(c.entity_id),
  );
  const hour = clock.getHours();
  const greeting =
    hour < 5
      ? t("God natt", "Good night")
      : hour < 10
        ? t("God morgen", "Good morning")
        : hour < 18
          ? t("God dag", "Good afternoon")
          : t("God kveld", "Good evening");
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
  const displayedCameras = pref?.cameras.length
    ? model.cameras.filter((c) => pref.cameras.includes(c.id))
    : model.cameras;
  return (
    <div className="home-overview">
      <div className="home-toolbar">
        <div className="home-location">
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
        <button
          className="home-customize"
          aria-expanded={configuring}
          onClick={() => configure(!configuring)}
        >
          <Settings2 size={16} />
          {t("Tilpass Hjem", "Personalize Home")}
        </button>
      </div>
      <HomeTabs tab={tab} change={setTab} lang={lang}>
        {tab === "media" && (
          <Multimedia home={h} lang={lang} offline={offline} />
        )}
        {tab === "overview" && (
          <header className="home-welcome">
            <img
              className="home-hero-photo"
              src={homeAsset("home-living")}
              alt=""
              fetchPriority="high"
            />
            <div className="home-welcome-content">
              <span className="home-hero-eyebrow">
                <span />
                {t("Ditt hjem. Din hverdag.", "Your home. Your everyday.")}
              </span>
              <h1>
                {greeting}
                {residentName ? `, ${residentName}` : ""}.
              </h1>
              <p>
                {offline
                  ? t(
                      "Vi venter på ferske data fra hjemmet.",
                      "Waiting for fresh data from your home.",
                    )
                  : model.alerts.length
                    ? t(
                        "Noe trenger oppmerksomheten din.",
                        "Something needs your attention.",
                      )
                    : model.open.length
                      ? t(
                          "Se over åpninger og aktivitet nedenfor.",
                          "Review openings and activity below.",
                        )
                      : t(
                          "Hjemmet ditt, samlet på ett sted.",
                          "Your home, all in one place.",
                        )}
              </p>
            </div>
            <HomeHighlights
              weather={model.weather}
              cameras={displayedCameras}
              controls={h.controls}
              offline={offline}
              lang={lang}
              open={setTab}
            />
            <nav
              className="home-modes"
              aria-label={t("Hjemmemoduser", "Home modes")}
            >
              {modes.map((m) => {
                const target = h.controls.find(
                  (c) => c.id === pref?.modes[m.id],
                );
                return (
                  <button
                    key={m.id}
                    className={target ? "mode-configured" : "mode-unconfigured"}
                    title={
                      target ? target.name : t("Velg rutine", "Choose routine")
                    }
                    disabled={
                      busy || offline || (!!target && !usable(target)) || !pref
                    }
                    onClick={() =>
                      target ? runMode(m.id, t(m.nb, m.en)) : configure(true)
                    }
                  >
                    <m.Icon size={19} />
                    <span>
                      {t(m.nb, m.en)}
                      <small>
                        {target
                          ? t("Kjør rutine", "Run routine")
                          : t("Velg rutine", "Choose routine")}
                      </small>
                    </span>
                  </button>
                );
              })}
            </nav>
            <span className="home-hero-caption">
              {t("Stemningsbilde", "Decorative image")}
            </span>
          </header>
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
                                    : [...pref.rooms, a.area_id].slice(0, 12),
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
                      aria-label={t("Søk etter favoritt", "Search favorites")}
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
                                h.areas.find((a) => a.area_id === c.area_id)
                                  ?.name
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
                                  ? pref.cameras.filter((id) => id !== c.id)
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
                                ["scene", "script", "automation"].includes(
                                  c.domain,
                                ),
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
          <>
            <Presence home={h} offline={offline} lang={lang} admin={admin} />
            {!!model.alerts.length && (
              <button
                className="home-alert-banner"
                onClick={() => setTab("security")}
              >
                <AlertCircle size={22} />
                <span>
                  <strong>
                    {offline
                      ? t(
                          "Sikkerhetsstatus er ukjent",
                          "Security status is unknown",
                        )
                      : t(
                          "Sikkerhet trenger oppmerksomhet",
                          "Security needs attention",
                        )}
                  </strong>
                  <small>
                    {model.alerts
                      .slice(0, 3)
                      .map((c) => c.name)
                      .join(" · ")}
                    {model.alerts.length > 3
                      ? ` +${model.alerts.length - 3}`
                      : ""}
                  </small>
                </span>
                <ChevronRight size={20} />
              </button>
            )}
            <div className="home-status-grid">
              {model.security.length > 0 && (
                <button
                  onClick={() => setTab("security")}
                  className={
                    "home-status " +
                    (model.alerts.length || offline
                      ? "status-warning"
                      : "status-safety")
                  }
                >
                  <Shield />
                  <span>
                    {t("Sikkerhet", "Security")}
                    <strong>
                      {offline
                        ? t("Ukjent status", "Unknown status")
                        : model.alerts.length
                          ? `${model.alerts.length} ${t("å sjekke", "to check")}`
                          : model.open.length
                            ? `${model.open.length} ${t("åpne / aktive", "open / active")}`
                            : t(
                                "Ingen registrerte avvik",
                                "No reported issues",
                              )}
                    </strong>
                    <small>
                      {model.security.length}{" "}
                      {t("tilkoblede målepunkter", "connected signals")}
                    </small>
                  </span>
                </button>
              )}
              {model.meters.length > 0 && (
                <button
                  onClick={() => setTab("energy")}
                  className="home-status status-energy"
                >
                  <Zap />
                  <span>
                    {t("Energi", "Energy")}
                    <strong>
                      {offline
                        ? "—"
                        : reading(
                            model.meters.find((c) => c.id === pref?.energy) ||
                              model.meters[0],
                            lang,
                          )}
                    </strong>
                    <small>
                      {
                        (
                          model.meters.find((c) => c.id === pref?.energy) ||
                          model.meters[0]
                        ).name
                      }
                    </small>
                  </span>
                </button>
              )}
              {model.temperature !== null && (
                <button
                  onClick={() => setTab("climate")}
                  className="home-status status-climate"
                >
                  <Thermometer />
                  <span>
                    {t("Innetemperatur", "Indoor temperature")}
                    <strong>
                      {offline ? "—" : `${degrees(model.temperature)} °C`}
                    </strong>
                    <small>
                      {t("Utvalgte målere i", "Selected readings in")}{" "}
                      {model.temperatureRooms} {t("rom", "rooms")}
                    </small>
                  </span>
                </button>
              )}
              {model.air.length > 0 && (
                <button
                  onClick={() => setTab("climate")}
                  className="home-status status-air"
                >
                  <Leaf />
                  <span>
                    {t("Luft & fuktighet", "Air & humidity")}
                    <strong>
                      {offline ? "—" : reading(model.air[0], lang)}
                    </strong>
                    <small>{model.air[0].name}</small>
                  </span>
                </button>
              )}
              {!model.meters.length &&
                model.controls.some((c) => c.domain === "light") && (
                  <button
                    className="home-status status-energy"
                    onClick={() => setTab("lights")}
                  >
                    <Lightbulb />
                    <span>
                      {t("Lys", "Lights")}
                      <strong>
                        {offline
                          ? "—"
                          : model.controls.filter(
                              (c) =>
                                c.domain === "light" &&
                                usable(c) &&
                                c.state === "on",
                            ).length}{" "}
                        {t("på", "on")}
                      </strong>
                      <small>{t("Styr lysene", "Control lights")}</small>
                    </span>
                  </button>
                )}
              {!model.air.length && model.controls.length > 0 && (
                <button
                  className={
                    "home-status " +
                    (model.unavailable.length || offline
                      ? "status-warning"
                      : "status-connected")
                  }
                  onClick={openDevices}
                >
                  <Radio />
                  <span>
                    {t("Tilkobling", "Connectivity")}
                    <strong>
                      {offline
                        ? t("Venter på data", "Waiting for data")
                        : model.unavailable.length
                          ? `${model.unavailable.length} ${t("å sjekke", "to check")}`
                          : t(
                              "Enhetene er tilgjengelige",
                              "Devices are available",
                            )}
                    </strong>
                    <small>
                      {model.controls.length}{" "}
                      {t("enheter i hjemmet", "controls in your home")}
                    </small>
                  </span>
                </button>
              )}
            </div>
            {!model.controls.length && (
              <section className="home-panel">
                <House />
                <h2>
                  {t("Gjør plass til hjemmet ditt", "Make room for your home")}
                </h2>
                <p>
                  {t(
                    "Rom og funksjoner dukker opp når enhetene er tilgjengelige.",
                    "Rooms and features appear when devices are available.",
                  )}
                </p>
                {admin && (
                  <button onClick={add}>
                    {t("Legg til enhet", "Add device")}
                  </button>
                )}
              </section>
            )}
            {roomList.length > 0 && (
              <section className="home-rooms">
                <header className="home-section-heading">
                  <h2>
                    {pref?.rooms.length
                      ? t("Favorittrom", "Favorite rooms")
                      : t("Rommene dine", "Your rooms")}
                  </h2>
                  <button onClick={() => openRooms()}>
                    {t("Vis alle rom", "View all rooms")}{" "}
                    <ArrowUpRight size={17} />
                  </button>
                </header>
                <div
                  className="home-room-strip"
                  style={
                    {
                      "--room-columns": Math.min(
                        Math.max(roomList.length, 2),
                        4,
                      ),
                    } as CSSProperties
                  }
                >
                  {roomList.map((a, i) => {
                    const controls = model.byRoom.get(a.area_id) || [],
                      temp = controls.find(
                        (c) =>
                          temperature(c) !== null &&
                          (c.domain === "climate" ||
                            c.attributes.device_class === "temperature"),
                      );
                    const mood = roomMood(a.name);
                    const personalPhoto = !!pref?.images[a.area_id];
                    const photo = personalPhoto
                      ? new URL(
                          `api/home/room-image/${encodeURIComponent(a.area_id)}?v=${prefs.dataUpdatedAt}`,
                          document.baseURI,
                        ).href
                      : mood.photo
                        ? homeAsset(mood.photo)
                        : null;
                    return (
                      <button
                        className={`home-room-card room-tone-${i % 4}`}
                        key={a.area_id}
                        onClick={() => openRooms(a.area_id)}
                      >
                        <div
                          className={
                            "home-room-art" + (photo ? " has-photo" : "")
                          }
                        >
                          <mood.Icon
                            className="room-fallback-icon"
                            size={45}
                            strokeWidth={1}
                          />
                          {photo && (
                            <img
                              key={photo}
                              src={photo}
                              alt=""
                              loading="lazy"
                              onError={(e) => {
                                e.currentTarget.hidden = true;
                              }}
                            />
                          )}
                          <span className="home-room-type">
                            <mood.Icon size={17} strokeWidth={1.6} />
                          </span>
                          {photo && !personalPhoto && (
                            <span className="home-room-mood">
                              {t("Stemningsbilde", "Decorative image")}
                            </span>
                          )}
                        </div>
                        <div className="home-room-caption">
                          <strong>{a.name}</strong>
                          <ChevronRight className="home-room-arrow" size={17} />
                          <span>
                            {offline
                              ? t("Venter på data", "Waiting for data")
                              : temp
                                ? `${degrees(temperature(temp)!)} °C`
                                : `${controls.length} ${controls.length === 1 ? t("enhet", "control") : t("enheter", "controls")}`}
                          </span>
                          <small>
                            <Lightbulb size={13} />
                            {offline
                              ? "—"
                              : controls.filter(
                                  (c) =>
                                    c.domain === "light" &&
                                    usable(c) &&
                                    c.state === "on",
                                ).length}{" "}
                            {t("lys på", "lights on")}
                          </small>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}
            <section className="home-favorites">
              <header className="home-section-heading">
                <h2>{t("Nærmest deg", "At your fingertips")}</h2>
                <button onClick={() => configure(true)}>
                  <Star size={16} />
                  {t("Velg favoritter", "Choose favorites")}
                </button>
              </header>
              {favorites.length ? (
                renderControls(favorites.slice(0, 12))
              ) : (
                <div className="home-favorite-hint">
                  <Star />
                  <p>
                    {t(
                      "Velg lys, temperatur og handlinger du bruker ofte.",
                      "Choose lights, temperature and actions you use often.",
                    )}
                  </p>
                  <button onClick={() => configure(true)}>
                    {t("Velg favoritter", "Choose favorites")}
                  </button>
                </div>
              )}
              {favorites.length > 12 && (
                <button onClick={openDevices}>
                  {t("Vis flere enheter", "View more devices")}
                </button>
              )}
            </section>
            <Calendar lang={lang} offline={offline} />
            <Scenes home={h} offline={offline} admin={admin} lang={lang} />
          </>
        )}
        {tab === "lights" && (
          <LightOverview
            home={h}
            offline={offline}
            lang={lang}
            openRoom={openRooms}
            scenes={() =>
              document
                .getElementById("lighting-scenes")
                ?.scrollIntoView({ behavior: "smooth" })
            }
          />
        )}
        {tab === "climate" && (
          <ClimateOverview
            key={tab}
            home={h}
            offline={offline}
            lang={lang}
            renderControls={renderControls}
          />
        )}
        {tab === "lights" && (
          <div id="lighting-scenes">
            <Scenes home={h} offline={offline} admin={admin} lang={lang} />
          </div>
        )}
        {tab === "security" && (
          <SecurityOverview
            home={h}
            lang={lang}
            offline={offline}
            renderControls={renderControls}
          />
        )}
        {tab === "energy" && (
          <EnergyFlow home={h} offline={offline} lang={lang} />
        )}
        {tab === "energy" && !model.meters.length && (
          <section className="home-empty-view">
            <Zap size={32} />
            <h1>
              {t("Her kommer energien din", "Your energy overview starts here")}
            </h1>
            <p>
              {t(
                "Koble en strøm- eller energimåler til SMARTi. Deretter kan du velge målere og grafer her.",
                "Connect a power or energy meter to SMARTi. Then choose your meters and charts here.",
              )}
            </p>
          </section>
        )}
        <div className="home-insights">
          {tab === "energy" && model.meters.length > 0 && (
            <div id="home-energy">
              <Energy
                controls={h.controls}
                meters={model.meters}
                selected={pref?.energy || null}
                onSelect={(id) => savePreference({ energy: id })}
                offline={offline}
                lang={lang}
              />
            </div>
          )}
          {tab === "energy" && (
            <Vehicle home={h} offline={offline} lang={lang} />
          )}
          {tab === "overview" && !!activity.data?.length && (
            <section className="home-panel">
              <h2>{t("Siste aktivitet", "Recent activity")}</h2>
              <small>
                {t(
                  "Observerte endringer siden SMARTi startet. Ikke en komplett hendelseslogg.",
                  "Observed changes since SMARTi started. Not a complete event log.",
                )}
              </small>
              <ul className="home-signal-list">
                {activity.data.slice(0, 6).map((e, i) => (
                  <li key={i}>
                    <span>
                      {
                        h.controls.find((c) => c.entity_id === e.entity_id)
                          ?.name
                      }
                      <small>
                        {entityState(e.entity_id, e.state, h, lang)}
                      </small>
                    </span>
                    <time>
                      {new Date(e.time).toLocaleTimeString(lang, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        {model.unavailable.length > 0 && (
          <button className="home-unavailable" onClick={openDevices}>
            <AlertCircle size={18} />
            {model.unavailable.length}{" "}
            {t(
              model.unavailable.length === 1
                ? "enhet har ukjent eller utilgjengelig status"
                : "enheter har ukjent eller utilgjengelig status",
              model.unavailable.length === 1
                ? "control has unknown or unavailable status"
                : "controls have unknown or unavailable status",
            )}
            <ArrowUpRight size={16} />
          </button>
        )}
      </HomeTabs>
    </div>
  );
}

import { VacuumCard } from "./home/Cleaning";
import {
  Experience,
  ExperiencePicker,
  UserLanguagePicker,
  useExperience,
  useExperiencePreference,
} from "./Experience";
import { SimpleHome } from "./home/SimpleHome";
import { liveConnection } from "./liveConnection";
import { RoomsOverview } from "./rooms/RoomsOverview";
import { ClimateOverview } from "./home/ClimateOverview";
import { LightOverview } from "./home/LightOverview";
import { Groups } from "./Groups";
import { LightColor } from "./LightColor";
import { controlState } from "./controlState";
import { ProtocolLogo } from "./ProtocolLogo";
import { RadioAdvanced } from "./RadioAdvanced";
import { Apps } from "./manage/Apps";
import { AccountAvatar } from "./manage/Accounts";
import { Debugging } from "./manage/Debugging";
import { HomeSettings } from "./manage/HomeSettings";
import { Thermostat } from "./Thermostat";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  House,
  Menu,
  LayoutGrid,
  SlidersHorizontal,
  AppWindow,
  Workflow,
  Blocks,
  DownloadCloud,
  Plus,
  Search,
  ArrowUpRight,
  ArrowLeft,
  Star,
  Lightbulb,
  Plug,
  Thermometer,
  DoorOpen,
  Activity,
  WifiOff,
  ChevronRight,
  Settings,
  LogOut,
  Check,
  AlertCircle,
  LoaderCircle,
  Minus,
  Zap,
} from "lucide-react";
import "@fontsource/bai-jamjuree/400.css";
import "@fontsource/bai-jamjuree/500.css";
import "@fontsource/bai-jamjuree/600.css";
import "@fontsource/bai-jamjuree/700.css";
import "./style.css";
import "./manage/manage.css";
import { Automations } from "./manage/Automations";
import { RoomManager } from "./manage/Rooms";
import { Integrations, Updates } from "./manage/System";
import { PalettePicker, palettes } from "./PalettePicker";
import { RoomView } from "./rooms/RoomView";
import "./palettes.css";
import { HomeOverview } from "./home/HomeOverview";
import { integrationName } from "./branding";
import { api, ApiError, setSession } from "./api";
import { nb, en, type Text } from "./i18n";
import type { Control, Home, Session } from "./types";
import { ProtocolDevices } from "./ProtocolDevices";
import { DeviceSetup } from "./DeviceSetup";
import { readPreference, writePreference } from "./preferences";
const client = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } },
});
const icons = {
  home: House,
  rooms: LayoutGrid,
  devices: SlidersHorizontal,
  automations: Workflow,
  integrations: Blocks,
  apps: AppWindow,
  updates: DownloadCloud,
  more: Settings,
};
type Page = keyof typeof icons;
function Logo() {
  return (
    <div className="brand">
      <img src="./brand/smarti-logo.png" alt="" />
      <span>
        SMART<span className="orange">i</span>
      </span>
    </div>
  );
}
function App() {
  const [guestLang, language] = useState(() =>
    readPreference("smarti-language", "nb", ["nb", "en"]),
  );
  const [theme, setTheme] = useState(() =>
    readPreference("smarti-theme", "light", ["light", "dark"]),
  );
  const [palette, setPalette] = useState(() =>
    readPreference(
      "smarti-palette",
      "smarti",
      palettes.map((p) => p.id),
    ),
  );
  useEffect(() => {
    document.documentElement.dataset.palette = palette;
    writePreference("smarti-palette", palette);
  }, [palette]);
  const [session, updateSession] = useState<Session | null>(null);
  const userLanguage = useQuery({
    queryKey: ["user-language"],
    queryFn: () => api<{ language: string }>("home/language"),
    enabled: !!session,
  });
  const lang = session ? userLanguage.data?.language || "nb" : guestLang;
  const t = lang === "en" ? en : nb;
  const experience = useExperiencePreference(!!session);
  const mode = experience.data?.mode || "advanced";
  const sidebarKey = `smarti-sidebar:${session?.name || "guest"}`;
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  useLayoutEffect(() => {
    setSidebarCollapsed(
      readPreference(sidebarKey, "expanded", ["expanded", "collapsed"]) ===
        "collapsed",
    );
  }, [sidebarKey]);
  function toggleSidebar() {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    writePreference(sidebarKey, next ? "collapsed" : "expanded");
  }
  const sidebarLabel = sidebarCollapsed
    ? lang === "en"
      ? "Expand sidebar"
      : "Utvid sidemenyen"
    : lang === "en"
      ? "Collapse sidebar"
      : "Trekk sammen sidemenyen";
  const [checking, setChecking] = useState(true);
  const [page, setPage] = useState<Page>("home");
  const [dirty, setDirty] = useState(false);
  function guard(work: () => void) {
    if (
      dirty &&
      !window.confirm(
        lang === "en"
          ? "Discard unsaved changes?"
          : "Forkaste ulagrede endringer?",
      )
    )
      return;
    setDirty(false);
    work();
  }
  useEffect(() => {
    setPage((p) =>
      mode === "simple" && !["home", "more"].includes(p) ? "home" : p,
    );
  }, [mode]);
  const mainNav = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const nav = mainNav.current;
    if (!nav) return;
    const center = () => {
      const selected = nav.querySelector<HTMLElement>('[aria-current="page"]');
      if (!selected || nav.scrollWidth <= nav.clientWidth) return;
      const item = selected.getBoundingClientRect(),
        box = nav.getBoundingClientRect();
      nav.scrollTo({
        left:
          nav.scrollLeft +
          item.left -
          box.left -
          nav.clientLeft +
          item.width / 2 -
          nav.clientWidth / 2,
        behavior: "instant",
      });
    };
    center();
    const observer = new ResizeObserver(center);
    observer.observe(nav);
    nav.querySelectorAll("button").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [page, mode, lang, session?.role]);
  const navigate = (p: Page) => guard(() => setPage(p));
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    writePreference("smarti-theme", theme);
  }, [theme]);
  useEffect(() => {
    document.documentElement.lang = lang;
    writePreference("smarti-language", lang);
  }, [lang]);
  useEffect(() => {
    api<Session>("session")
      .then((v) => {
        setSession(v);
        updateSession(v);
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);
  useEffect(() => {
    if (!session) return;
    let active = true;
    const refresh = () => {
      void api<Session>("session")
        .then((v) => {
          if (!active) return;
          setSession(v);
          updateSession(v);
        })
        .catch(() => {});
    };
    const timer = setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [session?.name]);
  function signedIn(v: Session) {
    setSession(v);
    updateSession(v);
    client.clear();
  }
  async function logout() {
    await api("logout", "POST");
    setSession(null);
    updateSession(null);
    client.clear();
  }
  if (checking || (session && experience.isLoading))
    return (
      <div className="loading">
        <Logo />
        <LoaderCircle className="spin" />
        <p>{t.loading}</p>
      </div>
    );
  if (!session)
    return <Login t={t} lang={lang} language={language} signedIn={signedIn} />;
  return (
    <Experience.Provider value={mode}>
      <div
        className="shell"
        data-experience={mode}
        data-sidebar={sidebarCollapsed ? "collapsed" : "expanded"}
      >
        <aside className="sidebar">
          <button
            className="sidebar-toggle"
            onClick={toggleSidebar}
            aria-label={sidebarLabel}
            title={sidebarLabel}
            aria-expanded={!sidebarCollapsed}
            aria-controls="main-navigation"
          >
            <Menu size={24} aria-hidden="true" />
          </button>
          <Logo />
          <div className="sidebar-label">SMART LIVING, SIMPLIFIED.</div>
          <nav
            id="main-navigation"
            ref={mainNav}
            aria-label={lang === "en" ? "Main navigation" : "Hovedmeny"}
          >
            {(Object.keys(icons) as Page[])
              .filter(
                (p) =>
                  session.role === "admin" ||
                  !["automations", "integrations", "apps", "updates"].includes(
                    p,
                  ),
              )
              .filter(
                (p) =>
                  mode === "advanced" ||
                  (mode === "simple"
                    ? ["home", "more"].includes(p)
                    : !["integrations", "apps", "updates"].includes(p)),
              )
              .map((p) => {
                const Icon = icons[p];
                return (
                  <button
                    key={p}
                    className={page === p ? "nav-item active" : "nav-item"}
                    aria-label={t[p]}
                    title={sidebarCollapsed ? t[p] : undefined}
                    aria-current={page === p ? "page" : undefined}
                    onClick={() => navigate(p)}
                  >
                    <Icon size={21} />
                    <span>{t[p]}</span>
                    {page === p && <span className="nav-dot" />}
                  </button>
                );
              })}
          </nav>
          <div className="sidebar-bottom">
            <AccountAvatar name={session.name} />
            <div>
              <strong>{session.name}</strong>
              <small>{session.role === "admin" ? t.admin : t.user}</small>
            </div>
            <button
              className="icon-button"
              aria-label={t.logout}
              title={t.logout}
              onClick={logout}
            >
              <LogOut size={18} />
            </button>
          </div>
        </aside>
        <div className="workspace">
          <Dashboard
            t={t}
            session={session}
            page={page}
            setPage={navigate}
            guard={guard}
            onDirty={setDirty}
            palette={palette}
            setPalette={setPalette}
            theme={theme}
            setTheme={setTheme}
            lang={lang}
            language={language}
            logout={logout}
          />
        </div>
      </div>
    </Experience.Provider>
  );
}
function Login({
  t,
  lang,
  language,
  signedIn,
}: {
  t: Text;
  lang: string;
  language: (s: string) => void;
  signedIn: (s: Session) => void;
}) {
  const setup = useQuery({
    queryKey: ["bootstrap"],
    queryFn: () => api<{ configured: boolean; mode: string }>("bootstrap"),
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const first = setup.data && !setup.data.configured;
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError("");
    let creating = Boolean(first);
    try {
      if (first) {
        await api("bootstrap", "POST", { ...values, language: lang });
        creating = false;
        await setup.refetch();
      }
      const s = await api<Session>("login", "POST", {
        name: values.name,
        password: values.password,
      });
      signedIn(s);
    } catch (err) {
      if (err instanceof ApiError) {
        const messages: Record<string, string> = {
          origin_rejected: t.originError,
          invalid_setup_secret: t.secretError,
          already_configured: t.alreadyConfigured,
          invalid_timezone: t.timezoneError,
          validation_error: t.validationError,
        };
        setError(
          err.status === 429
            ? t.rateError
            : messages[err.code] || (creating ? t.setupError : t.loginError),
        );
        if (err.code === "already_configured") await setup.refetch();
      } else {
        setError(t.connectionError);
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login">
      <section className="login-art">
        <Logo />
        <div>
          <span className="eyebrow">SMART LIVING, SIMPLIFIED.</span>
          <h1>{t.loginTitle}</h1>
          <div className="login-logo-art">
            <img src="./brand/smarti-logo.png" alt="SMARTi" />
          </div>
        </div>
        <small>SMARTi · {t.live}</small>
      </section>
      <section className="login-form">
        <div className="language-switch">
          <button onClick={() => language("nb")} aria-pressed={lang === "nb"}>
            Norsk
          </button>
          <span>/</span>
          <button onClick={() => language("en")} aria-pressed={lang === "en"}>
            English
          </button>
        </div>
        <div className="login-inner">
          <span className="eyebrow">
            {setup.data?.mode === "demo" ? t.demo : "SMARTi"}
          </span>
          <h2>{first ? t.firstTitle : t.welcome}</h2>
          <p>{first ? t.firstHint : t.loginHint}</p>
          {setup.isError ? (
            <p role="alert">{t.loadError}</p>
          ) : (
            <form onSubmit={submit}>
              {first && (
                <>
                  <label>
                    {t.homeName}
                    <input
                      name="home_name"
                      required
                      maxLength={80}
                      defaultValue={lang === "nb" ? "Mitt hjem" : "My home"}
                    />
                  </label>
                  <label>
                    {t.secret}
                    <input
                      name="secret"
                      type="password"
                      required
                      autoComplete="off"
                    />
                  </label>
                </>
              )}
              <label>
                {t.username}
                <input
                  name="name"
                  required
                  maxLength={80}
                  autoComplete="username"
                  pattern="[\w.@-]+"
                />
              </label>
              <label>
                {t.password}
                <input
                  name="password"
                  type="password"
                  required
                  minLength={12}
                  maxLength={128}
                  autoComplete={first ? "new-password" : "current-password"}
                  placeholder={t.passwordHint}
                />
              </label>
              {first && (
                <label>
                  {t.timezone}
                  <input name="timezone" defaultValue="Europe/Oslo" required />
                </label>
              )}
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <button className="primary" disabled={busy || setup.isLoading}>
                {busy ? (
                  <LoaderCircle className="spin" size={18} />
                ) : first ? (
                  t.create
                ) : (
                  t.login
                )}
                <ArrowUpRight size={18} />
              </button>
            </form>
          )}
          {setup.data?.mode === "demo" && <p className="note">{t.demoHint}</p>}
        </div>
      </section>
    </div>
  );
}
function Dashboard({
  palette,
  setPalette,
  t,
  session,
  page,
  setPage,
  guard,
  onDirty,
  theme,
  setTheme,
  lang,
  language,
  logout,
}: {
  palette: string;
  setPalette: (s: string) => void;
  t: Text;
  session: Session;
  page: Page;
  setPage: (p: Page) => void;
  guard: (work: () => void) => void;
  onDirty: (value: boolean) => void;
  theme: string;
  setTheme: (s: string) => void;
  lang: string;
  language: (s: string) => void;
  logout: () => void;
}) {
  const mode = useExperience();
  const queryClient = useQueryClient();
  const home = useQuery({
    queryKey: ["home"],
    queryFn: () => api<Home>("home"),
    refetchInterval: 30000,
  });
  const [streamConnected, streamStatus] = useState(true);
  const [room, setRoom] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [pairedDevice, setPairedDevice] = useState<{
    id?: string;
    name?: string;
    provider: string;
  } | null>(null);
  const [roomEditing, setRoomEditing] = useState(false);
  const [settingsSection, setSettingsSection] = useState("household");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [protocol, setProtocol] = useState("all");
  useEffect(() => {
    let homeRevision: number | undefined;
    let radioRevision: number | undefined;
    const onMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        const homeChanged =
          typeof data.revision === "number" && data.revision !== homeRevision;
        const radioChanged =
          typeof data.radio_revision === "number" &&
          data.radio_revision !== radioRevision;
        homeRevision = data.revision;
        radioRevision = data.radio_revision;
        // Let an in-flight fetch finish rather than cancelling it on busy networks.
        if (homeChanged)
          void queryClient.invalidateQueries(
            { queryKey: ["home"] },
            { cancelRefetch: false },
          );
        if (homeChanged || radioChanged) {
          for (const key of [
            "protocol-devices",
            "device-detail",
            "paired-device",
          ]) {
            void queryClient.invalidateQueries(
              { queryKey: [key] },
              { cancelRefetch: false },
            );
          }
        }
        if (radioChanged)
          void queryClient.invalidateQueries(
            { queryKey: ["zigbee-connection"] },
            { cancelRefetch: false },
          );
      } catch {
        /* Ignore incomplete event frames; polling remains a fallback. */
      }
    };
    return liveConnection(
      streamStatus,
      onMessage,
      () => {
        void queryClient.invalidateQueries(
          { queryKey: ["home"] },
          { cancelRefetch: false },
        );
      },
      () => window.location.reload(),
    );
  }, [queryClient]);
  useEffect(() => {
    setAdding(false);
    setRoomEditing(false);
  }, [page]);
  if (home.isLoading)
    return (
      <div className="loading">
        <LoaderCircle className="spin" />
        <p>{t.loading}</p>
      </div>
    );
  if (!home.data)
    return (
      <div className="empty">
        <AlertCircle />
        <h2>{t.loadError}</h2>
        <button onClick={() => home.refetch()}>{t.retry}</button>
      </div>
    );
  const h = home.data;
  const offline = !h.connected || !streamConnected || home.isError;
  const regular = h.controls.filter(
    (c) => !c.diagnostic && c.domain !== "automation",
  );
  const roomName = (id: string | null) =>
    h.areas.find((a) => a.area_id === id)?.name || t.unassigned;
  function cards(controls: Control[]) {
    return (
      <div className="controls-grid">
        {controls.map((c) =>
          c.domain === "vacuum" ? (
            <VacuumCard
              key={c.id}
              c={c}
              home={h}
              lang={lang}
              offline={offline}
            />
          ) : (
            <Device
              key={c.id}
              c={c}
              t={t}
              h={h}
              offline={offline}
              roomName={roomName(c.area_id)}
              admin={session.role === "admin"}
            />
          ),
        )}
      </div>
    );
  }
  const rooms = [
    ...h.areas,
    ...(regular.some((c) => !c.area_id)
      ? [{ area_id: "", name: t.unassigned }]
      : []),
  ];
  const selected = regular.filter(
    (c) =>
      (room === null || c.area_id === (room || null)) &&
      `${c.name} ${roomName(c.area_id)}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (filter === "all" ||
        (filter === "sensors"
          ? ["sensor", "binary_sensor"].includes(c.domain)
          : c.domain === filter)),
  );
  return (
    <>
      <header className="topbar">
        <div className="breadcrumb">
          <img
            className="mobile-logo"
            src="./brand/smarti-logo.png"
            alt="SMARTi"
          />
          <House size={17} />
          <span>{h.home_name}</span>
          <span className="separator">/</span>
          <span>{t[page]}</span>
        </div>
        <div className="top-actions">
          <span className={"connection " + (offline ? "warning" : "")}>
            <span />
            {h.mode === "demo" ? t.demo : offline ? t.unknown : t.connected}
          </span>
        </div>
      </header>
      <main>
        {h.mode === "demo" && (
          <div className="demo-strip">
            <span>DEMO</span>
            {t.demoHint}
          </div>
        )}
        {offline && (
          <div className="notice" role="alert">
            <WifiOff size={20} />
            <span>
              {!streamConnected || home.isError
                ? t.hubLost
                : h.error === "configuration_required"
                  ? t.notConfigured
                  : t.disconnected}
            </span>
          </div>
        )}
        {mode !== "simple" && page === "rooms" && !roomEditing && !adding && (
          <nav
            className="tabs room-switcher"
            aria-label={lang === "en" ? "Choose room" : "Velg rom"}
          >
            <button
              className={room === null ? "selected" : ""}
              aria-pressed={room === null}
              onClick={() => setRoom(null)}
            >
              {t.allRooms}
            </button>
            {rooms.map((a) => (
              <button
                key={a.area_id}
                className={room === a.area_id ? "selected" : ""}
                aria-pressed={room === a.area_id}
                onClick={() => setRoom(a.area_id)}
              >
                {a.name}
              </button>
            ))}
          </nav>
        )}
        {mode === "simple" && ["home", "rooms"].includes(page) ? (
          <SimpleHome
            home={h}
            lang={lang}
            offline={offline}
            renderControls={cards}
          />
        ) : roomEditing && page === "rooms" && session.role === "admin" ? (
          <RoomManager lang={lang} back={() => setRoomEditing(false)} />
        ) : adding ? (
          <DeviceSetup
            lang={lang}
            onBack={() => setAdding(false)}
            onPaired={(device) => {
              setPairedDevice(device);
              setAdding(false);
              setPage("devices");
              setProtocol(device.provider);
              setSearch("");
              setRoom(null);
            }}
          />
        ) : page === "home" ? (
          <HomeOverview
            residentName={session.name}
            home={h}
            offline={offline}
            lang={lang}
            admin={session.role === "admin"}
            renderControls={cards}
            openRooms={(id) => {
              setSearch("");
              setFilter("all");
              setRoom(id ?? null);
              setPage("rooms");
            }}
            openDevices={() => {
              setRoom(null);
              setSearch("");
              setFilter("all");
              setProtocol("all");
              setPage("devices");
            }}
            add={() => setAdding(true)}
          />
        ) : page === "rooms" && room !== null ? (
          <RoomView
            key={room}
            home={h}
            room={room}
            rooms={rooms}
            offline={offline}
            lang={lang}
            admin={session.role === "admin"}
            renderControls={cards}
            add={() => setAdding(true)}
          />
        ) : page === "rooms" && room === null ? (
          <RoomsOverview
            home={h}
            lang={lang}
            offline={offline}
            openRoom={setRoom}
            manage={
              session.role === "admin" ? () => setRoomEditing(true) : undefined
            }
          />
        ) : page === "devices" || page === "rooms" ? (
          <>
            {!(
              page === "devices" &&
              protocol === "all" &&
              ["light", "climate"].includes(filter)
            ) && (
              <div className="page-heading">
                <span className="eyebrow">{t.overview}</span>
                <div className="heading-row">
                  <h1>
                    {page === "rooms"
                      ? room === null
                        ? t.rooms
                        : roomName(room)
                      : t.devices}
                  </h1>
                  {session.role === "admin" && (
                    <button
                      className="primary compact"
                      onClick={() =>
                        page === "rooms"
                          ? setRoomEditing(true)
                          : setAdding(true)
                      }
                    >
                      <Plus size={18} />
                      {page === "devices"
                        ? lang === "nb"
                          ? "Legg til ny enhet"
                          : "Add new device"
                        : lang === "en"
                          ? "Manage rooms"
                          : "Administrer rom"}
                    </button>
                  )}
                </div>
                <p>
                  {page === "rooms"
                    ? t.roomHint
                    : protocol !== "all"
                      ? lang === "nb"
                        ? "Enheter gruppert etter protokoll"
                        : "Devices grouped by protocol"
                      : `${regular.length} ${t.controls} · ${h.areas.length} ${t.rooms.toLowerCase()}`}
                </p>
              </div>
            )}
            {page === "devices" && (
              <div
                className="tabs protocol-navigation"
                data-protocol={protocol}
                aria-label={lang === "nb" ? "Protokoller" : "Protocols"}
              >
                {[
                  ["all", lang === "nb" ? "Alle kontroller" : "All controls"],
                  ["groups", lang === "nb" ? "Grupper" : "Groups"],
                  ["zigbee2mqtt", "Zigbee"],
                  ["zwave_js", "Z-Wave"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    aria-pressed={protocol === id}
                    className={protocol === id ? "selected" : ""}
                    onClick={() => setProtocol(id)}
                  >
                    {id === "all" || id === "groups" ? (
                      <LayoutGrid size={17} />
                    ) : (
                      <ProtocolLogo
                        provider={id}
                        className="protocol-tab-logo"
                        label=""
                      />
                    )}
                    {label}
                  </button>
                ))}
                {protocol !== "all" &&
                  protocol !== "groups" &&
                  session.role === "admin" && (
                    <RadioAdvanced
                      provider={protocol}
                      lang={lang === "en" ? "en" : "nb"}
                    />
                  )}
              </div>
            )}
            {page === "devices" && protocol === "groups" ? (
              <Groups home={h} lang={lang} admin={session.role === "admin"} />
            ) : page === "devices" && protocol !== "all" ? (
              <ProtocolDevices
                key={protocol}
                provider={protocol}
                pairedDevice={
                  pairedDevice?.provider === protocol ? pairedDevice : null
                }
                lang={lang === "en" ? "en" : "nb"}
                admin={session.role === "admin"}
              />
            ) : (
              <>
                <div className="device-toolbar">
                  {!["light", "climate"].includes(filter) && (
                    <label className="search">
                      <Search size={19} />
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t.search}
                        aria-label={t.search}
                      />
                    </label>
                  )}
                  <select
                    aria-label={t.devices}
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    {[
                      ["all", t.all],
                      ["light", t.lights],
                      ["climate", t.climate],
                      ["switch", t.switches],
                      ["sensors", t.sensors],
                    ].map(([v, label]) => (
                      <option key={v} value={v}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                {filter !== "light" ? null : (
                  <LightOverview
                    home={h}
                    offline={offline}
                    lang={lang}
                    openRoom={(id) => {
                      setPage("rooms");
                      setRoom(id);
                    }}
                  />
                )}
                {filter === "climate" && (
                  <ClimateOverview
                    home={h}
                    offline={offline}
                    lang={lang}
                    renderControls={cards}
                  />
                )}
                {!["light", "climate"].includes(filter) &&
                  (regular.length ? (
                    selected.length ? (
                      cards(selected)
                    ) : (
                      <p className="empty">{t.noResults}</p>
                    )
                  ) : (
                    <Empty t={t} add={() => setAdding(true)} />
                  ))}
              </>
            )}
          </>
        ) : page === "automations" && session.role === "admin" ? (
          <Automations lang={lang} home={h} onDirty={onDirty} />
        ) : page === "integrations" && session.role === "admin" ? (
          <Integrations lang={lang} />
        ) : page === "apps" && session.role === "admin" ? (
          <Apps lang={lang} />
        ) : page === "updates" && session.role === "admin" ? (
          <Updates lang={lang} />
        ) : (
          <>
            <div className="page-heading">
              <span className="eyebrow">SMARTi</span>
              <h1>{t.settings}</h1>
            </div>
            <ExperiencePicker lang={lang} />
            <nav
              className="management-tabs settings-sections"
              aria-label={
                lang === "en" ? "Settings sections" : "Innstillingskategorier"
              }
            >
              {[
                ...(session.role === "admin" && mode !== "simple"
                  ? [
                      [
                        "household",
                        lang === "en" ? "Home and people" : "Hjem og personer",
                      ],
                      [
                        "backups",
                        lang === "en" ? "Backups" : "Sikkerhetskopiering",
                      ],
                      ["network", lang === "en" ? "Network" : "Nettverk"],
                      ["system", "System"],
                      ...(mode === "advanced"
                        ? [["debugging", "Debugging"]]
                        : []),
                    ]
                  : []),
                [
                  "appearance",
                  lang === "en" ? "Theme and appearance" : "Tema og utseende",
                ],
              ].map(([key, label]) => (
                <button
                  key={key}
                  className={
                    settingsSection === key ||
                    ((session.role !== "admin" || mode === "simple") &&
                      key === "appearance")
                      ? "selected"
                      : ""
                  }
                  aria-current={
                    settingsSection === key ||
                    ((session.role !== "admin" || mode === "simple") &&
                      key === "appearance")
                      ? "page"
                      : undefined
                  }
                  onClick={() => guard(() => setSettingsSection(key))}
                >
                  {label}
                </button>
              ))}
            </nav>
            {mode === "advanced" &&
            session.role === "admin" &&
            settingsSection === "debugging" ? (
              <Debugging lang={lang} />
            ) : mode !== "simple" &&
              session.role === "admin" &&
              settingsSection !== "appearance" &&
              settingsSection !== "debugging" ? (
              <HomeSettings
                key={settingsSection}
                lang={lang}
                home={h}
                section={
                  settingsSection as
                    "household" | "backups" | "network" | "system"
                }
              />
            ) : (
              <>
                <div className="settings-layout">
                  {session.role !== "admin" && (
                    <section className="settings-panel">
                      <h2>
                        <Activity size={21} />
                        {t.status}
                      </h2>
                      <dl>
                        <div>
                          <dt>{t.process}</dt>
                          <dd>
                            <Check size={16} />
                            {t.running}
                          </dd>
                        </div>
                        <div>
                          <dt>{t.ha}</dt>
                          <dd>{h.connected ? t.connected : t.unknown}</dd>
                        </div>
                        <div>
                          <dt>{t.version}</dt>
                          <dd>{h.ha_version || "—"}</dd>
                        </div>
                      </dl>
                      <p className="note">{t.radioHint}</p>
                    </section>
                  )}
                  <section className="settings-panel">
                    <h2>
                      <Settings size={21} />
                      {lang === "en"
                        ? "Theme and appearance"
                        : "Tema og utseende"}
                    </h2>
                    <label>
                      {t.appearance}
                      <select
                        value={theme}
                        onChange={(e) => setTheme(e.target.value)}
                      >
                        <option value="light">{t.light}</option>
                        <option value="dark">{t.dark}</option>
                      </select>
                    </label>
                    <PalettePicker
                      value={palette}
                      change={setPalette}
                      lang={lang}
                    />
                    <UserLanguagePicker lang={lang} />
                    <button className="text-button" onClick={logout}>
                      <LogOut size={17} />
                      {t.logout}
                    </button>
                  </section>
                </div>
              </>
            )}
          </>
        )}
      </main>
      <footer>
        SMARTi <span>SMART LIVING, SIMPLIFIED.</span>
        <span>{h.mode === "demo" ? t.demo : t.live}</span>
      </footer>
    </>
  );
}
function Empty({ t, add }: { t: Text; add: () => void }) {
  return (
    <div className="empty">
      <House size={48} strokeWidth={1} />
      <h2>{t.empty}</h2>
      <p>{t.emptyHint}</p>
      <button className="primary" onClick={add}>
        <Plus size={18} />
        {t.add}
      </button>
    </div>
  );
}
function Device({
  c,
  t,
  h,
  offline,
  roomName,
  admin,
}: {
  c: Control;
  t: Text;
  h: Home;
  offline: boolean;
  roomName: string;
  admin: boolean;
}) {
  const mode = useExperience();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [details, showDetails] = useState(false);
  const [brightness, setBrightness] = useState(
    Math.round((Number(c.attributes.brightness || 0) / 255) * 100),
  );
  useEffect(
    () =>
      setBrightness(
        Math.round((Number(c.attributes.brightness || 0) / 255) * 100),
      ),
    [c.attributes.brightness],
  );
  const can =
    c.availability === "available" &&
    !offline &&
    !(c.domain === "automation" && !admin);
  const battery = c.device_id
    ? h.controls.find(
        (v) =>
          v.device_id === c.device_id &&
          v.attributes.device_class === "battery",
      )
    : undefined;
  const device = h.devices.find((v) => v.id === c.device_id);
  const power = c.capabilities.some((v) => v.kind === "power");
  const dim = c.capabilities.find((v) => v.kind === "brightness");
  const Icon =
    c.domain === "light"
      ? Lightbulb
      : c.domain === "switch"
        ? Plug
        : c.domain === "climate" || c.attributes.device_class === "temperature"
          ? Thermometer
          : c.domain === "binary_sensor"
            ? DoorOpen
            : c.domain === "automation"
              ? Zap
              : Activity;
  async function command(action: string, value?: number | number[]) {
    const actionNames: Record<string, string> =
      document.documentElement.lang === "en"
        ? {
            activate: "Activate",
            lock: "Lock",
            unlock: "Unlock",
            open_cover: "Open",
            close_cover: "Close",
          }
        : {
            activate: "Aktiver",
            lock: "Lås",
            unlock: "Lås opp",
            open_cover: "Åpne",
            close_cover: "Lukk",
          };
    const confirmed = [
      "activate",
      "lock",
      "unlock",
      "open_cover",
      "close_cover",
    ].includes(action);
    if (confirmed && !window.confirm(`${c.name}: ${actionNames[action]}?`))
      return;
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      const result = await api<{ status: string }>(
        `controls/${encodeURIComponent(c.entity_id)}/commands`,
        "POST",
        { action, confirmed, ...(value === undefined ? {} : { value }) },
      );
      setMessage(
        result.status === "simulated"
          ? t.simulated
          : result.status === "state_updated"
            ? t.updated
            : t.accepted,
      );
      await qc.invalidateQueries({ queryKey: ["home"] });
    } catch {
      setFailed(true);
      setMessage(t.commandError);
    } finally {
      setBusy(false);
    }
  }
  async function favorite() {
    try {
      await api(`favorites/${encodeURIComponent(c.entity_id)}`, "PUT");
      await qc.invalidateQueries({ queryKey: ["home"] });
    } catch {
      setFailed(true);
      setMessage(t.loadError);
    }
  }
  const state = controlState(c, c.state, document.documentElement.lang);
  return (
    <article
      className={
        "device " +
        (c.state === "on" ? "is-on " : "") +
        (c.availability !== "available" ? "is-unavailable" : "")
      }
    >
      <div className="device-top">
        <span className="device-icon">
          <Icon size={24} strokeWidth={1.5} />
        </span>
        <button
          className={
            "icon-button star " +
            (h.favorites.includes(c.entity_id) ? "starred" : "")
          }
          aria-label={`${t.favorite}: ${c.name}`}
          aria-pressed={h.favorites.includes(c.entity_id)}
          onClick={favorite}
        >
          <Star size={17} />
        </button>
      </div>
      <div className="device-title">
        <span>{roomName}</span>
        <h3>{c.name}</h3>
      </div>
      <div className="device-value">
        {c.domain === "climate" ? (
          <Thermostat
            c={{ ...c, availability: offline ? "unavailable" : c.availability }}
            lang={document.documentElement.lang}
            disabled={!can || busy}
            change={(value) => void command("set_temperature", value)}
          />
        ) : c.domain === "sensor" && c.availability === "available" ? (
          <span className="big-value">
            {c.state}
            <small>{String(c.attributes.unit_of_measurement || "")}</small>
          </span>
        ) : (
          <span className="state">
            <span className={c.state === "on" ? "state-dot on" : "state-dot"} />
            {state}
          </span>
        )}
        {power && (
          <button
            className={mode === "simple" ? "simple-power" : "toggle"}
            role="switch"
            aria-checked={c.state === "on"}
            aria-label={`${c.name}: ${c.state === "on" ? t.off : t.on}`}
            disabled={!can || busy}
            onClick={() => command(c.state === "on" ? "turn_off" : "turn_on")}
          >
            {mode === "simple" ? (
              document.documentElement.lang === "en" ? (
                c.state === "on" ? (
                  "Turn off"
                ) : (
                  "Turn on"
                )
              ) : c.state === "on" ? (
                "Slå av"
              ) : (
                "Slå på"
              )
            ) : (
              <span />
            )}
          </button>
        )}
      </div>
      {c.capabilities.some((v) =>
        v.actions.some((a) =>
          [
            "activate",
            "lock",
            "unlock",
            "open_cover",
            "close_cover",
            "stop_cover",
          ].includes(a),
        ),
      ) && (
        <div className="home-device-actions">
          {c.capabilities
            .flatMap((v) => v.actions)
            .filter((a) =>
              [
                "activate",
                "lock",
                "unlock",
                "open_cover",
                "close_cover",
                "stop_cover",
              ].includes(a),
            )
            .map((action) => (
              <button
                key={action}
                disabled={!can || busy}
                onClick={() => command(action)}
              >
                {
                  (document.documentElement.lang === "en"
                    ? {
                        activate: "Activate",
                        lock: "Lock",
                        unlock: "Unlock",
                        open_cover: "Open",
                        close_cover: "Close",
                        stop_cover: "Stop",
                      }
                    : {
                        activate: "Aktiver",
                        lock: "Lås",
                        unlock: "Lås opp",
                        open_cover: "Åpne",
                        close_cover: "Lukk",
                        stop_cover: "Stopp",
                      })[action as "activate"]
                }
              </button>
            ))}
        </div>
      )}
      {c.domain === "light" && (
        <details
          className="device-color-options"
          open={mode === "advanced" ? true : undefined}
        >
          <summary>
            {document.documentElement.lang === "en"
              ? "Light colour"
              : "Farge på lyset"}
          </summary>
          <LightColor
            c={c}
            lang={document.documentElement.lang}
            disabled={!can || busy}
            change={(action, value) => void command(action, value)}
          />
        </details>
      )}
      {dim && (
        <label className="range-label">
          <span>
            {t.brightness}
            <strong>
              {c.availability === "available" ? brightness + "%" : "—"}
            </strong>
          </span>
          <input
            aria-label={`${c.name}: ${t.brightness}`}
            type="range"
            min="0"
            max="100"
            step="1"
            value={brightness}
            disabled={!can || busy}
            onChange={(e) => setBrightness(Number(e.target.value))}
            onPointerUp={(e) =>
              command("set_brightness", Number(e.currentTarget.value))
            }
            onKeyUp={(e) => {
              if (
                [
                  "ArrowLeft",
                  "ArrowRight",
                  "ArrowUp",
                  "ArrowDown",
                  "Home",
                  "End",
                ].includes(e.key)
              )
                command("set_brightness", Number(e.currentTarget.value));
            }}
          />
        </label>
      )}

      {mode !== "simple" && (
        <button
          className="device-details"
          aria-expanded={details}
          onClick={() => showDetails(!details)}
        >
          {t.details}
          <ChevronRight size={14} />
        </button>
      )}
      {details && mode !== "simple" && (
        <dl className="details">
          <dt>SMARTi</dt>
          <dd>{c.entity_id}</dd>
          <dt>{t.source}</dt>
          <dd>{c.integration ? integrationName(c.integration) : t.unknown}</dd>
          <dt>{t.physical}</dt>
          <dd>{c.device_id || "—"}</dd>
          {battery && (
            <>
              <dt>{t.battery}</dt>
              <dd>
                {battery.availability === "available"
                  ? `${battery.state}%`
                  : battery.availability === "unknown"
                    ? t.unknown
                    : t.unavailable}
              </dd>
            </>
          )}
          {device?.availability === "partially_available" && (
            <>
              <dt>{t.availability}</dt>
              <dd>{t.partial}</dd>
            </>
          )}
          <dt>{t.lastUpdate}</dt>
          <dd>
            {c.updated_at ? new Date(c.updated_at).toLocaleString() : t.unknown}
          </dd>
          <dt>{t.locality}</dt>
          <dd>{t.unknown}</dd>
        </dl>
      )}
      {(busy || message) && (
        <p
          className={"command-message " + (failed ? "form-error" : "")}
          role="status"
        >
          {busy ? t.pending : message}
        </p>
      )}
    </article>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);

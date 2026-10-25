import "./manage/settingsOverview.css";
import { Database, Network, Server, Code, Palette } from "lucide-react";
import { PhoneSettings } from "./PhoneSettings";
import { Scenes } from "./home/Scenes";
import { PagedControls } from "./PagedControls";
import { DiscoveredDevices, useDiscoveries } from "./manage/DiscoveredDevices";
import { SettingsDialog, InSettingsDialog } from "./home/SettingsDialog";
import { ControlHistory } from "./ControlHistory";
import "./controlDetail.css";
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
import React, {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ScrollText,
  LifeBuoy,
  Layers,
  Clapperboard,
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
  LockKeyhole,
  UnlockKeyhole,
  PanelsTopLeft,
  Blinds,
  Droplets,
  Flame,
  History,
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
import "./login.css";
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
import { HouseInsights } from "./HouseInsights";
import { HistoryExplorer } from "./HistoryExplorer";
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
  history: History,
  logbook: ScrollText,
  support: LifeBuoy,
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
  useEffect(() => {
    if (!session) return;
    (
      window as Window & {
        webkit?: {
          messageHandlers?: {
            smartiSession?: { postMessage: (message: string) => void };
          };
        };
      }
    ).webkit?.messageHandlers?.smartiSession?.postMessage("authenticated");
  }, [session]);

  const attention = useDiscoveries(session?.role === "admin", true);
  const attentionCount =
    session?.role === "admin" && !attention.isError
      ? attention.data?.length || 0
      : 0;
  const discoveries = useDiscoveries(session?.role === "admin");
  const discoveryCount =
    !discoveries.isError && session?.role === "admin"
      ? discoveries.data?.length || 0
      : 0;
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
      mode === "simple" && !["home", "support", "more"].includes(p)
        ? "home"
        : p,
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
    try {
      await api("logout", "POST");
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) {
        window.alert(
          lang === "en"
            ? "Could not sign out. Please try again."
            : "Kunne ikke logge ut. Prøv igjen.",
        );
        return;
      }
    }
    (
      window as Window & {
        webkit?: {
          messageHandlers?: {
            smartiSession?: { postMessage: (message: string) => void };
          };
        };
      }
    ).webkit?.messageHandlers?.smartiSession?.postMessage("logout");
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
                    ? ["home", "support", "more"].includes(p)
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
                    {(p === "devices" && discoveryCount > 0) ||
                    (p === "integrations" && attentionCount > 0) ? (
                      <span
                        className="nav-discovery-count"
                        aria-label={
                          p === "devices"
                            ? `${discoveryCount} ${lang === "en" ? "new devices" : "nye enheter"}`
                            : `${attentionCount} ${lang === "en" ? "integrations need attention" : "integrasjoner trenger oppmerksomhet"}`
                        }
                      >
                        {p === "devices" ? discoveryCount : attentionCount}
                      </span>
                    ) : (
                      page === p && <span className="nav-dot" />
                    )}
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
  const [showPassword, setShowPassword] = useState(false);
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
      <img
        className="login-background"
        src="./home/home-living.webp"
        alt=""
        fetchPriority="high"
      />
      <section className="login-art">
        <Logo />
        <div>
          <span className="eyebrow">SMART LIVING, SIMPLIFIED.</span>
          <h1>{t.loginTitle}</h1>
          <p className="login-story-subtitle">
            {lang === "nb"
              ? "Hjemmet ditt, samlet på ett sted. Også når du er et annet sted."
              : "Your home, all in one place. Even when you’re somewhere else."}
          </p>
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
          <h2>
            {first
              ? t.firstTitle
              : lang === "nb"
                ? "Logg inn på SMARTi"
                : "Sign in to SMARTi"}
          </h2>
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
                <div className="login-password-field">
                  <input
                    name="password"
                    aria-label={t.password}
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={12}
                    maxLength={128}
                    autoComplete={first ? "new-password" : "current-password"}
                    placeholder={t.passwordHint}
                  />
                  <button
                    type="button"
                    className="login-password-toggle"
                    aria-label={
                      lang === "nb"
                        ? showPassword
                          ? "Skjul passord"
                          : "Vis passord"
                        : showPassword
                          ? "Hide password"
                          : "Show password"
                    }
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {lang === "nb"
                      ? showPassword
                        ? "Skjul"
                        : "Vis"
                      : showPassword
                        ? "Hide"
                        : "Show"}
                  </button>
                </div>
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
          <div className="login-new-customer">
            <House
              className="login-new-home-icon"
              size={36}
              aria-hidden="true"
            />
            <strong>
              {lang === "nb"
                ? "Ny kunde eller nytt hjem?"
                : "New customer or new home?"}
            </strong>
            <p>
              {lang === "nb"
                ? "Du trenger ingen bruker fra før. Finn huben din og opprett en SMARTi-konto i oppstartsveilederen."
                : "No account needed yet. Find your hub and create a SMARTi account during setup."}
            </p>
            <a href="https://home.smarti.dev/welcome" target="_top">
              {lang === "nb" ? "Sett opp nytt hjem" : "Set up a new home"}{" "}
              <ArrowUpRight size={18} />
            </a>
          </div>
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
  const offline =
    home.data?.connected === false || !streamConnected || home.isError;
  const [connectionWarning, setConnectionWarning] = useState(false);
  useEffect(() => {
    if (!offline) {
      setConnectionWarning(false);
      return;
    }
    // Brief reconnects should not flash a page-wide alert. Controls still use
    // the immediate offline state so stale data cannot enable commands.
    const timer = window.setTimeout(() => setConnectionWarning(true), 120_000);
    return () => window.clearTimeout(timer);
  }, [offline]);
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
          <span
            className={
              "connection " +
              (h.mode === "demo" ? "demo" : offline ? "warning" : "")
            }
            role="status"
            tabIndex={0}
            title={
              h.mode === "demo" ? t.demo : offline ? t.unknown : t.connected
            }
            data-label={
              h.mode === "demo" ? t.demo : offline ? t.unknown : t.connected
            }
          >
            <span aria-hidden="true" />
            <span className="sr-only">
              {h.mode === "demo" ? t.demo : offline ? t.unknown : t.connected}
            </span>
          </span>
        </div>
      </header>
      <main>
        {session.support && (
          <div className="support-session-banner" role="status">
            Godkjent fjernhjelp · Tilgang utløper{" "}
            {new Date(session.support.expires * 1000).toLocaleTimeString()}
            <span>
              {" "}
              Kamera, konsoll, brukere og systemadministrasjon er ikke
              tilgjengelig.
            </span>
          </div>
        )}
        {h.mode === "demo" && (
          <div className="demo-strip">
            <span>DEMO</span>
            {t.demoHint}
          </div>
        )}
        {offline && connectionWarning && (
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
            admin={session.role === "admin"}
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
            {page === "devices" && session.role === "admin" && (
              <DiscoveredDevices lang={lang} />
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
                  ["scenes", lang === "nb" ? "Scener" : "Scenes"],
                  ["zigbee2mqtt", "Zigbee"],
                  ["zwave_js", "Z-Wave"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    aria-pressed={protocol === id}
                    className={protocol === id ? "selected" : ""}
                    onClick={() => setProtocol(id)}
                  >
                    {id === "groups" ? (
                      <Layers size={18} />
                    ) : id === "scenes" ? (
                      <Clapperboard size={18} />
                    ) : id === "all" ? (
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
                  protocol !== "scenes" &&
                  session.role === "admin" && (
                    <RadioAdvanced
                      provider={protocol}
                      lang={lang === "en" ? "en" : "nb"}
                    />
                  )}
              </div>
            )}
            {page === "devices" && protocol === "scenes" ? (
              <Scenes
                home={h}
                lang={lang}
                admin={session.role === "admin"}
                offline={!h.connected}
                manage
              />
            ) : page === "devices" && protocol === "groups" ? (
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
                    renderControls={cards}
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
                      <PagedControls
                        key={JSON.stringify([
                          page,
                          room,
                          filter,
                          search,
                          protocol,
                        ])}
                        controls={selected}
                        render={cards}
                        lang={lang}
                      />
                    ) : (
                      <p className="empty">{t.noResults}</p>
                    )
                  ) : (
                    <Empty t={t} add={() => setAdding(true)} />
                  ))}
              </>
            )}
          </>
        ) : page === "logbook" ? (
          <HouseInsights home={h} lang={lang} />
        ) : page === "history" ? (
          <HistoryExplorer key={page} home={h} lang={lang} activity={false} />
        ) : page === "support" ? (
          <section className="support-home">
            <LifeBuoy size={34} aria-hidden="true" />
            <h1>{lang === "en" ? "Support" : "Support"}</h1>
            <p>
              {lang === "en"
                ? "Create a case, follow progress and approve remote assistance when needed."
                : "Opprett en sak, følg fremdriften og godkjenn fjernhjelp når det trengs."}
            </p>
            <a
              className="primary-button"
              href="https://home.smarti.dev/support"
              target="_top"
            >
              {lang === "en"
                ? "Open my support cases"
                : "Åpne mine supportsaker"}{" "}
              <ArrowUpRight size={18} />
            </a>
            <a href="https://home.smarti.dev/support/prices" target="_top">
              {lang === "en" ? "View prices" : "Se prislisten"}
            </a>
            <p className="muted">
              {lang === "en"
                ? "Sign in with the SMARTi account connected to your home."
                : "Logg inn med SMARTi-kontoen som hjemmet er koblet til."}
            </p>
          </section>
        ) : page === "automations" && session.role === "admin" ? (
          <Automations lang={lang} home={h} onDirty={onDirty} />
        ) : page === "integrations" && session.role === "admin" ? (
          <Integrations lang={lang} />
        ) : page === "apps" && session.role === "admin" ? (
          <Apps lang={lang} />
        ) : page === "updates" && session.role === "admin" ? (
          <Updates lang={lang} />
        ) : (
          <section className="settings-overview">
            <div className="page-heading settings-hero">
              <span className="eyebrow">SMARTi</span>
              <h1>{t.settings}</h1>
              <p>
                {lang === "en"
                  ? "Make your home yours, and choose how SMARTi works for you."
                  : "Tilpass hjemmet ditt, og hvordan SMARTi fungerer."}
              </p>
            </div>
            <PhoneSettings lang={lang} />
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
                      [
                        "updates",
                        lang === "en"
                          ? "SMARTi updates"
                          : "SMARTi-oppdateringer",
                      ],
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
                  {key === "household" ? (
                    <House size={19} />
                  ) : key === "backups" ? (
                    <Database size={19} />
                  ) : key === "network" ? (
                    <Network size={19} />
                  ) : key === "system" ? (
                    <Server size={19} />
                  ) : key === "debugging" ? (
                    <Code size={19} />
                  ) : key === "updates" ? (
                    <DownloadCloud size={19} />
                  ) : (
                    <Palette size={19} />
                  )}
                  {label}
                </button>
              ))}
            </nav>
            {mode !== "simple" &&
            session.role === "admin" &&
            settingsSection === "updates" ? (
              <Updates lang={lang} embedded />
            ) : mode === "advanced" &&
              session.role === "admin" &&
              settingsSection === "debugging" ? (
              <Debugging lang={lang} />
            ) : mode !== "simple" &&
              session.role === "admin" &&
              settingsSection !== "appearance" &&
              settingsSection !== "debugging" ? (
              <HomeSettings
                advanced={mode === "advanced"}
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
                  </section>
                </div>
              </>
            )}
            <div className="settings-signout">
              <button onClick={logout}>
                <LogOut size={18} />
                {t.logout}
              </button>
            </div>
          </section>
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
  const inDialog = useContext(InSettingsDialog);
  const [history, showHistory] = useState(false);
  const [expanded, expand] = useState(false);
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
    c.domain === "lock"
      ? c.state === "locked"
        ? LockKeyhole
        : UnlockKeyhole
      : c.domain === "cover"
        ? Blinds
        : c.attributes.device_class === "window"
          ? PanelsTopLeft
          : ["humidity", "moisture"].includes(String(c.attributes.device_class))
            ? Droplets
            : c.attributes.device_class === "smoke"
              ? Flame
              : c.domain === "light"
                ? Lightbulb
                : c.domain === "switch"
                  ? Plug
                  : c.domain === "climate" ||
                      c.attributes.device_class === "temperature"
                    ? Thermometer
                    : c.domain === "binary_sensor"
                      ? DoorOpen
                      : c.domain === "automation"
                        ? Zap
                        : Activity;
  async function command(action: string, value?: number | number[] | string) {
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
    if (
      confirmed &&
      !(action === "activate" && c.domain === "scene") &&
      !window.confirm(`${c.name}: ${actionNames[action]}?`)
    )
      return;
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      const result = await api<{ status: string }>(
        `controls/${encodeURIComponent(c.entity_id)}/commands`,
        "POST",
        {
          action,
          confirmed,
          ...(action === "set_hvac_mode"
            ? { hvac_mode: value }
            : value === undefined
              ? {}
              : { value }),
        },
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
  const state = controlState(
    c,
    c.availability === "available" ? c.state : c.availability,
    document.documentElement.lang,
  );
  return (
    <article
      className={
        "device " +
        (inDialog ? "control-detail " : "") +
        (c.state === "on" ? "is-on " : "") +
        (c.availability !== "available" ? "is-unavailable" : "")
      }
      data-domain={c.domain}
      data-state={c.state}
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
        <h3>
          {inDialog ? (
            c.name
          ) : (
            <button
              className="device-open-detail"
              onClick={() => expand(true)}
              aria-label={`${t === en ? "Open" : "Åpne"} ${c.name}`}
            >
              {c.name}
              <ChevronRight size={16} />
            </button>
          )}
        </h3>
      </div>
      {inDialog && (
        <div className="control-detail-meta">
          <span>
            {offline
              ? t === en
                ? "Connection lost"
                : "Mistet forbindelsen"
              : c.availability === "available"
                ? t === en
                  ? "Connected"
                  : "Tilkoblet"
                : t === en
                  ? "Unavailable"
                  : "Utilgjengelig"}
          </span>
          {battery && (
            <span>
              {t.battery}:{" "}
              {controlState(
                battery,
                battery.state,
                document.documentElement.lang,
              )}
              {battery.availability === "available" ? "%" : ""}
            </span>
          )}
        </div>
      )}
      {inDialog && c.updated_at && (
        <small className="control-updated">
          {t.lastUpdate}:{" "}
          {new Date(c.updated_at).toLocaleString(
            document.documentElement.lang === "en" ? "en-GB" : "nb-NO",
          )}
        </small>
      )}
      <div className="device-value">
        {c.domain === "climate" ? (
          <Thermostat
            c={{ ...c, availability: offline ? "unavailable" : c.availability }}
            lang={document.documentElement.lang}
            disabled={!can || busy}
            change={(value) => void command("set_temperature", value)}
            changeMode={(mode) => void command("set_hvac_mode", mode)}
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

      {inDialog && (
        <>
          <button
            className="control-history-toggle"
            aria-expanded={history}
            onClick={() => showHistory(!history)}
          >
            <History size={18} />
            {t === en ? "History" : "Historikk"}
            <ChevronRight size={16} />
          </button>
          {history && (
            <ControlHistory
              control={c}
              home={h}
              lang={document.documentElement.lang}
            />
          )}
        </>
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
      {expanded && !inDialog && (
        <SettingsDialog
          title={c.name}
          lang={document.documentElement.lang}
          onClose={() => expand(false)}
        >
          <div className="controls-grid">
            <Device
              c={c}
              t={t}
              h={h}
              offline={offline}
              roomName={roomName}
              admin={admin}
            />
          </div>
        </SettingsDialog>
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

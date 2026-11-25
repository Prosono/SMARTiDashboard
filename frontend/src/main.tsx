import { LightDetail } from "./LightDetail";
import { DeviceDetailOverview } from "./DeviceDetailOverview";
import { MetricDeviceRenderer } from "./home/MetricDetails";
import { MediaCard } from "./home/Multimedia";
import { useAvailabilityGrace } from "./useAvailabilityGrace";
import { HideControl } from "./ControlVisibility";
import { LightAppearance } from "./LightAppearance";
import {
  Settings2,
  Power,
  Lock,
  LockOpen,
  ArrowUp,
  ArrowDown,
  Square,
  Play,
  Info,
} from "lucide-react";
import { Screensaver, useScreensaver } from "./home/Screensaver";
import { SensorValue } from "./SensorValue";
import { useDiscoveries } from "./manage/DiscoveredDevices";
import { SettingsDialog, InSettingsDialog } from "./home/SettingsDialog";
import { ControlHistory } from "./ControlHistory";
import "./controlDetail.css";
import { VacuumCard } from "./home/Cleaning";
import {
  Experience,
  useExperience,
  useExperiencePreference,
} from "./Experience";
import { SimpleHome } from "./home/SimpleHome";
import { MobileHomeSwitcher } from "./home/MobileHomeSwitcher";
import { HarmonyDevices } from "./home/HarmonyDevices";
import { CardDeviceMetadata } from "./home/CardDeviceMetadata";
import { deviceBattery } from "./home/deviceMetadata";
import { DeviceArtwork } from "./home/DeviceArtwork";
import { liveConnection, scheduleRemoteHomeRefresh } from "./liveConnection";
import { StartupScreen } from "./StartupScreen";
import {
  accountLaunchLanguage,
  HomeLaunchError,
  prepareStartupSession,
} from "./startupSession";
import { remoteHome } from "./remoteConsole";
import { RoomsOverview } from "./rooms/RoomsOverview";
import { LightColor } from "./LightColor";
import { controlState } from "./controlState";
import { Connections } from "./manage/Connections";
import { AccountAvatar } from "./manage/Accounts";
import { SettingsPage, type SettingsSection } from "./manage/SettingsPage";
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
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  ScrollText,
  LifeBuoy,
  House,
  Menu,
  LayoutGrid,
  SlidersHorizontal,
  Waypoints,
  Blocks,
  DownloadCloud,
  ArrowUpRight,
  ArrowLeft,
  Star,
  Lightbulb,
  Plug,
  Thermometer,
  History,
  WifiOff,
  ChevronRight,
  Settings,
  LogOut,
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
import { Updates } from "./manage/Updates";
import { palettes } from "./PalettePicker";
import { RoomView } from "./rooms/RoomView";
import "./palettes.css";
import "./home/harmony.css";
import { HomeOverview, homeAsset } from "./home/HomeOverview";
import "./home/harmonyHeaders.css";
import "./home/equipmentCards.css";
import "./home/equipmentWidgets.css";
import "./home/elegantCharts.css";
import "./home/cardTones.css";
import "./home/metricStates.css";
import "./home/headerPills.css";
import "./home/referenceCards.css";
import "./home/thermostatCard.css";
import "./home/mobileCards.css";
import "./home/glassCards.css";
import "./home/energyPalette.css";
import "./home/phoneDashboard.css";
import "./home/bannerlessHome.css";
import "./rooms/roomEquipment.css";
import "./rooms/harmoniRooms.css";
import { integrationName } from "./branding";
import { api, ApiError, setSession } from "./api";
import { nb, en, type Text } from "./i18n";
import type { Control, Home, Session } from "./types";
import { HouseInsights } from "./HouseInsights";
import { useUpdateCounts } from "./manage/useUpdateCount";
import type { UpdateCounts } from "./manage/updateModel";
import { DeviceSetup } from "./DeviceSetup";
import { DevicesPage } from "./DevicesPage";
import { readPreference, writePreference } from "./preferences";
import { Atmosphere, AtmosphereProvider } from "./Atmosphere";
const client = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } },
});
const launchLanguage = accountLaunchLanguage();
const startupSession = prepareStartupSession();
const icons = {
  home: House,
  rooms: LayoutGrid,
  devices: SlidersHorizontal,
  automations: Waypoints,
  integrations: Blocks,
  updates: DownloadCloud,
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
    launchLanguage ?? readPreference("smarti-language", "nb", ["nb", "en"]),
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
  const lang = (session && userLanguage.data?.language) || guestLang;
  const t = lang === "en" ? en : nb;
  const experience = useExperiencePreference(!!session);
  // Fetch alongside preferences and keep the same startup screen until both settle.
  const home = useQuery({
    queryKey: ["home"],
    queryFn: () => api<Home>("home"),
    enabled: !!session,
    refetchInterval: 30000,
  });
  const mode = experience.data?.mode || "advanced";
  const updates = useUpdateCounts(
    session?.role === "admin",
    experience.data?.mode === "advanced",
  );
  const availableUpdates = updates.smarti + updates.extensions + updates.apps;
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
  const [sessionUnavailable, setSessionUnavailable] = useState(false);
  const [launchFailed, setLaunchFailed] = useState(false);
  const retrySession = useRef<() => void>(() => {});
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
      mode === "simple" && !["home", "updates", "support", "more"].includes(p)
        ? "home"
        : p,
    );
  }, [mode]);
  const starting =
    checking ||
    (!!session &&
      ((experience.isLoading && !experience.isFetched) ||
        (home.isLoading && !home.isFetched)));
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
  }, [page, mode, lang, session?.role, starting]);
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
    let active = true,
      pending = false,
      resolved = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      if (!active || pending || resolved) return;
      clearTimeout(timer);
      pending = true;
      setChecking(true);
      try {
        const value = await startupSession();
        if (!active) return;
        setSession(value);
        updateSession(value);
        setSessionUnavailable(false);
        resolved = true;
      } catch (error) {
        if (!active) return;
        if (error instanceof HomeLaunchError) {
          setLaunchFailed(true);
          resolved = true;
        } else if (error instanceof ApiError && error.status === 401) {
          setSessionUnavailable(false);
          resolved = true;
        } else {
          setSessionUnavailable(true);
          timer = setTimeout(() => void check(), 5000);
        }
      } finally {
        pending = false;
        if (active) setChecking(false);
      }
    };
    retrySession.current = () => void check();
    const resume = () => void check();
    window.addEventListener("online", resume);
    window.addEventListener("focus", resume);
    void check();
    return () => {
      active = false;
      clearTimeout(timer);
      window.removeEventListener("online", resume);
      window.removeEventListener("focus", resume);
    };
  }, []);
  useEffect(() => {
    if (!session) return;
    let active = true;
    const refresh = () => {
      void api<Session>("session", "POST")
        .then((v) => {
          if (!active) return;
          setSession(v);
          updateSession(v);
        })
        .catch((error) => {
          if (active && error instanceof ApiError && error.status === 401) {
            setSession(null);
            updateSession(null);
            client.clear();
          }
        });
    };
    refresh();
    const timer = setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("smarti-check-session", refresh);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("smarti-check-session", refresh);
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
  if (starting) return <StartupScreen message={t.loading} />;
  if (launchFailed)
    return (
      <StartupScreen
        busy={false}
        message={
          lang === "en"
            ? "Could not verify access. Open your home again from My homes in SMARTi."
            : "Kunne ikke bekrefte tilgangen. Åpne hjemmet på nytt fra Mine hjem i SMARTi."
        }
      >
        <a href="https://home.smarti.dev/" className="button" target="_top">
          {lang === "en" ? "Back to My homes" : "Tilbake til Mine hjem"}
        </a>
      </StartupScreen>
    );
  if (!session && sessionUnavailable)
    return (
      <StartupScreen
        busy={false}
        message={
          lang === "en"
            ? "Could not connect to your home. Retrying…"
            : "Kunne ikke koble til hjemmet. Prøver igjen…"
        }
      >
        <button onClick={() => retrySession.current()}>{t.retry}</button>
      </StartupScreen>
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
                  !["automations", "integrations", "updates"].includes(p),
              )
              .filter(
                (p) =>
                  mode !== "simple" ||
                  ["home", "updates", "support", "more"].includes(p),
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
                    (p === "integrations" && attentionCount > 0) ||
                    (p === "updates" && availableUpdates > 0) ? (
                      <span
                        className="nav-discovery-count"
                        aria-label={
                          p === "devices"
                            ? `${discoveryCount} ${lang === "en" ? "new devices" : "nye enheter"}`
                            : p === "updates"
                              ? `${availableUpdates} ${lang === "en" ? "updates available" : "oppdateringer tilgjengelig"}`
                              : `${attentionCount} ${lang === "en" ? "integrations need attention" : "integrasjoner trenger oppmerksomhet"}`
                        }
                      >
                        {p === "devices"
                          ? discoveryCount
                          : p === "updates"
                            ? availableUpdates
                            : attentionCount}
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
            home={home}
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
            updates={updates}
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
  const portalSignIn = !first && remoteHome();
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
      <Atmosphere embedded />
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
              : portalSignIn
                ? t.remoteLoginTitle
                : lang === "nb"
                  ? "Logg inn på SMARTi"
                  : "Sign in to SMARTi"}
          </h2>
          <p>
            {first
              ? t.firstHint
              : portalSignIn
                ? t.remoteLoginHint
                : t.loginHint}
          </p>
          {portalSignIn && (
            <a
              href="https://home.smarti.dev/"
              className="login-portal-link"
              target="_top"
            >
              {t.remoteLoginLink}
              <ArrowUpRight size={18} aria-hidden="true" />
            </a>
          )}
          {setup.isError ? (
            <p role="alert">{t.loadError}</p>
          ) : (
            <form onSubmit={submit}>
              {portalSignIn && (
                <p className="login-local-hint">{t.localLoginHint}</p>
              )}
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
  home,
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
  updates,
}: {
  home: UseQueryResult<Home, Error>;
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
  updates: UpdateCounts;
}) {
  const mode = useExperience();
  const queryClient = useQueryClient();
  const [streamConnected, streamStatus] = useState(true);
  const [room, setRoom] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [pairedDevice, setPairedDevice] = useState<{
    id?: string;
    name?: string;
    provider: string;
  } | null>(null);
  const [roomEditing, setRoomEditing] = useState(false);
  const [selectedSettings, setSettingsSection] =
    useState<SettingsSection>("household");
  const canManageSettings = session.role === "admin" && mode !== "simple";
  const settingsSection =
    !canManageSettings && selectedSettings !== "screensaver"
      ? "appearance"
      : selectedSettings === "debugging" && mode !== "advanced"
        ? "household"
        : selectedSettings;
  const screensaver = useScreensaver(
    !!home.data,
    session.support ? "" : session.name,
    session.role === "admin" && !session.support,
    page === "more" && settingsSection === "screensaver",
  );
  const [protocol, setProtocol] = useState("all");
  function openDeviceWorkspace() {
    setRoom(null);
    setProtocol("all");
    setPage("devices");
  }
  useEffect(() => {
    let homeRevision: number | undefined;
    let radioRevision: number | undefined;
    const refreshDevices = () => {
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
    };
    const refreshHome = () =>
      queryClient.invalidateQueries(
        { queryKey: ["home"] },
        { cancelRefetch: false },
      );
    const scheduled = remoteHome()
      ? scheduleRemoteHomeRefresh(() => {
          refreshDevices();
          return refreshHome();
        })
      : undefined;
    const requestHomeRefresh = scheduled?.request ?? refreshHome;
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
        if (
          homeChanged &&
          (!scheduled ||
            data.revision !== queryClient.getQueryData<Home>(["home"])?.revision)
        )
          void requestHomeRefresh();
        if (radioChanged || (homeChanged && !scheduled)) refreshDevices();
        if (radioChanged)
          void queryClient.invalidateQueries(
            { queryKey: ["zigbee-connection"] },
            { cancelRefetch: false },
          );
      } catch {
        /* Ignore incomplete event frames; polling remains a fallback. */
      }
    };
    const disconnect = liveConnection(
      streamStatus,
      onMessage,
      () => {
        void requestHomeRefresh();
      },
      () => window.dispatchEvent(new Event("smarti-check-session")),
    );
    return () => {
      disconnect();
      scheduled?.stop();
    };
  }, [queryClient]);
  useEffect(() => {
    setAdding(false);
    setRoomEditing(false);
  }, [page]);
  const disconnected =
    home.data?.connected === false || !streamConnected || home.isError;
  const display = useAvailabilityGrace(home.data, disconnected);
  const offline = display.offline;
  const [connectionWarning, setConnectionWarning] = useState(false);
  useEffect(() => {
    if (!offline) {
      setConnectionWarning(false);
      return;
    }
    // Keep the page-wide alert quiet during reconnects.
    const timer = window.setTimeout(() => setConnectionWarning(true), 120_000);
    return () => window.clearTimeout(timer);
  }, [offline]);
  if (!home.data)
    return (
      <div className="empty">
        <AlertCircle />
        <h2>{t.loadError}</h2>
        <button disabled={home.isFetching} onClick={() => home.refetch()}>
          {t.retry}
        </button>
      </div>
    );
  const h = display.home!;
  const regular = h.controls.filter(
    (c) => !c.diagnostic && c.domain !== "automation",
  );
  const roomName = (id: string | null) =>
    h.areas.find((a) => a.area_id === id)?.name || t.unassigned;
  function cards(controls: Control[]) {
    return (
      <HarmonyDevices
        controls={controls}
        home={h}
        lang={lang}
        offline={offline}
        roomSurface={page === "rooms"}
      />
    );
  }
  const rooms = [
    ...h.areas,
    ...(regular.some((c) => !c.area_id)
      ? [{ area_id: "", name: t.unassigned }]
      : []),
  ];
  return (
    <MetricDeviceRenderer.Provider
      value={(c) =>
        c.domain === "vacuum" ? (
          <>
            <VacuumCard c={c} home={h} lang={lang} offline={offline} />
            {session.role === "admin" && (
              <details className="device-options">
                <summary className="control-history-toggle">
                  <Settings2 size={18} aria-hidden="true" />
                  {lang === "en" ? "Device settings" : "Enhetsinnstillinger"}
                  <ChevronRight size={16} aria-hidden="true" />
                </summary>
                <HideControl c={c} lang={lang} disabled={offline} />
              </details>
            )}
          </>
        ) : (
          <Device
            key={c.id}
            c={c}
            t={t}
            h={h}
            offline={offline}
            roomName={roomName(c.area_id)}
            admin={session.role === "admin"}
            initialHistory={
              c.domain === "sensor" || c.domain === "binary_sensor"
            }
          />
        )
      }
    >
      <header className="topbar">
        <div className="breadcrumb">
          <div className="mobile-breadcrumb-home">
            <MobileHomeSwitcher home={h} lang={lang} />
          </div>
          <House size={17} />
          <span className="breadcrumb-home-name">{h.home_name}</span>
          <span className="separator">/</span>
          <span className="breadcrumb-page">{t[page]}</span>
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
              setRoom(null);
            }}
          />
        ) : page === "home" ? (
          <HomeOverview
            home={h}
            offline={offline}
            lang={lang}
            admin={session.role === "admin"}
            renderControls={cards}
            openRooms={(id) => {
              setRoom(id ?? null);
              setPage("rooms");
            }}
            openDevices={openDeviceWorkspace}
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
            selectRoom={setRoom}
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
        ) : page === "devices" ? (
          <DevicesPage
            home={h}
            lang={lang}
            admin={session.role === "admin"}
            offline={offline}
            protocol={protocol}
            selectProtocol={setProtocol}
            pairedDevice={pairedDevice}
            add={() => setAdding(true)}
          />
        ) : page === "logbook" ? (
          <HouseInsights home={h} lang={lang} />
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
          <Connections lang={lang} />
        ) : page === "updates" && session.role === "admin" ? (
          <Updates lang={lang} counts={updates} />
        ) : (
          <SettingsPage
            section={settingsSection}
            selectSection={(section) =>
              guard(() => setSettingsSection(section))
            }
            canManage={canManageSettings}
            advanced={mode === "advanced"}
            viewer={session.role !== "admin"}
            screensaver={screensaver}
            home={h}
            theme={theme}
            setTheme={setTheme}
            palette={palette}
            setPalette={setPalette}
            logout={logout}
            lang={lang}
            t={t}
          />
        )}
      </main>
      <footer>
        SMARTi <span>SMART LIVING, SIMPLIFIED.</span>
        <span>{h.mode === "demo" ? t.demo : t.live}</span>
      </footer>
      {screensaver.active && (
        <Screensaver
          state={screensaver}
          home={h}
          offline={offline}
          lang={lang}
        />
      )}
    </MetricDeviceRenderer.Provider>
  );
}
const deviceActions = {
  activate: [Play, "Aktiver", "Activate"],
  lock: [Lock, "Lås", "Lock"],
  unlock: [LockOpen, "Lås opp", "Unlock"],
  open_cover: [ArrowUp, "Åpne", "Open"],
  close_cover: [ArrowDown, "Lukk", "Close"],
  stop_cover: [Square, "Stopp", "Stop"],
} as const;
type DeviceAction = keyof typeof deviceActions;

function Device({
  c,
  t,
  h,
  offline,
  roomName,
  admin,
  initialHistory = false,
}: {
  c: Control;
  t: Text;
  h: Home;
  offline: boolean;
  roomName: string;
  admin: boolean;
  initialHistory?: boolean;
}) {
  const mode = useExperience();
  const inDialog = useContext(InSettingsDialog);
  const [history, showHistory] = useState(initialHistory);
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
  const lang = t === en ? "en" : "nb";
  const battery = offline ? null : deviceBattery(c, h);
  const device = h.devices.find((v) => v.id === c.device_id);
  const power = c.capabilities.some((v) => v.kind === "power");
  const dim = c.capabilities.find((v) => v.kind === "brightness");
  const actions = [
    ...new Set(c.capabilities.flatMap((capability) => capability.actions)),
  ].filter((action): action is DeviceAction =>
    Object.hasOwn(deviceActions, action),
  );
  const actionLabel = (action: DeviceAction) =>
    deviceActions[action][t === en ? 2 : 1];
  const [confirmAction, setConfirmAction] = useState<DeviceAction | null>(null);
  async function command(
    action: string,
    value?: number | number[] | string,
    approved = false,
  ) {
    if (!can || busy) return;
    const confirmed =
      Object.hasOwn(deviceActions, action) && action !== "stop_cover";
    if (
      confirmed &&
      !approved &&
      !(action === "activate" && c.domain === "scene")
    ) {
      const requested = action as DeviceAction;
      if (inDialog) {
        setConfirmAction(requested);
        return;
      }
      if (!window.confirm(`${c.name}: ${actionLabel(requested)}?`)) return;
    }
    setConfirmAction(null);
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
      if (result.status === "failed") throw new Error("command_failed");
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
  if (inDialog && c.domain === "media_player")
    return (
      <div className="device-media-detail">
        <MediaCard
          c={c}
          home={h}
          lang={t === en ? "en" : "nb"}
          offline={offline}
          photo={homeAsset("home-multimedia")}
        />
        {admin && (
          <details className="device-options">
            <summary className="control-history-toggle">
              <Settings2 size={18} aria-hidden="true" />
              {t === en ? "Device settings" : "Enhetsinnstillinger"}
              <ChevronRight size={16} aria-hidden="true" />
            </summary>
            <LightAppearance
              c={c}
              lang={t === en ? "en" : "nb"}
              disabled={offline}
            />
            <HideControl
              c={c}
              lang={t === en ? "en" : "nb"}
              disabled={offline}
            />
          </details>
        )}
      </div>
    );
  if (inDialog && c.domain === "light")
    return (
      <LightDetail
        c={c}
        home={h}
        lang={t === en ? "en" : "nb"}
        room={roomName}
        offline={offline}
        admin={admin}
        busy={busy}
        message={message}
        failed={failed}
        command={command}
        favorite={favorite}
      />
    );
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
      data-entity={c.entity_id}
    >
      {inDialog ? (
        <DeviceDetailOverview
          control={c}
          home={h}
          room={roomName}
          offline={offline}
          lang={lang}
          favorite={h.favorites.includes(c.entity_id)}
          onFavorite={favorite}
        />
      ) : (
        <>
          <div className="device-top">
            <span className="device-icon">
              <DeviceArtwork c={c} available={can} />
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
              <button
                className="device-open-detail"
                onClick={() => expand(true)}
                aria-label={`${t === en ? "Open" : "Åpne"} ${c.name}`}
              >
                {c.name}
                <ChevronRight size={16} />
              </button>
            </h3>
          </div>
          <CardDeviceMetadata control={c} home={h} lang={lang} available={can} />
        </>
      )}
      <div className="device-value">
        {c.domain === "climate" ? (
          <Thermostat
            c={{ ...c, availability: offline ? "unavailable" : c.availability }}
            lang={document.documentElement.lang}
            inDialog={inDialog}
            disabled={!can || busy}
            change={(value) => void command("set_temperature", value)}
            changeMode={(mode) => void command("set_hvac_mode", mode)}
          />
        ) : c.domain === "sensor" && c.availability === "available" ? (
          <SensorValue c={c} lang={document.documentElement.lang} />
        ) : (
          <span className="state">
            <span className={c.state === "on" ? "state-dot on" : "state-dot"} />
            {state}
          </span>
        )}
        {power && (
          <button
            className={
              inDialog
                ? "device-detail-power"
                : mode === "simple"
                  ? "simple-power"
                  : "toggle"
            }
            role="switch"
            aria-checked={c.state === "on"}
            aria-label={`${c.name}: ${c.state === "on" ? t.off : t.on}`}
            disabled={!can || busy}
            onClick={() => command(c.state === "on" ? "turn_off" : "turn_on")}
          >
            {inDialog && <Power size={19} aria-hidden="true" />}
            {inDialog || mode === "simple" ? (
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
      {actions.length > 0 && (
        <div className="home-device-actions">
          {actions.map((action) => {
            const [ActionIcon] = deviceActions[action];
            return (
              <button
                key={action}
                disabled={!can || busy}
                onClick={() => void command(action)}
              >
                {inDialog && <ActionIcon size={18} aria-hidden="true" />}
                {actionLabel(action)}
              </button>
            );
          })}
        </div>
      )}
      {confirmAction && (
        <div className="device-action-confirm">
          <p role="status">
            {actionLabel(confirmAction)} · {c.name}?
          </p>
          <div>
            <button onClick={() => setConfirmAction(null)}>
              {t === en ? "Cancel" : "Avbryt"}
            </button>
            <button
              className="primary"
              disabled={!can || busy}
              onClick={() => void command(confirmAction, undefined, true)}
            >
              {t === en ? "Confirm" : "Bekreft"}
            </button>
          </div>
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

      {(busy || message) && (
        <p
          className={"command-message " + (failed ? "form-error" : "")}
          role="status"
        >
          {busy ? t.pending : message}
        </p>
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
      {inDialog && admin && (
        <details className="device-options">
          <summary className="control-history-toggle">
            <Settings2 size={18} aria-hidden="true" />
            {t === en ? "Device settings" : "Enhetsinnstillinger"}
            <ChevronRight size={16} aria-hidden="true" />
          </summary>
          <HideControl c={c} lang={t === en ? "en" : "nb"} disabled={offline} />
        </details>
      )}
      {mode !== "simple" && (
        <button
          className="device-details"
          aria-expanded={details}
          onClick={() => showDetails(!details)}
        >
          {inDialog && <Info size={18} aria-hidden="true" />}
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
          {c.domain === "sensor" && (
            <>
              <dt>{t === en ? "Raw value" : "Råverdi"}</dt>
              <dd>
                {c.state} {String(c.attributes.unit_of_measurement || "")}
              </dd>
            </>
          )}
          {battery !== null && (
            <>
              <dt>{t.battery}</dt>
              <dd>
                {battery.toLocaleString(lang, { maximumFractionDigits: 1 })} %
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
      {expanded && !inDialog && (
        <SettingsDialog
          title={c.name}
          presentation="device"
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
      <AtmosphereProvider>
        <Atmosphere />
        <App />
      </AtmosphereProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);

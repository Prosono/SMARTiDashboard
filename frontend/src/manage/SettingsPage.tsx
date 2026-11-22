import {
  Activity,
  Check,
  Code,
  Database,
  House,
  LogOut,
  Monitor,
  Network,
  Palette,
  Server,
} from "lucide-react";
import { BackgroundMotionSetting } from "../Atmosphere";
import { ExperiencePicker, UserLanguagePicker } from "../Experience";
import { PalettePicker } from "../PalettePicker";
import { PhoneSettings } from "../PhoneSettings";
import { HomeBackgroundSettings } from "../home/HomeAppearance";
import { ScreensaverSettings, type useScreensaver } from "../home/Screensaver";
import type { Text } from "../i18n";
import type { Home } from "../types";
import { Debugging } from "./Debugging";
import { HomeSettings } from "./HomeSettings";
import "./settingsOverview.css";

const categories = [
  {
    id: "household",
    nb: "Hjem og personer",
    en: "Home and people",
    icon: House,
    access: "manage",
  },
  {
    id: "backups",
    nb: "Sikkerhetskopiering",
    en: "Backups",
    icon: Database,
    access: "manage",
  },
  {
    id: "network",
    nb: "Nettverk",
    en: "Network",
    icon: Network,
    access: "manage",
  },
  { id: "system", nb: "System", en: "System", icon: Server, access: "manage" },
  {
    id: "debugging",
    nb: "Debugging",
    en: "Debugging",
    icon: Code,
    access: "advanced",
  },
  {
    id: "appearance",
    nb: "Tema og utseende",
    en: "Theme and appearance",
    icon: Palette,
    access: "all",
  },
  {
    id: "screensaver",
    nb: "Skjermsparer",
    en: "Screensaver",
    icon: Monitor,
    access: "all",
  },
] as const;

export type SettingsSection = (typeof categories)[number]["id"];

export function SettingsPage({
  section,
  selectSection,
  canManage,
  advanced,
  viewer,
  screensaver,
  home,
  theme,
  setTheme,
  palette,
  setPalette,
  logout,
  lang,
  t,
}: {
  section: SettingsSection;
  selectSection: (section: SettingsSection) => void;
  canManage: boolean;
  advanced: boolean;
  viewer: boolean;
  screensaver: ReturnType<typeof useScreensaver>;
  home: Home;
  theme: string;
  setTheme: (value: string) => void;
  palette: string;
  setPalette: (value: string) => void;
  logout: () => void;
  lang: string;
  t: Text;
}) {
  const language = lang === "en" ? "en" : "nb";
  const items = categories.filter(
    ({ access }) =>
      access === "all" || (canManage && (access === "manage" || advanced)),
  );
  return (
    <section className="settings-overview" aria-labelledby="settings-title">
      <header className="settings-title">
        <h1 id="settings-title">{t.settings}</h1>
        <PhoneSettings lang={lang} />
      </header>
      <nav
        className="settings-sections"
        aria-label={
          language === "en" ? "Settings sections" : "Innstillingskategorier"
        }
      >
        {items.map(({ id, icon: Icon, ...labels }) => (
          <button
            key={id}
            type="button"
            className={section === id ? "selected" : ""}
            aria-current={section === id ? "page" : undefined}
            onClick={() => selectSection(id)}
          >
            <Icon size={18} aria-hidden="true" />
            <span>{labels[language]}</span>
          </button>
        ))}
      </nav>
      {section === "screensaver" ? (
        <ScreensaverSettings state={screensaver} lang={lang} />
      ) : section === "debugging" ? (
        <Debugging lang={lang} />
      ) : section === "appearance" ? (
        <div className="settings-appearance">
          <ExperiencePicker lang={lang} />
          <section className="settings-panel settings-theme">
            <h2>
              {language === "en" ? "Theme and appearance" : "Tema og utseende"}
            </h2>
            <div className="settings-fields">
              <label>
                {t.appearance}
                <select
                  value={theme}
                  onChange={(event) => setTheme(event.target.value)}
                >
                  <option value="light">{t.light}</option>
                  <option value="dark">{t.dark}</option>
                </select>
              </label>
              <UserLanguagePicker lang={lang} />
            </div>
            <PalettePicker value={palette} change={setPalette} lang={lang} />
          </section>
          <section className="settings-panel settings-background">
            <HomeBackgroundSettings lang={lang} />
            <div className="settings-motion">
              <BackgroundMotionSetting lang={lang} />
            </div>
          </section>
          {viewer && (
            <section className="settings-panel settings-viewer-status">
              <h2>
                <Activity size={20} aria-hidden="true" /> {t.status}
              </h2>
              <dl>
                <div>
                  <dt>{t.process}</dt>
                  <dd>
                    <Check size={16} aria-hidden="true" /> {t.running}
                  </dd>
                </div>
                <div>
                  <dt>{t.ha}</dt>
                  <dd>{home.connected ? t.connected : t.unknown}</dd>
                </div>
                <div>
                  <dt>{t.version}</dt>
                  <dd>{home.ha_version || "—"}</dd>
                </div>
              </dl>
              <p className="note">{t.radioHint}</p>
            </section>
          )}
        </div>
      ) : (
        <HomeSettings
          key={section}
          section={section}
          advanced={advanced}
          lang={lang}
          home={home}
        />
      )}
      <div className="settings-signout">
        <button type="button" onClick={logout}>
          <LogOut size={18} aria-hidden="true" />
          {t.logout}
        </button>
      </div>
    </section>
  );
}

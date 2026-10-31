import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChartNoAxesCombined,
  ChevronRight,
  LayoutDashboard,
  Lightbulb,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
  Thermometer,
  Droplets,
  Zap,
  Battery,
  Activity,
  CalendarDays,
  Users,
  CloudSun,
  Network,
  TriangleAlert,
  Sofa,
} from "lucide-react";
import type { Control, Home } from "../types";
import type { HomeGridCard } from "./HomeGrid";
import type { CardConfig, GridItem } from "./homeGridModel";
import {
  compatibleSources,
  controlUnit,
  defaultCardConfig,
  isGraphSource,
  unitInfo,
} from "./cardConfigModel";
import { cardIcons, cardImages, cardImageURL } from "./CardPresentation";
import { ConfiguredHomeCard } from "./ConfiguredHomeCard";
import { EquipmentArtwork } from "./EquipmentArtwork";
import { InSettingsDialog, SettingsDialog } from "./SettingsDialog";
import { controlState } from "../controlState";
import { numeric, reading, usable } from "./homeModel";
import "./cardBuilder.css";

export type CardSelection = { base?: HomeGridCard; config: CardConfig };
type Stage = "start" | "devices" | "widgets" | "configure";
function CardSourceGlyph({ c }: { c: Control }) {
  const family = unitInfo(controlUnit(c)).family;
  const Icon =
    family === "temperature"
      ? Thermometer
      : ["power", "energy"].includes(family)
        ? Zap
        : c.attributes.device_class === "humidity"
          ? Droplets
          : c.attributes.device_class === "battery"
            ? Battery
            : Activity;
  return (
    <>
      <Icon size={43} strokeWidth={1.3} />
      <span className="card-source-unit">{controlUnit(c)}</span>
    </>
  );
}
function widgetIcon(id: string) {
  if (id.startsWith("room:")) return Sofa;
  if (id.includes("weather")) return CloudSun;
  if (id.includes("calendar")) return CalendarDays;
  if (id.includes("people")) return Users;
  if (id.includes("batteries")) return Battery;
  if (id.includes("alerts")) return TriangleAlert;
  if (id.includes("connection")) return Network;
  if (id.includes("temperature")) return Thermometer;
  if (id.includes("humidity")) return Droplets;
  if (id.includes("energy")) return Zap;
  if (id.includes("lighting")) return Lightbulb;
  return Sparkles;
}
function deviceGroup(c: Control) {
  if (c.domain === "light") return "lights";
  if (
    ["climate", "fan", "humidifier"].includes(c.domain) ||
    ["temperature", "humidity"].includes(String(c.attributes.device_class))
  )
    return "climate";
  if (["media_player", "vacuum"].includes(c.domain)) return "media";
  if (
    [
      "binary_sensor",
      "lock",
      "cover",
      "alarm_control_panel",
      "camera",
    ].includes(c.domain)
  )
    return "security";
  return "other";
}
export function CardBuilder({
  home,
  lang,
  offline,
  cards,
  placed,
  initial,
  onClose,
  onApply,
}: {
  home: Home;
  lang: string;
  offline: boolean;
  cards: HomeGridCard[];
  placed: GridItem[];
  initial?: { item: GridItem; card: HomeGridCard };
  onClose: () => void;
  onApply: (selection: CardSelection) => void;
}) {
  const en = lang === "en",
    t = (nb: string, english: string) => (en ? english : nb);
  const [stage, setStage] = useState<Stage>(initial ? "configure" : "start");
  const root = useRef<HTMLDivElement>(null);
  const sourceIds = useId();
  useEffect(() => {
    const heading = root.current?.querySelector<HTMLHeadingElement>("h3");
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
    const scroll = root.current?.closest(".dashboard-settings-content");
    if (scroll) scroll.scrollTop = 0;
  }, [stage]);
  const [intent, setIntent] = useState<"device" | "graph" | "widget">(
    initial?.item.config?.type === "graph" ? "graph" : "device",
  );
  const [base, setBase] = useState<HomeGridCard | undefined>(initial?.card);
  const [config, setConfig] = useState<CardConfig>(() =>
    initial?.item.config
      ? structuredClone(initial.item.config)
      : defaultCardConfig(
          initial?.card.entityId ? [initial.card.entityId] : [],
        ),
  );
  const [search, setSearch] = useState("");
  const [room, setRoom] = useState("all");
  const [group, setGroup] = useState("all");
  const [limit, setLimit] = useState(60);
  const [returnToConfig, setReturn] = useState(false);
  const source = home.controls.find((c) => c.entity_id === config.sources[0]);
  const selected = home.controls.filter((c) =>
    config.sources.includes(c.entity_id),
  );
  const sourcesValid =
    config.type === "auto"
      ? true
      : config.type === "graph"
        ? config.sources.length > 0 &&
          selected.length === config.sources.length &&
          selected.every(
            (c) =>
              isGraphSource(c) && (!source || compatibleSources(source, c)),
          )
        : selected.length === 1;
  const choices = useMemo(
    () =>
      home.controls.filter(
        (c) =>
          !c.diagnostic &&
          !["person", "device_tracker", "calendar", "weather"].includes(
            c.domain,
          ),
      ),
    [home.controls],
  );
  const filtered = choices.filter(
    (c) =>
      (intent !== "graph" || isGraphSource(c)) &&
      (room === "all" || (room === "none" ? !c.area_id : c.area_id === room)) &&
      (group === "all" || deviceGroup(c) === group) &&
      `${c.name} ${home.areas.find((a) => a.area_id === c.area_id)?.name || ""}`
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()),
  );
  const widgets = cards.filter(
    (card) =>
      !card.id.startsWith("device:") &&
      !card.id.startsWith("camera:") &&
      !card.id.startsWith("custom:") &&
      !placed.some((item) => item.id === card.id),
  );
  const update = (value: Partial<CardConfig>) =>
    setConfig((previous) => ({ ...previous, ...value }));
  const start = (kind: typeof intent) => {
    setIntent(kind);
    setSearch("");
    setGroup("all");
    setRoom("all");
    setLimit(60);
    setReturn(false);
    setConfig(defaultCardConfig());
    setBase(undefined);
    if (kind === "graph") setConfig({ ...defaultCardConfig(), type: "graph" });
    setStage(kind === "widget" ? "widgets" : "devices");
  };
  function choose(c: Control) {
    if (intent === "graph") {
      update({
        sources: config.sources.includes(c.entity_id)
          ? config.sources.filter((id) => id !== c.entity_id)
          : [...config.sources, c.entity_id],
      });
      return;
    }
    if (!initial && !returnToConfig)
      setBase(
        cards.find((card) =>
          [`device:${c.entity_id}`, `camera:${c.entity_id}`].includes(card.id),
        ),
      );
    update({ sources: [c.entity_id] });
    setStage("configure");
  }
  const editSources = (graph: boolean) => {
    setIntent(graph ? "graph" : "device");
    setReturn(true);
    setSearch("");
    setGroup("all");
    setRoom("all");
    setStage("devices");
    if (graph) update({ type: "graph" });
  };
  function type(value: CardConfig["type"]) {
    const sources =
      value === "auto" && base && !base.entityId
        ? []
        : value === "graph"
          ? config.sources
          : config.sources.slice(0, 1);
    update({ type: value, sources });
    if (
      value === "graph" &&
      (!sources.length || !source || !isGraphSource(source))
    ) {
      update({ type: value, sources: [] });
      editSources(true);
    }
  }
  const types = [
    {
      id: "auto" as const,
      name: t("Utstyrskort", "Device card"),
      description: t(
        "Illustrasjon og direkte styring",
        "Illustration and direct controls",
      ),
      Icon: SlidersHorizontal,
    },
    {
      id: "compact" as const,
      name: t("Kompakt", "Compact"),
      description: t(
        "Status og snarvei til enheten",
        "Status and a shortcut to the device",
      ),
      Icon: LayoutDashboard,
    },
    {
      id: "picture" as const,
      name: t("Bildekort", "Picture card"),
      description: t(
        "Et større bilde med tydelig status",
        "A larger image with clear status",
      ),
      Icon: Sparkles,
    },
    {
      id: "graph" as const,
      name: t("Graf", "Graph"),
      description: t(
        "Sammenlign opptil seks datakilder",
        "Compare up to six data sources",
      ),
      Icon: ChartNoAxesCombined,
    },
  ].filter(
    (choice) => choice.id === "auto" || choice.id === "graph" || !!source,
  );
  const title = initial
    ? t("Rediger kort", "Edit card")
    : t("Legg til kort", "Add card");
  const previewConfig = config;
  return (
    <SettingsDialog title={title} lang={lang} onClose={onClose}>
      <div
        ref={root}
        className="card-builder home-canvas-library"
        data-stage={stage}
      >
        <nav
          className="card-builder-progress"
          aria-label={t("Steg i kortvelgeren", "Card picker steps")}
        >
          <span
            data-current={stage === "start"}
            aria-current={stage === "start" ? "step" : undefined}
          >
            1 <span>{t("Innhold", "Content")}</span>
          </span>
          <ChevronRight size={14} />
          <span
            data-current={stage === "devices" || stage === "widgets"}
            aria-current={
              stage === "devices" || stage === "widgets" ? "step" : undefined
            }
          >
            2{" "}
            <span>
              {intent === "widget"
                ? t("Oversikt", "Overview")
                : t("Datakilde", "Data source")}
            </span>
          </span>
          <ChevronRight size={14} />
          <span
            data-current={stage === "configure"}
            aria-current={stage === "configure" ? "step" : undefined}
          >
            3 <span>{t("Kort og utseende", "Card and appearance")}</span>
          </span>
        </nav>
        {stage === "start" && (
          <>
            <div className="card-builder-intro">
              <h3>
                {t("Hva vil du legge til?", "What would you like to add?")}
              </h3>
              <p>
                {t(
                  "Velg innhold først. Så finner vi et kort som passer.",
                  "Choose the content first. Then find a card that fits.",
                )}
              </p>
            </div>
            <div className="card-builder-intents">
              <button
                aria-label={t("Enhet", "Device")}
                onClick={() => start("device")}
              >
                <div className="card-intent-art">
                  <img
                    src={
                      new URL("home/equipment/pendant.webp", document.baseURI)
                        .href
                    }
                    alt=""
                  />
                  <img
                    src={
                      new URL("home/equipment/plug.webp", document.baseURI).href
                    }
                    alt=""
                  />
                </div>
                <span>
                  <Lightbulb size={22} />
                  <strong>{t("Enhet", "Device")}</strong>
                  <small>
                    {t(
                      "Lys, klima, lyd og annet utstyr",
                      "Lights, climate, sound and other equipment",
                    )}
                  </small>
                </span>
                <ArrowRight size={20} />
              </button>
              <button
                aria-label={t("Graf", "Graph")}
                onClick={() => start("graph")}
              >
                <div className="card-intent-art card-intent-graph">
                  <ChartNoAxesCombined size={86} strokeWidth={1} />
                  <span>°C · W · %</span>
                </div>
                <span>
                  <ChartNoAxesCombined size={22} />
                  <strong>{t("Graf", "Graph")}</strong>
                  <small>
                    {t(
                      "Flere målinger i samme graf",
                      "Multiple readings in one graph",
                    )}
                  </small>
                </span>
                <ArrowRight size={20} />
              </button>
              <button
                aria-label={t("Oversiktskort", "Overview card")}
                onClick={() => start("widget")}
              >
                <div className="card-intent-art card-intent-widgets">
                  <LayoutDashboard size={86} strokeWidth={1} />
                </div>
                <span>
                  <LayoutDashboard size={22} />
                  <strong>{t("Oversiktskort", "Overview card")}</strong>
                  <small>
                    {t(
                      "Vær, kalender, personer og rutiner",
                      "Weather, calendar, people and routines",
                    )}
                  </small>
                </span>
                <ArrowRight size={20} />
              </button>
            </div>
          </>
        )}
        {stage === "devices" && (
          <>
            <button
              className="card-builder-back"
              onClick={() => setStage(returnToConfig ? "configure" : "start")}
            >
              <ArrowLeft size={17} />
              {t("Tilbake", "Back")}
            </button>
            <div className="card-builder-intro">
              <h3>
                {intent === "graph"
                  ? t(
                      "Hvilke målinger vil du sammenligne?",
                      "Which readings would you like to compare?",
                    )
                  : t(
                      "Hvilken enhet vil du legge til?",
                      "Which device would you like to add?",
                    )}
              </h3>
              <p>
                {intent === "graph"
                  ? t(
                      "Velg opptil seks kilder med sammenlignbare enheter. W/kW og °C/°F tilpasses automatisk.",
                      "Choose up to six sources with comparable units. W/kW and °C/°F are converted automatically.",
                    )
                  : t(
                      "Finn enheten i rommet sitt, eller søk etter navnet.",
                      "Find the device in its room, or search by name.",
                    )}
              </p>
            </div>
            <div className="card-builder-filters">
              <label>
                <Search size={18} />
                <input
                  aria-label={t("Søk etter enheter", "Search devices")}
                  placeholder={t(
                    "Søk etter enhet eller rom…",
                    "Search for a device or room…",
                  )}
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setLimit(60);
                  }}
                />
              </label>
              <select
                aria-label={t("Filtrer etter rom", "Filter by room")}
                value={room}
                onChange={(e) => {
                  setRoom(e.target.value);
                  setLimit(60);
                }}
              >
                <option value="all">{t("Alle rom", "All rooms")}</option>
                {home.areas.map((area) => (
                  <option key={area.area_id} value={area.area_id}>
                    {area.name}
                  </option>
                ))}
                <option value="none">{t("Uten rom", "No room")}</option>
              </select>
            </div>
            <div
              className="card-builder-categories"
              role="group"
              aria-label={t("Enhetstype", "Device category")}
            >
              {[
                ["all", t("Alle", "All")],
                ["lights", t("Lys", "Lights")],
                ["climate", t("Klima", "Climate")],
                ["media", t("Media og rengjøring", "Media and cleaning")],
                ["security", t("Sikkerhet", "Security")],
                ["other", t("Annet", "Other")],
              ].map(([id, label]) => (
                <button
                  key={id}
                  aria-pressed={group === id}
                  onClick={() => {
                    setGroup(id);
                    setLimit(60);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {intent === "graph" && (
              <div className="card-selected-sources">
                <strong>
                  {config.sources.length} / 6 {t("valgt", "selected")}
                </strong>
                {config.sources.map((id) => (
                  <button
                    key={id}
                    onClick={() =>
                      update({
                        sources: config.sources.filter(
                          (source) => source !== id,
                        ),
                      })
                    }
                  >
                    {home.controls.find((c) => c.entity_id === id)?.name ||
                      t("Manglende kilde", "Missing source")}
                    <X size={14} />
                  </button>
                ))}
              </div>
            )}
            <div className="card-device-options">
              {filtered.slice(0, limit).map((c) => {
                const checked = config.sources.includes(c.entity_id);
                const incompatible =
                  intent === "graph" &&
                  !checked &&
                  !!source &&
                  !compatibleSources(source, c);
                const blocked =
                  incompatible ||
                  (intent === "graph" &&
                    !checked &&
                    config.sources.length >= 6);
                return (
                  <button
                    key={c.entity_id}
                    data-entity={c.entity_id}
                    onClick={() => choose(c)}
                    disabled={blocked}
                    aria-label={c.name}
                    aria-describedby={`${sourceIds}-${c.entity_id}-room ${sourceIds}-${c.entity_id}-state`}
                    aria-pressed={intent === "graph" ? checked : undefined}
                    data-selected={checked}
                  >
                    <span className="card-device-art">
                      {c.domain === "sensor" ? (
                        <CardSourceGlyph c={c} />
                      ) : (
                        <EquipmentArtwork
                          c={c}
                          available={!offline && home.connected && usable(c)}
                        />
                      )}
                    </span>
                    <strong>{c.name}</strong>
                    <small id={`${sourceIds}-${c.entity_id}-room`}>
                      {home.areas.find((area) => area.area_id === c.area_id)
                        ?.name || t("Uten rom", "No room")}
                    </small>
                    <span
                      className="card-device-state"
                      id={`${sourceIds}-${c.entity_id}-state`}
                    >
                      {incompatible
                        ? t("Annen måleenhet", "Different measurement unit")
                        : c.domain === "sensor"
                          ? `${usable(c) && numeric(c) !== null ? reading(c, lang) : "—"}${controlUnit(c) ? "" : " "}`
                          : controlState(
                              c,
                              usable(c) ? c.state : c.availability,
                              lang,
                            )}
                    </span>
                    {checked && (
                      <Check className="card-option-check" size={19} />
                    )}
                  </button>
                );
              })}
            </div>
            {!filtered.length && (
              <p className="card-builder-empty">
                {t(
                  "Ingen enheter passer til søket. Prøv et annet navn eller rom.",
                  "No devices match. Try another name or room.",
                )}
              </p>
            )}
            {filtered.length > limit && (
              <button onClick={() => setLimit(limit + 60)}>
                {t("Vis flere enheter", "Show more devices")}
              </button>
            )}
            {intent === "graph" && (
              <footer className="card-builder-footer">
                <span>
                  {source
                    ? `${t("Felles skala", "Shared scale")}: ${unitInfo(controlUnit(source)).unit || t("uten enhet", "no unit")}`
                    : t(
                        "Velg den første datakilden.",
                        "Choose the first data source.",
                      )}
                </span>
                <button
                  className="primary"
                  disabled={!config.sources.length}
                  onClick={() => setStage("configure")}
                >
                  {t("Velg kort", "Choose card")}
                  <ArrowRight size={17} />
                </button>
              </footer>
            )}
          </>
        )}
        {stage === "widgets" && (
          <>
            <button
              className="card-builder-back"
              onClick={() => setStage("start")}
            >
              <ArrowLeft size={17} />
              {t("Tilbake", "Back")}
            </button>
            <div className="card-builder-intro">
              <h3>{t("Et hjem med god oversikt", "Your home at a glance")}</h3>
              <p>
                {t(
                  "Kort som samler nyttig innhold fra hjemmet ditt.",
                  "Cards that bring together useful information from your home.",
                )}
              </p>
            </div>
            <div className="card-widget-options">
              {widgets.map((card) => {
                const WidgetIcon = widgetIcon(card.id);
                return (
                  <button
                    key={card.id}
                    onClick={() => {
                      setBase(card);
                      setConfig(defaultCardConfig());
                      setStage("configure");
                    }}
                  >
                    <WidgetIcon size={34} strokeWidth={1.2} />
                    <strong>{card.title}</strong>
                    <ChevronRight size={18} />
                  </button>
                );
              })}
            </div>
            {!widgets.length && (
              <p>
                {t(
                  "Alle oversiktskort for denne siden er allerede lagt til. Du kan fortsatt legge til enheter og grafer.",
                  "All overview cards for this page are already added. You can still add devices and graphs.",
                )}
              </p>
            )}
          </>
        )}
        {stage === "configure" && (
          <>
            {!initial && (
              <button
                className="card-builder-back"
                onClick={() => {
                  setIntent(
                    config.type === "graph"
                      ? "graph"
                      : base && !base.entityId
                        ? "widget"
                        : "device",
                  );
                  setStage(
                    base && !base.entityId && config.type !== "graph"
                      ? "widgets"
                      : "devices",
                  );
                }}
              >
                <ArrowLeft size={17} />
                {t("Tilbake", "Back")}
              </button>
            )}
            <div className="card-builder-composer">
              <div className="card-builder-fields">
                <div className="card-builder-intro">
                  <h3>{t("Slik vil du se det", "Make it yours")}</h3>
                  <p>
                    {source?.name ||
                      base?.title ||
                      t("Dine målinger", "Your readings")}
                  </p>
                </div>
                <fieldset>
                  <legend>{t("Korttype", "Card type")}</legend>
                  <div className="card-type-options">
                    {types.map((choice) => (
                      <button
                        key={choice.id}
                        aria-label={
                          choice.id === "auto" && base && !base.entityId
                            ? t("Oversiktskort", "Overview card")
                            : choice.name
                        }
                        aria-pressed={config.type === choice.id}
                        onClick={() => type(choice.id)}
                      >
                        <choice.Icon size={24} />
                        <span>
                          <strong>
                            {choice.id === "auto" && base && !base.entityId
                              ? t("Oversiktskort", "Overview card")
                              : choice.name}
                          </strong>
                          <small>{choice.description}</small>
                        </span>
                        {config.type === choice.id && <Check size={17} />}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <label className="card-title-field">
                  {t("Navn på kortet", "Card title")}
                  <input
                    maxLength={80}
                    value={config.title}
                    placeholder={
                      source?.name ||
                      base?.title ||
                      t("Valgfritt navn", "Optional title")
                    }
                    onChange={(e) => update({ title: e.target.value })}
                  />
                </label>
                {(config.sources.length > 0 || config.type === "graph") && (
                  <section className="card-builder-source-summary">
                    <div>
                      <strong>{t("Datakilder", "Data sources")}</strong>
                      <button
                        onClick={() => editSources(config.type === "graph")}
                      >
                        {t("Endre", "Change")}
                      </button>
                    </div>
                    {config.sources.map((id) => (
                      <span key={id}>
                        {home.controls.find((c) => c.entity_id === id)?.name ||
                          t("Datakilde mangler", "Missing data source")}
                      </span>
                    ))}
                    {(config.type === "graph" ||
                      (source && isGraphSource(source))) && (
                      <button onClick={() => editSources(true)}>
                        + {t("Legg til datakilde", "Add data source")}
                      </button>
                    )}
                  </section>
                )}
                {config.type === "graph" && (
                  <label className="card-title-field">
                    {t("Tidsrom", "Period")}
                    <select
                      value={config.period}
                      onChange={(e) =>
                        update({
                          period: e.target.value as CardConfig["period"],
                        })
                      }
                    >
                      <option value="6">
                        {t("Siste 6 timer", "Last 6 hours")}
                      </option>
                      <option value="24">
                        {t("Siste døgn", "Last 24 hours")}
                      </option>
                      <option value="168">
                        {t("Siste 7 dager", "Last 7 days")}
                      </option>
                    </select>
                  </label>
                )}
                <details className="card-appearance-options">
                  <summary>{t("Ikon og bilde", "Icon and image")}</summary>
                  <fieldset>
                    <legend>{t("Velg ikon", "Choose icon")}</legend>
                    <div className="card-icon-options">
                      {cardIcons.map((choice) => (
                        <button
                          key={choice.id}
                          aria-label={en ? choice.en : choice.nb}
                          title={en ? choice.en : choice.nb}
                          aria-pressed={config.icon === choice.id}
                          onClick={() => update({ icon: choice.id })}
                        >
                          <choice.Icon size={24} />
                          {config.icon === choice.id && <Check size={11} />}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset>
                    <legend>{t("Velg bilde", "Choose image")}</legend>
                    <div className="card-image-options">
                      {cardImages.map((choice) => (
                        <button
                          key={choice.id}
                          aria-pressed={config.image === choice.id}
                          onClick={() => update({ image: choice.id })}
                        >
                          {choice.path ? (
                            <img
                              src={new URL(choice.path, document.baseURI).href}
                              alt=""
                              loading="lazy"
                            />
                          ) : (
                            <span>
                              <Sparkles size={24} />
                            </span>
                          )}
                          <small>{en ? choice.en : choice.nb}</small>
                          {config.image === choice.id && <Check size={15} />}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                </details>
              </div>
              <aside className="card-builder-preview">
                <span>{t("Forhåndsvisning", "Preview")}</span>
                <div className="home-canvas-cell" data-preview>
                  <div
                    className="home-canvas-viewport"
                    data-card-image={previewConfig.image}
                  >
                    {previewConfig.type !== "picture" &&
                      cardImageURL(previewConfig.image) &&
                      cardImages.find(
                        (choice) => choice.id === previewConfig.image,
                      )?.path && (
                        <img
                          className="personal-card-backdrop"
                          src={
                            new URL(
                              cardImages.find(
                                (choice) => choice.id === previewConfig.image,
                              )!.path!,
                              document.baseURI,
                            ).href
                          }
                          alt=""
                        />
                      )}
                    <div className="home-canvas-content" inert>
                      <InSettingsDialog.Provider value={false}>
                        <ConfiguredHomeCard
                          config={previewConfig}
                          home={home}
                          offline={offline}
                          lang={lang}
                          original={base?.content}
                          originalEntity={base?.entityId}
                        />
                      </InSettingsDialog.Provider>
                    </div>
                  </div>
                </div>
                <small>
                  {t(
                    "Forhåndsvisningen bruker hjemmets tilgjengelige data.",
                    "The preview uses your home's available data.",
                  )}
                </small>
              </aside>
            </div>
            {!sourcesValid && (
              <p role="alert">
                {t(
                  "Velg tilgjengelige datakilder med sammenlignbare måleenheter.",
                  "Choose available data sources with comparable units.",
                )}
              </p>
            )}
            <footer className="card-builder-footer">
              <span>
                {t(
                  "Endringene beholdes når du lagrer oppsettet.",
                  "Changes are kept when you save the layout.",
                )}
              </span>
              <div>
                <button onClick={onClose}>{t("Avbryt", "Cancel")}</button>
                <button
                  className="primary"
                  disabled={!sourcesValid}
                  onClick={() => onApply({ base, config: previewConfig })}
                >
                  <Check size={17} />
                  {initial
                    ? t("Bruk endringer", "Apply changes")
                    : t("Legg til kort", "Add card")}
                </button>
              </div>
            </footer>
          </>
        )}
      </div>
    </SettingsDialog>
  );
}

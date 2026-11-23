import { EnergySensorPicker } from "./EnergySensorPicker";
import { SettingsDialog } from "./SettingsDialog";
import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Sun,
  House,
  CarFront,
  BatteryCharging,
  UtilityPole,
  Settings2,
  Radio,
  Check,
  Pause,
  Play,
  CalendarDays,
  Zap,
  ChartNoAxesCombined,
} from "lucide-react";
import { api } from "../api";
import type { Home } from "../types";
import {
  flowRoles,
  isEvCharging,
  noFlows,
  type FlowRole,
  type FlowPreferences,
  type FlowSnapshot,
} from "./energyFlowModel";
import { FlowHistory, type FlowHistoryData } from "./FlowHistory";
import { EnergyWelcome } from "./EnergyWelcome";
import { EnergyPicture } from "./EnergyPicture";
import { energySceneDesign } from "./energySceneDesign";
import "./energyFlow.css";
const harmoni = energySceneDesign === "harmoni";
const Scene = harmoni ? EnergyPicture : lazy(() => import("./EnergyScene"));
class SceneBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
type Live = {
  flows: FlowSnapshot;
  battery_level: number | null;
  battery_status?: FlowSnapshot[FlowRole]["status"];
  connected: boolean;
  sampled_at: string;
};
export function EnergyFlow({
  home,
  offline,
  lang,
  managedEquipment = false,
  embedded = false,
}: {
  home: Home;
  offline: boolean;
  lang: string;
  managedEquipment?: boolean;
  embedded?: boolean;
}) {
  const en = lang === "en",
    t = (nb: string, english: string) => (en ? english : nb),
    qc = useQueryClient();
  const config = useQuery({
    queryKey: ["energy-flow-preferences"],
    queryFn: () => api<FlowPreferences>("home/energy-flow/preferences"),
  });
  const live = useQuery({
    queryKey: ["energy-flow-live", config.data],
    queryFn: () => api<Live>("home/energy-flow/live"),
    enabled: !offline && !!config.data,
    refetchInterval: 5000,
    retry: false,
  });
  const [draft, edit] = useState<FlowPreferences | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [paused, pause] = useState(false),
    [selected, select] = useState<FlowRole | null>(null),
    [editingRole, setEditingRole] = useState<FlowRole | null>(null),
    [focusRequest, requestFocus] = useState(0),
    [historyPeriod, setHistoryPeriod] = useState("24h");
  const bindingRefs = useRef<Partial<Record<FlowRole, HTMLDivElement>>>({});
  useEffect(() => {
    if (!focusRequest || !editingRole) return;
    const target = bindingRefs.current[editingRole];
    target?.scrollIntoView({ block: "nearest", behavior: "instant" });
    target
      ?.querySelector<HTMLButtonElement>(".energy-picker-trigger")
      ?.focus({ preventScroll: true });
  }, [focusRequest, editingRole]);
  const labels: Record<FlowRole, string> = {
    solar: t("Solceller", "Solar"),
    home: t("Hjemmet", "Home"),
    ev: t("Elbil", "EV"),
    battery: t("Batteri", "Battery"),
    grid: t("Strømnett", "Grid"),
  };
  const icons = {
    solar: Sun,
    home: House,
    ev: CarFront,
    battery: BatteryCharging,
    grid: UtilityPole,
  };
  const statuses = {
    ok: "",
    unavailable: t("Utilgjengelig", "Unavailable"),
    stale: t("Gammel måling", "Stale reading"),
    invalid: t("Ugyldig måling", "Invalid reading"),
    unconfigured: t("Legg til måling", "Add a reading"),
  };
  const flows = noFlows();
  for (const role of flowRoles) {
    const reading = live.data?.flows[role];
    if (reading) flows[role] = { ...reading };
    flows[role].visible =
      config.data?.[role].visible ?? (role === "home" || role === "grid");
    if (offline || live.isError || !live.data?.connected) {
      flows[role].watts = null;
      flows[role].status = config.data?.[role].source
        ? "unavailable"
        : "unconfigured";
    }
  }
  const anyConfigured = flowRoles.some(
    (r) => config.data?.[r].source && config.data[r].visible,
  );
  const anyLive = flowRoles.some(
    (r) => flows[r].visible && flows[r].status === "ok",
  );
  const history = useQuery({
    queryKey: ["flow-history", config.data, historyPeriod],
    queryFn: () =>
      api<FlowHistoryData>(`home/energy-flow/history?period=${historyPeriod}`),
    enabled:
      !!config.data &&
      anyConfigured &&
      !offline &&
      (!harmoni || (selected !== null && flows[selected].visible && !draft)),
    refetchInterval: 60000,
    retry: false,
  });
  const format = (watts: number | null) =>
    watts === null
      ? "—"
      : Math.abs(watts) >= 1000
        ? `${(Math.abs(watts) / 1000).toLocaleString(en ? "en-GB" : "nb-NO", { maximumFractionDigits: 2 })} kW`
        : `${Math.abs(watts).toLocaleString(en ? "en-GB" : "nb-NO", { maximumFractionDigits: 0 })} W`;
  function direction(role: FlowRole) {
    const f = flows[role];
    if (f.status !== "ok") return statuses[f.status];
    if (harmoni && role === "ev")
      return isEvCharging(f)
        ? t("Lader", "Charging")
        : t("Ingen lading", "Not charging");
    if (Math.abs(f.watts || 0) <= 0.5) return t("Ingen flyt", "No flow");
    if (role === "grid")
      return f.watts! > 0
        ? t("Fra nettet", "Importing")
        : t("Til nettet", "Exporting");
    if (role === "battery")
      return f.watts! > 0
        ? t("Leverer strøm", "Discharging")
        : t("Lader batteriet", "Charging");
    return role === "solar"
      ? t("Produserer", "Generating")
      : role === "ev"
        ? t("Lader", "Charging")
        : t("Forbruk", "Consumption");
  }
  const batteryLevel =
    !offline &&
    !live.isError &&
    live.data?.connected &&
    (live.data.battery_status === undefined ||
      live.data.battery_status === "ok") &&
    live.data.battery_level != null
      ? `${live.data.battery_level.toLocaleString(en ? "en-GB" : "nb-NO", { maximumFractionDigits: 0 })}%`
      : null;
  const readings = Object.fromEntries(
    flowRoles.map((role) => [
      role,
      {
        label:
          harmoni && role === "home"
            ? t("Forbruk i huset", "Home use")
            : labels[role],
        value: format(flows[role].watts),
        detail: `${direction(role)}${role === "battery" && batteryLevel ? ` · ${batteryLevel}` : ""}`,
      },
    ]),
  ) as Record<FlowRole, { label: string; value: string; detail: string }>;
  function configure(role: FlowRole) {
    if (!config.data || busy) return;
    edit(draft ?? structuredClone(config.data));
    setEditingRole(role);
    setError("");
    requestFocus((n) => n + 1);
  }
  const sensors = home.controls.filter(
    (c) =>
      c.domain === "sensor" &&
      ["W", "kW"].includes(String(c.attributes.unit_of_measurement)),
  );
  const percents = home.controls.filter(
    (c) => c.domain === "sensor" && c.attributes.unit_of_measurement === "%",
  );
  const positiveLabels = (r: FlowRole) =>
    r === "grid"
      ? [
          t("Import fra nettet", "Grid import"),
          t("Eksport til nettet", "Grid export"),
        ]
      : [
          t("Batteriet leverer", "Battery discharging"),
          t("Batteriet lader", "Battery charging"),
        ];
  async function save() {
    if (!draft) return;
    setBusy(true);
    setError("");
    try {
      await api("home/energy-flow/preferences", "PUT", draft);
      await qc.invalidateQueries({ queryKey: ["energy-flow-preferences"] });
      await qc.invalidateQueries({ queryKey: ["energy-flow-live"] });
      await qc.invalidateQueries({ queryKey: ["flow-history"] });
      edit(null);
      setEditingRole(null);
    } catch {
      setError(
        t(
          "Kunne ikke lagre. Kontroller at målerne er tilgjengelige og har riktig enhet.",
          "Could not save. Check sensor availability and units.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  function picker(
    value: string | null,
    change: (value: string | null) => void,
    options = sensors,
    label?: string,
  ) {
    return (
      <EnergySensorPicker
        label={label || t("Velg måling", "Choose reading")}
        hint=""
        lang={lang}
        value={value || ""}
        onChange={(entity) => change(entity || null)}
        sensors={options.map((c) => ({
          entity: c.entity_id,
          name: c.name,
          unit: String(c.attributes.unit_of_measurement),
          state: offline || !home.connected ? "unavailable" : c.state,
        }))}
      />
    );
  }
  const visualControls = (
    <div className="flow-visual-top">
      <span className={anyLive ? "flow-live" : "flow-waiting"}>
        {harmoni ? (
          <i className="flow-live-dot" aria-hidden="true" />
        ) : (
          <Radio size={14} />
        )}
        {offline || live.isError || live.data?.connected === false
          ? t("Frakoblet", "Offline")
          : anyLive
            ? harmoni
              ? t("Direkte", "Live")
              : t("Målinger fra hjemmet", "Readings from home")
            : t("Venter på målinger", "Waiting for readings")}
      </span>
      <button aria-pressed={paused} onClick={() => pause(!paused)}>
        {paused ? <Play size={15} /> : <Pause size={15} />}{" "}
        {paused ? t("Vis flyt", "Show flow") : t("Pause", "Pause")}
      </button>
    </div>
  );
  const equipmentLabel = harmoni
    ? t("Velg utstyr", "Choose equipment")
    : t("Rediger 3D-modell", "Edit 3D model");
  function renderReadingHistory(role: FlowRole) {
    return (
      <>
        <section
          id="flow-history-panel"
          className="flow-history-panel"
          data-role={role}
          aria-label={t("Effekthistorikk", "Power history")}
        >
          <header>
            <div>
              {!harmoni && (
                <span className="eyebrow">
                  <ChartNoAxesCombined size={14} aria-hidden="true" />
                  {t("Effekthistorikk", "Power history")}
                </span>
              )}
              <h3>{labels[role]}</h3>
            </div>
            <div className="flow-history-periods">
              {[
                ["24h", t("Siste døgn", "24 hours")],
                ["7d", t("Siste uke", "7 days")],
              ].map(([value, label]) => (
                <button
                  key={value}
                  aria-pressed={historyPeriod === value}
                  onClick={() => setHistoryPeriod(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </header>
          {offline ? (
            <p>
              {t(
                "Historikken er utilgjengelig når du er frakoblet.",
                "History is unavailable while offline.",
              )}
            </p>
          ) : history.isError ? (
            <p role="alert">
              {t("Kunne ikke hente historikken.", "Could not load history.")}{" "}
              <button onClick={() => history.refetch()}>
                {t("Prøv igjen", "Retry")}
              </button>
            </p>
          ) : history.isFetching && !history.data ? (
            <p>{t("Henter historikk…", "Loading history…")}</p>
          ) : (
            <FlowHistory
              key={`${role}-${historyPeriod}`}
              lang={lang}
              points={history.data?.series[role] || []}
            />
          )}
          {["grid", "battery"].includes(role) && (
            <p className="flow-chart-sign">
              {role === "grid"
                ? t(
                    "Pluss: fra nettet · Minus: til nettet",
                    "Positive: import · Negative: export",
                  )
                : t(
                    "Pluss: batteriet leverer · Minus: batteriet lader",
                    "Positive: discharging · Negative: charging",
                  )}
            </p>
          )}
        </section>
        <div className="flow-reading-detail">
          <strong>{labels[role]}</strong>
          <span>
            {home.controls.find(
              (c) => c.entity_id === config.data?.[role].source,
            )?.name || t("Ingen måler valgt", "No sensor selected")}
          </span>
          <span>
            {t("Sist målt", "Last measured")}:{" "}
            {flows[role].measured_at
              ? new Date(flows[role].measured_at!).toLocaleString(
                  en ? "en-GB" : "nb-NO",
                )
              : "—"}
          </span>
          <small>
            {t("Retning", "Direction")}: {direction(role)}
          </small>
          <button
            disabled={!config.data || busy}
            onClick={() => {
              if (harmoni) select(null);
              configure(role);
            }}
          >
            <Settings2 size={15} aria-hidden="true" />
            {config.data?.[role].source
              ? t("Endre måler", "Change sensor")
              : t("Legg til måling", "Add a reading")}
          </button>
        </div>
      </>
    );
  }
  return (
    <section
      className="energy-flow energy-flow-cinematic"
      data-scene-design={energySceneDesign}
      aria-label={t("Energiflyt", "Energy flow")}
    >
      <header className="flow-heading">
        {!embedded && (
          <EnergyWelcome home={home} offline={offline} lang={lang} />
        )}
        {harmoni && visualControls}
        <div className="flow-heading-actions">
          {!managedEquipment && (
            <button
              className="flow-configure"
              aria-label={equipmentLabel}
              title={equipmentLabel}
              disabled={!config.data || busy}
              onClick={() => {
                edit(structuredClone(config.data!));
                setEditingRole(null);
                setError("");
                requestAnimationFrame(() =>
                  document.getElementById("flow-model-options")?.focus(),
                );
              }}
            >
              <House size={20} aria-hidden="true" />
            </button>
          )}
          <button
            className="flow-configure"
            aria-label={t("Konfigurer energiflyt", "Configure energy flow")}
            title={t("Konfigurer energiflyt", "Configure energy flow")}
            disabled={!config.data || busy}
            aria-expanded={!!draft}
            onClick={() => {
              edit(draft ? null : structuredClone(config.data!));
              setEditingRole(null);
              setError("");
            }}
          >
            <Settings2 size={20} aria-hidden="true" />
          </button>
        </div>
      </header>
      {config.isError && (
        <p role="alert">
          {t("Oppsettet kunne ikke hentes.", "Could not load configuration.")}{" "}
          <button onClick={() => config.refetch()}>
            {t("Prøv igjen", "Retry")}
          </button>
        </p>
      )}
      {config.isPending && (
        <p>{t("Henter oppsett…", "Loading configuration…")}</p>
      )}
      {draft && (
        <SettingsDialog
          title={
            editingRole
              ? `${t("Måling", "Measurement")} · ${labels[editingRole]}`
              : t("Konfigurer energiflyt", "Configure energy flow")
          }
          lang={lang}
          busy={busy}
          compact={!!editingRole}
          onClose={() => {
            edit(null);
            setEditingRole(null);
          }}
        >
          <fieldset className="flow-settings" disabled={busy}>
            <legend>
              {editingRole
                ? t("Velg effektmåler", "Choose power sensor")
                : t(
                    "Velg målinger for energiflyt",
                    "Choose readings for energy flow",
                  )}
            </legend>
            <p>
              {t(
                "Velg effektmålere i W eller kW. kWh er energi over tid og brukes i historikken under. Oppsettet styrer ingen enheter.",
                "Choose power sensors in W or kW. kWh measures energy over time and belongs in the history below. Configuration controls no devices.",
              )}
            </p>
            {!editingRole && !managedEquipment && (
              <div
                id="flow-model-options"
                className="flow-model-options"
                tabIndex={-1}
              >
                <h3>
                  {t("Dette finnes i hjemmet mitt", "Equipment in my home")}
                </h3>
                <p>
                  {harmoni
                    ? t(
                        "Velg utstyret du har hjemme. Det vises på husbildet, og bilen vises når den lader.",
                        "Choose the equipment you have at home. It appears in the illustration, and the car appears while charging.",
                      )
                    : t(
                        "Fjern avhukingen for utstyr du ikke har. Det fjernes fra modellen, målekortene og lysflyten når du lagrer. «Hjemmet» styrer bare visningen av husets forbruk.",
                        "Uncheck equipment you do not have. Saving removes it from the model, readings and light paths. “Home” only controls the consumption display.",
                      )}
                </p>
                <div className="flow-model-toggles">
                  {flowRoles.map((role) => {
                    const Icon = icons[role];
                    return (
                      <label key={role}>
                        <input
                          type="checkbox"
                          checked={draft[role].visible}
                          onChange={(e) =>
                            edit({
                              ...draft,
                              [role]: {
                                ...draft[role],
                                visible: e.target.checked,
                              },
                            })
                          }
                        />
                        <Icon size={21} />
                        {labels[role]}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
            {managedEquipment && (
              <p>
                {t(
                  "Endre hvilket utstyr du har under Energiinnstillinger.",
                  "Change your equipment in Energy settings.",
                )}
              </p>
            )}
            <div className="flow-binding-grid">
              {flowRoles
                .filter(
                  (role) =>
                    draft[role].visible &&
                    (!editingRole || role === editingRole),
                )
                .map((role) => (
                  <div
                    className={`flow-binding${editingRole === role ? " is-editing" : ""}`}
                    data-binding={role}
                    key={role}
                    ref={(element) => {
                      if (element) bindingRefs.current[role] = element;
                      else delete bindingRefs.current[role];
                    }}
                  >
                    <strong className="flow-binding-title">
                      {(() => {
                        const Icon = icons[role];
                        return <Icon size={19} aria-hidden="true" />;
                      })()}
                      {labels[role]}
                    </strong>
                    {draft[role].visible && (
                      <>
                        <div>
                          {picker(
                            draft[role].source,
                            (source) =>
                              edit({
                                ...draft,
                                [role]: { ...draft[role], source },
                              }),
                            sensors,
                            `${t("Effektmåler", "Power sensor")} · ${labels[role]}`,
                          )}
                        </div>
                        {["grid", "battery"].includes(role) && (
                          <>
                            <label>
                              {t("Positiv verdi betyr", "Positive value means")}
                              <select
                                value={draft[role].positive}
                                onChange={(e) =>
                                  edit({
                                    ...draft,
                                    [role]: {
                                      ...draft[role],
                                      positive: e.target.value as
                                        "supply" | "consume",
                                    },
                                  })
                                }
                              >
                                <option value="supply">
                                  {positiveLabels(role)[0]}
                                </option>
                                <option value="consume">
                                  {positiveLabels(role)[1]}
                                </option>
                              </select>
                            </label>
                            <div>
                              {t(
                                "Egen måler for motsatt retning (valgfritt)",
                                "Separate opposite-direction sensor (optional)",
                              )}
                              {picker(
                                draft[role].return_source,
                                (return_source) =>
                                  edit({
                                    ...draft,
                                    [role]: { ...draft[role], return_source },
                                  }),
                              )}
                            </div>
                            <small>
                              {t(
                                "Én måler: minus betyr motsatt retning. To målere: begge må være positive; vi viser nettoforskjellen.",
                                "One sensor: negative means reverse flow. Two sensors: both must be nonnegative; the net difference is shown.",
                              )}
                            </small>
                          </>
                        )}
                      </>
                    )}
                  </div>
                ))}
            </div>
            {(!editingRole || editingRole === "battery") && (
              <div className="flow-extra-settings">
                <div>
                  {t("Batterinivå (%)", "Battery level (%)")}
                  {picker(
                    draft.battery_level,
                    (battery_level) => edit({ ...draft, battery_level }),
                    percents,
                  )}
                </div>
                {!editingRole && (
                  <>
                    <label>
                      {t(
                        "Målingen er for gammel etter",
                        "Consider a reading stale after",
                      )}
                      <select
                        value={draft.max_age}
                        onChange={(e) =>
                          edit({ ...draft, max_age: Number(e.target.value) })
                        }
                      >
                        {[1, 5, 15, 60].map((m) => (
                          <option key={m} value={m * 60}>
                            {m} min
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flow-visible">
                      <input
                        type="checkbox"
                        checked={draft.animation}
                        onChange={(e) =>
                          edit({ ...draft, animation: e.target.checked })
                        }
                      />
                      {t("Animer strømflyten", "Animate power flow")}
                    </label>
                  </>
                )}
              </div>
            )}
            {(!editingRole || editingRole === "home") && (
              <p>
                {t(
                  "Bruk en totalmåler for hjemmet. Den kan inkludere elbillading; vi legger ikke målingene sammen. Retningen viser nettoflyt ved hvert målepunkt.",
                  "Use a whole-home consumption sensor. It may include EV charging; readings are not added together. Direction shows net flow at each sensor.",
                )}
              </p>
            )}
            {error && <p role="alert">{error}</p>}
            <div className="flow-form-actions">
              <button onClick={save}>
                <Check size={17} />
                {busy
                  ? t("Lagrer…", "Saving…")
                  : t("Lagre energiflyt", "Save energy flow")}
              </button>
              <button
                onClick={() => {
                  edit(null);
                  setEditingRole(null);
                }}
              >
                {t("Avbryt", "Cancel")}
              </button>
            </div>
          </fieldset>
        </SettingsDialog>
      )}
      <div className="flow-visual">
        {!harmoni && visualControls}
        <SceneBoundary
          fallback={
            <p>
              {t(
                "Energihuset kunne ikke lastes. Målingene vises under.",
                "Could not load the energy house. Readings are shown below.",
              )}
            </p>
          }
        >
          <Suspense
            fallback={
              <div className="flow-loading">
                {t("Bygger energihuset…", "Building your energy home…")}
              </div>
            }
          >
            <Scene
              flows={flows}
              animate={
                !!config.data?.animation &&
                !paused &&
                !offline &&
                !live.isError &&
                (!harmoni || (!draft && selected === null))
              }
              lang={lang}
              readings={readings}
              historySeries={history.data?.series}
              onConfigure={(role) => {
                if (!config.data?.[role].source) configure(role);
                else {
                  select(role);
                  if (!harmoni)
                    requestAnimationFrame(() =>
                      document
                        .getElementById("flow-history-panel")
                        ?.scrollIntoView({ block: "center" }),
                    );
                }
              }}
              canConfigure={!!config.data && !busy}
            />
          </Suspense>
        </SceneBoundary>
        {!harmoni && (
          <nav
            className="flow-navigation"
            aria-label={t("Energioversikt", "Energy overview")}
          >
            <div className="flow-measurements">
              <button
                className="flow-nav-overview"
                aria-pressed={selected === null}
                onClick={() => select(null)}
              >
                <Zap size={23} aria-hidden="true" />
                <span>{t("Energiflyt", "Energy flow")}</span>
              </button>
              {(["home", "solar", "battery", "ev", "grid"] as FlowRole[])
                .filter((role) => flows[role].visible)
                .map((role) => {
                  const Icon =
                    role === "home" ? ChartNoAxesCombined : icons[role];
                  return (
                    <button
                      key={role}
                      className="flow-measurement"
                      data-role={role}
                      data-status={flows[role].status}
                      aria-expanded={selected === role}
                      onClick={() =>
                        flows[role].status === "unconfigured"
                          ? configure(role)
                          : select(selected === role ? null : role)
                      }
                    >
                      <span className="flow-measurement-label">
                        <Icon size={22} aria-hidden="true" />
                        {role === "home"
                          ? t("Forbruk", "Consumption")
                          : labels[role]}
                      </span>
                      <strong>{format(flows[role].watts)}</strong>
                      <small>
                        {direction(role)}
                        {role === "battery" && batteryLevel && (
                          <em> · {batteryLevel}</em>
                        )}
                      </small>
                    </button>
                  );
                })}
            </div>
            <label className="flow-nav-period">
              <CalendarDays size={18} aria-hidden="true" />
              <select
                aria-label={t("Historikkperiode", "History period")}
                value={historyPeriod}
                onChange={(e) => setHistoryPeriod(e.target.value)}
              >
                <option value="24h">{t("Siste døgn", "24 hours")}</option>
                <option value="7d">{t("Siste uke", "7 days")}</option>
              </select>
            </label>
          </nav>
        )}
        {selected &&
          flows[selected].visible &&
          (harmoni
            ? !draft && (
                <SettingsDialog
                  title={
                    t("Effekthistorikk", "Power history") +
                    " · " +
                    labels[selected]
                  }
                  lang={lang}
                  onClose={() => select(null)}
                >
                  {renderReadingHistory(selected)}
                </SettingsDialog>
              )
            : renderReadingHistory(selected))}
        {!anyConfigured && config.data && (
          <p className="flow-start">
            {t(
              "Gjør huset til ditt: velg målere og hvilke deler du har via «Konfigurer energiflyt».",
              "Make this home yours: choose sensors and equipment using “Configure energy flow”.",
            )}
          </p>
        )}
        {live.isError && (
          <p role="alert">
            {t(
              "Målingene kunne ikke oppdateres.",
              "Could not update readings.",
            )}{" "}
            <button onClick={() => live.refetch()}>
              {t("Prøv igjen", "Retry")}
            </button>
          </p>
        )}
        {!harmoni && (
          <p className="flow-note">
            {t(
              "Effekt akkurat nå · W / kW. Flyt stopper ved manglende eller gamle målinger.",
              "Power now · W / kW. Flow stops for missing or stale readings.",
            )}
          </p>
        )}
      </div>
    </section>
  );
}

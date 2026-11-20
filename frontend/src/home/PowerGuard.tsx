import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  CircleAlert,
  GripVertical,
  Plug,
  Plus,
  Shield,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { ApiError, api } from "../api";
import {
  PowerGuardDevicePicker,
  powerGuardDeviceIcon,
  type PowerGuardDevice,
} from "./PowerGuardDevicePicker";
import {
  PowerGuardHistory,
  PowerGuardLoadTrend,
  usePowerGuardHistoryHour,
} from "./PowerGuardHistory";
import "./powerGuard.css";

type Load = { id: string; watts: number | null; power_entity?: string | null };
type Policy = { enabled: boolean; limit_kw: number | null; devices: Load[] };
type PowerGuardData = {
  can_edit?: boolean;
  configured_meter: boolean;
  meter: { id: string; name: string } | null;
  company: string | null;
  tiers: { label: string; limit_kw: number }[];
  devices: PowerGuardDevice[];
  config: Policy;
  status: {
    state: string;
    power_kw: number | null;
    projected_kw: number | null;
    paused_ids: string[];
    updated_at: string | null;
    last_action: { id: string; command: string; at: string } | null;
  };
};

const path = "home/energy/power-guard";
export const powerGuardQueryKey = ["power-guard"] as const;
const maxWatts = 50_000;
const maxLoads = 20;
const stateLabels: Record<string, [string, string]> = {
  disabled: ["Av", "Off"],
  waiting_meter: ["Mangler hovedmåler", "Main meter needed"],
  waiting_tariff: ["Velg kapasitetstrinn", "Select a capacity tier"],
  meter_unavailable: ["Måling utilgjengelig", "Reading unavailable"],
  warming_up: ["Samler målinger", "Collecting readings"],
  stale_meter: ["Målingen er utdatert", "Meter data is stale"],
  load_meter_unavailable: [
    "Venter på enhetsmåling",
    "Waiting for device reading",
  ],
  monitoring: ["Overvåker", "Monitoring"],
  over_target: ["Over målet", "Above target"],
  no_loads: ["Ingen enheter å pause", "No loads to pause"],
  settling: ["Venter på ny måling", "Waiting for a new reading"],
  shedding: ["Pauser forbruk", "Pausing a load"],
  paused: ["Forbruk pauset", "Load paused"],
  restoring: ["Kobler inn igjen", "Restoring a load"],
  limit_reached: ["Forbruket er fortsatt høyt", "Power use is still high"],
  settings_changed: ["Kontroller energioppsettet", "Check energy settings"],
  command_pending: ["Venter på enheten", "Waiting for the device"],
  command_failed: ["En handling feilet", "A device command failed"],
  unavailable: ["Måling utilgjengelig", "Reading unavailable"],
  reset_in_progress: ["Tilbakestilling pågår", "Reset in progress"],
  demo: ["Demomodus", "Demo mode"],
};
const attentionStates = new Set([
  "waiting_meter",
  "waiting_tariff",
  "stale_meter",
  "meter_unavailable",
  "load_meter_unavailable",
  "unavailable",
  "command_failed",
  "limit_reached",
  "over_target",
  "no_loads",
  "settings_changed",
  "reset_in_progress",
]);
const activeStates = new Set([
  "monitoring",
  "shedding",
  "paused",
  "restoring",
  "command_pending",
  "settling",
]);

function samePolicy(a: Policy, b: Policy) {
  return (
    a.enabled === b.enabled &&
    a.limit_kw === b.limit_kw &&
    a.devices.length === b.devices.length &&
    a.devices.every(
      (load, index) =>
        load.id === b.devices[index].id &&
        load.watts === b.devices[index].watts &&
        (load.power_entity ?? null) === (b.devices[index].power_entity ?? null),
    )
  );
}

function linkedMeter(load: Load, device: PowerGuardDevice | undefined) {
  const meterId = load.power_entity ?? device?.automatic_power_meter_id;
  return device?.power_meters?.find(({ id }) => id === meterId) ?? null;
}

export function PowerGuard({
  admin,
  lang,
  offline,
  onSetup,
}: {
  admin: boolean;
  lang: string;
  offline: boolean;
  onSetup: (section: "meter" | "tariff") => void;
}) {
  const english = lang === "en";
  const t = (nb: string, en: string) => (english ? en : nb);
  const id = useId();
  const cache = useQueryClient();
  const [open, setOpen] = useState(true);
  const [adding, setAdding] = useState(false);
  const [focusLoad, setFocusLoad] = useState<string | null>(null);
  const newLoadField = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState<{ from: string; over: string } | null>(null);
  const [editing, setEditing] = useState<{
    base: Policy;
    draft: Policy;
  } | null>(null);
  useEffect(() => {
    if (!focusLoad) return;
    newLoadField.current?.focus();
    setFocusLoad(null);
  }, [focusLoad]);
  const query = useQuery({
    queryKey: powerGuardQueryKey,
    queryFn: ({ signal }) =>
      api<PowerGuardData>(path, "GET", undefined, signal),
    enabled: !offline,
    refetchInterval: (query) =>
      !offline && (open || query.state.data?.config.enabled) ? 10_000 : false,
    staleTime: 5_000,
    retry: false,
  });
  const save = useMutation({
    mutationFn: ({ policy }: { policy: Policy; toggle?: boolean }) =>
      api<PowerGuardData>(path, "PUT", policy),
    onMutate: async () => cache.cancelQueries({ queryKey: powerGuardQueryKey }),
    onSuccess: (data, { toggle }) => {
      cache.setQueryData(powerGuardQueryKey, data);
      setEditing((current) =>
        toggle && current
          ? {
              base: { ...current.base, enabled: data.config.enabled },
              draft: { ...current.draft, enabled: data.config.enabled },
            }
          : null,
      );
    },
    onSettled: () => {
      void cache.invalidateQueries({ queryKey: powerGuardQueryKey });
    },
  });

  const data = query.data;
  const mayConfigure = admin && data?.can_edit !== false;
  const config = data?.config;
  const hour = usePowerGuardHistoryHour(
    offline || !open || !config,
    config?.enabled,
  );
  const draft = editing?.draft ?? config;
  const status = data?.status;
  const state = status?.state;
  const stateLabel = offline
    ? t("Frakoblet", "Offline")
    : state
      ? t(...(stateLabels[state] ?? stateLabels.unavailable))
      : query.isError
        ? t("Utilgjengelig", "Unavailable")
        : t("Henter status", "Loading status");
  const tone =
    offline || query.isError || (state && attentionStates.has(state))
      ? "attention"
      : state && activeStates.has(state)
        ? "active"
        : "neutral";
  const locale = english ? "en-GB" : "nb-NO";
  const percent = new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 1,
  });
  const number = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  });
  const kw = (reading: number | null | undefined) =>
    reading == null ? "—" : `${number.format(reading)} kW`;
  const tierExists = (limit: number | null | undefined) =>
    data?.tiers.some((tier) => tier.limit_kw === limit) ?? false;
  const devices = new Map(data?.devices.map((device) => [device.id, device]));
  const paused = new Set(status?.paused_ids);
  const dirty = !!(editing && config && !samePolicy(editing.draft, config));
  const conflict = !!(
    dirty &&
    editing &&
    config &&
    !samePolicy(editing.base, config)
  );
  const online = !offline && !query.isError;
  const canEnable =
    data?.configured_meter &&
    tierExists(config?.limit_kw) &&
    !!config?.devices.length &&
    config.devices.every(
      (load) =>
        devices.has(load.id) &&
        (load.watts != null || linkedMeter(load, devices.get(load.id))),
    );
  const canToggle = !!config && (config.enabled || (!dirty && canEnable));
  const canEdit = mayConfigure && online && !save.isPending && !conflict;
  const needsLoad = !!(config?.enabled && !draft?.devices.length);
  const selectable = (data?.devices ?? []).filter(
    (item) => !draft?.devices.some(({ id }) => id === item.id),
  );
  const projected = online ? status?.projected_kw : null;
  const target = config?.limit_kw;
  const margin =
    projected != null && target != null ? target - projected : null;
  const over = margin != null && margin <= 0;
  const withinLimit =
    margin != null && !over && (state === "monitoring" || state === "paused");
  const portion = projected != null && target ? projected / target : null;
  const onCount = (draft?.devices ?? []).filter(
    ({ id }) => devices.get(id)?.state === "on" && !paused.has(id),
  ).length;
  const time = status?.updated_at ? new Date(status.updated_at) : null;
  const formattedTime =
    time && Number.isFinite(time.getTime())
      ? time.toLocaleTimeString(locale, {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Europe/Oslo",
        })
      : null;

  function edit(patch: Partial<Policy>) {
    if (!config) return;
    save.reset();
    setEditing((current) => ({
      base: current?.base ?? config,
      draft: { ...(current?.draft ?? config), ...patch },
    }));
  }
  function move(from: number, to: number) {
    if (!draft || from < 0 || to < 0 || from === to) return;
    const next = [...draft.devices];
    const [load] = next.splice(from, 1);
    next.splice(to, 0, load);
    edit({ devices: next });
  }
  function editLoad(id: string, patch: Partial<Load>) {
    if (!draft) return;
    edit({
      devices: draft.devices.map((load) =>
        load.id === id ? { ...load, ...patch } : load,
      ),
    });
  }
  function savePolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !config || !dirty || !canEdit || needsLoad) return;
    if (
      draft.devices.some((load) =>
        load.watts == null
          ? !linkedMeter(load, devices.get(load.id))
          : !Number.isInteger(load.watts) ||
            load.watts < 1 ||
            load.watts > maxWatts,
      )
    )
      return;
    save.mutate({
      policy: {
        enabled: config.enabled,
        limit_kw: draft.limit_kw,
        devices: draft.devices,
      },
    });
  }

  const impactText =
    over && (state === "monitoring" || state === "over_target")
      ? t("Grensen nådd", "Limit reached")
      : withinLimit
        ? t("Under grensen", "Below the limit")
        : state === "over_target" && margin != null
          ? t("Nær grensen", "Near the limit")
          : stateLabel;
  const enabledLabel = config?.enabled ? t("Aktiv", "Active") : t("Av", "Off");

  return (
    <section className="power-guard" aria-labelledby={`${id}-heading`}>
      <header className="power-guard-header">
        <div className="power-guard-identity">
          <span className="power-guard-icon" aria-hidden="true">
            <Shield size={27} />
          </span>
          <div className="power-guard-name">
            <h3 id={`${id}-heading`}>PowerGuard</h3>
            <p>{t("Automatisk lastbalansering", "Automatic load balancing")}</p>
          </div>
        </div>
        <div className="power-guard-header-actions">
          {online && config?.enabled && formattedTime && (
            <small className="power-guard-updated">
              {t("Oppdatert", "Updated")} {formattedTime}
            </small>
          )}
          {mayConfigure && config ? (
            <button
              type="button"
              role="switch"
              aria-label={t("Aktiver PowerGuard", "Enable PowerGuard")}
              aria-checked={config.enabled}
              className="power-guard-switch"
              disabled={!online || save.isPending || !canToggle}
              onClick={() =>
                save.mutate({
                  policy: { ...config, enabled: !config.enabled },
                  toggle: true,
                })
              }
            >
              <span>{enabledLabel}</span>
              <i aria-hidden="true" />
            </button>
          ) : (
            config && (
              <span
                className="power-guard-header-status"
                data-enabled={config.enabled}
              >
                {enabledLabel}
              </span>
            )
          )}
          <button
            type="button"
            className="power-guard-collapse"
            aria-label={
              open
                ? t("Skjul PowerGuard", "Collapse PowerGuard")
                : t("Vis PowerGuard", "Expand PowerGuard")
            }
            aria-expanded={open}
            aria-controls={`${id}-body`}
            onClick={() => setOpen(!open)}
          >
            <ChevronDown size={18} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div id={`${id}-body`} hidden={!open} className="power-guard-body">
        {!data || !draft ? (
          <div className="power-guard-message">
            <p role={query.isError ? "alert" : "status"}>
              {offline
                ? t(
                    "Koble til hjemmet for å se PowerGuard.",
                    "Connect to your home to see PowerGuard.",
                  )
                : query.isError
                  ? t(
                      "Kunne ikke hente PowerGuard.",
                      "Couldn’t load PowerGuard.",
                    )
                  : t("Henter PowerGuard…", "Loading PowerGuard…")}
            </p>
            {query.isError && !offline && (
              <button
                type="button"
                disabled={query.isFetching}
                onClick={() => void query.refetch()}
              >
                {t("Prøv igjen", "Try again")}
              </button>
            )}
          </div>
        ) : (
          <form className="power-guard-form" onSubmit={savePolicy}>
            <div className="power-guard-content">
              <div className="power-guard-overview">
                <div className="power-guard-monitor">
                  <div className="power-guard-reading">
                    <span>
                      {t("Anslått timesnitt", "Estimated hourly average")}
                    </span>
                    <strong>
                      {projected == null ? "—" : number.format(projected)}{" "}
                      {projected != null && <small>kW</small>}
                    </strong>
                  </div>
                  <dl className="power-guard-stats">
                    <div>
                      <dt>{t("Effekt nå", "Power now")}</dt>
                      <dd>{kw(online ? status?.power_kw : null)}</dd>
                    </div>
                    <div>
                      <dt>{t("Grense", "Limit")}</dt>
                      <dd>{kw(target)}</dd>
                    </div>
                    <div>
                      <dt>
                        {over && margin !== 0
                          ? t("Over grensen", "Over limit")
                          : t("Margin", "Headroom")}
                      </dt>
                      <dd>{kw(margin == null ? null : Math.abs(margin))}</dd>
                    </div>
                  </dl>
                  <div className="power-guard-progress">
                    <span
                      className="power-guard-progress-track"
                      aria-hidden="true"
                      data-over={over}
                    >
                      <span
                        style={{
                          width: `${Math.min(1, Math.max(0, portion ?? 0)) * 100}%`,
                        }}
                      />
                    </span>
                    {portion != null && (
                      <small>
                        {percent.format(portion)}{" "}
                        {t("av timesmålet", "of the hourly target")}
                      </small>
                    )}
                    <span
                      className="power-guard-impact"
                      data-tone={over ? "attention" : tone}
                      role="status"
                    >
                      {withinLimit ? (
                        <Check size={16} aria-hidden="true" />
                      ) : over || tone === "attention" ? (
                        <CircleAlert size={16} aria-hidden="true" />
                      ) : null}
                      {impactText}
                    </span>
                  </div>
                </div>
                {open && (
                  <PowerGuardHistory
                    lang={lang}
                    offline={offline}
                    enabled={!!config?.enabled}
                    hour={hour}
                  />
                )}
              </div>

              <section
                className="power-guard-loads"
                aria-labelledby={`${id}-loads`}
              >
                <div className="power-guard-load-heading">
                  <h4 id={`${id}-loads`}>
                    {t("Enheter og prioritet", "Devices and priority")}
                  </h4>
                  {draft.devices.length > 0 && (
                    <div className="power-guard-counts">
                      <span
                        className="power-guard-device-state"
                        data-state="on"
                      >
                        {onCount} {t("på", "on")}
                      </span>
                      <span
                        className="power-guard-device-state"
                        data-state="paused"
                      >
                        {
                          draft.devices.filter(({ id }) => paused.has(id))
                            .length
                        }{" "}
                        {t("pauset", "paused")}
                      </span>
                    </div>
                  )}
                </div>
                {draft.devices.length > 0 ? (
                  <>
                    <p className="power-guard-note">
                      {t(
                        "1 har høyest prioritet. Laveste prioritet pauses først.",
                        "1 is the highest priority. The lowest priority pauses first.",
                      )}
                    </p>
                    <ol className="power-guard-list" role="list">
                      {draft.devices.map((load, index) => {
                        const device = devices.get(load.id);
                        const name = device?.name ?? load.id;
                        const meter = linkedMeter(load, device);
                        const meterOptions = device?.power_meters ?? [];
                        const missingMeter = !!load.power_entity && !meter;
                        const chooseMeter =
                          mayConfigure &&
                          (meterOptions.length > 1 ||
                            missingMeter ||
                            (meterOptions.length > 0 &&
                              !device?.automatic_power_meter_id));
                        const matchedMeter =
                          meter?.id === device?.power_meter?.id;
                        const measured =
                          meter && matchedMeter && online
                            ? device?.power_watts
                            : null;
                        const beforePause =
                          online && paused.has(load.id)
                            ? device?.paused_watts
                            : null;
                        const wattsLabel = meter
                          ? t("Reserveeffekt", "Fallback power")
                          : t("Maks effekt", "Max power");
                        const powerState = paused.has(load.id)
                          ? "paused"
                          : device?.state === "on" || device?.state === "off"
                            ? device.state
                            : "unavailable";
                        const loadState = {
                          paused: t("Pauset", "Paused"),
                          on: t("På", "On"),
                          off: t("Av", "Off"),
                          unavailable: t("Utilgjengelig", "Unavailable"),
                        }[powerState];
                        const firstToPause =
                          draft.devices.length > 1 &&
                          index === draft.devices.length - 1;
                        const rank =
                          index === 0
                            ? t("Høyeste prioritet", "Highest priority")
                            : firstToPause
                              ? t("Laveste prioritet", "Lowest priority")
                              : null;
                        const details = [rank, device?.room]
                          .filter(Boolean)
                          .join(" · ");
                        const Icon = powerGuardDeviceIcon(device);
                        return (
                          <li
                            key={load.id}
                            className="power-guard-load"
                            data-paused={powerState === "paused"}
                            data-drop={
                              !!(
                                drag?.over === load.id && drag.from !== load.id
                              )
                            }
                            onDragOver={(event) => {
                              if (!canEdit || !drag || drag.from === load.id)
                                return;
                              event.preventDefault();
                              event.dataTransfer.dropEffect = "move";
                              if (drag.over !== load.id)
                                setDrag({ ...drag, over: load.id });
                            }}
                            onDrop={(event) => {
                              if (!canEdit || !drag) return;
                              event.preventDefault();
                              move(
                                draft.devices.findIndex(
                                  ({ id }) => id === drag.from,
                                ),
                                index,
                              );
                              setDrag(null);
                            }}
                          >
                            <span
                              className="power-guard-position"
                              aria-hidden="true"
                            >
                              {canEdit && draft.devices.length > 1 && (
                                <span
                                  className="power-guard-grip"
                                  draggable
                                  title={t(
                                    "Dra for å endre prioritet",
                                    "Drag to change priority",
                                  )}
                                  onDragStart={(event) => {
                                    event.dataTransfer.setData(
                                      "text/plain",
                                      load.id,
                                    );
                                    event.dataTransfer.effectAllowed = "move";
                                    setDrag({ from: load.id, over: load.id });
                                  }}
                                  onDragEnd={() => setDrag(null)}
                                >
                                  <GripVertical size={19} />
                                </span>
                              )}
                              <span className="power-guard-priority">
                                {index + 1}
                              </span>
                            </span>
                            <span
                              className="power-guard-load-icon"
                              aria-hidden="true"
                            >
                              <Icon size={22} />
                            </span>
                            <div className="power-guard-device">
                              <strong>{name}</strong>
                              {details && <small>{details}</small>}
                              {firstToPause && (
                                <span className="power-guard-pause-first">
                                  {t("Pauses først", "Pauses first")}
                                </span>
                              )}
                            </div>
                            <span
                              className="power-guard-device-state"
                              data-state={powerState}
                            >
                              {loadState}
                            </span>
                            <div className="power-guard-load-meta">
                              {(meter || beforePause != null) && (
                                <div className="power-guard-load-reading">
                                  {meter && matchedMeter && online && (
                                    <PowerGuardLoadTrend
                                      id={load.id}
                                      history={hour.data}
                                    />
                                  )}
                                  {meter && (
                                    <span>
                                      <small>
                                        {t("Målt nå", "Measured now")}
                                      </small>
                                      <strong>
                                        {measured == null
                                          ? "—"
                                          : kw(measured / 1000)}
                                      </strong>
                                    </span>
                                  )}
                                  {beforePause != null && (
                                    <span>
                                      <small>
                                        {t("Før pause", "Before pause")}
                                      </small>
                                      <strong>{kw(beforePause / 1000)}</strong>
                                    </span>
                                  )}
                                </div>
                              )}
                              {chooseMeter ? (
                                <label className="power-guard-load-meter">
                                  <span>{t("Effektmåler", "Power meter")}</span>
                                  <select
                                    aria-label={`${t("Effektmåler for", "Power meter for")} ${name}`}
                                    value={load.power_entity ?? ""}
                                    disabled={!canEdit}
                                    onChange={({ target }) =>
                                      editLoad(load.id, {
                                        power_entity: target.value || null,
                                      })
                                    }
                                  >
                                    <option value="">
                                      {device?.automatic_power_meter_id
                                        ? t("Automatisk", "Automatic")
                                        : t(
                                            "Manuelt anslag",
                                            "Manual estimate",
                                          )}
                                    </option>
                                    {missingMeter && (
                                      <option
                                        value={load.power_entity ?? ""}
                                        disabled
                                      >
                                        {t(
                                          "Tidligere måler utilgjengelig",
                                          "Previous meter unavailable",
                                        )}
                                      </option>
                                    )}
                                    {meterOptions.map((option) => (
                                      <option key={option.id} value={option.id}>
                                        {option.name}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              ) : (
                                meter && (
                                  <div className="power-guard-load-meter">
                                    <span>
                                      {t("Effektmåler", "Power meter")}
                                    </span>
                                    <strong>{meter.name}</strong>
                                  </div>
                                )
                              )}
                              {mayConfigure ? (
                                <label className="power-guard-watts">
                                  <span>{wattsLabel}</span>
                                  <span className="power-guard-watts-field">
                                    <input
                                      ref={
                                        focusLoad === load.id
                                          ? newLoadField
                                          : undefined
                                      }
                                      type="number"
                                      inputMode="decimal"
                                      lang={locale}
                                      min={0.001}
                                      max={maxWatts / 1000}
                                      step={0.001}
                                      required={!meter}
                                      disabled={!canEdit}
                                      value={
                                        load.watts == null
                                          ? ""
                                          : load.watts / 1000
                                      }
                                      placeholder={meter ? "—" : undefined}
                                      aria-label={`${wattsLabel} ${t("i kilowatt for", "in kilowatts for")} ${name}`}
                                      onChange={({ target }) =>
                                        editLoad(load.id, {
                                          watts: Number.isFinite(
                                            target.valueAsNumber,
                                          )
                                            ? Math.round(
                                                target.valueAsNumber * 1000,
                                              )
                                            : null,
                                        })
                                      }
                                    />
                                    <small aria-hidden="true">kW</small>
                                  </span>
                                </label>
                              ) : (
                                load.watts != null && (
                                  <div className="power-guard-watts">
                                    <span>{wattsLabel}</span>
                                    <strong>{kw(load.watts / 1000)}</strong>
                                  </div>
                                )
                              )}
                            </div>
                            {mayConfigure && (
                              <div className="power-guard-order">
                                <button
                                  type="button"
                                  disabled={!canEdit || index === 0}
                                  aria-label={`${t("Flytt opp", "Move up")} ${name}`}
                                  onClick={() => move(index, index - 1)}
                                >
                                  <ArrowUp size={15} aria-hidden="true" />
                                </button>
                                <button
                                  type="button"
                                  disabled={
                                    !canEdit ||
                                    index === draft.devices.length - 1
                                  }
                                  aria-label={`${t("Flytt ned", "Move down")} ${name}`}
                                  onClick={() => move(index, index + 1)}
                                >
                                  <ArrowDown size={15} aria-hidden="true" />
                                </button>
                                <button
                                  type="button"
                                  disabled={!canEdit}
                                  aria-label={`${t("Fjern", "Remove")} ${name}`}
                                  onClick={() =>
                                    edit({
                                      devices: draft.devices.filter(
                                        ({ id }) => id !== load.id,
                                      ),
                                    })
                                  }
                                >
                                  <X size={15} aria-hidden="true" />
                                </button>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  </>
                ) : (
                  <div className="power-guard-empty">
                    <Plug size={22} aria-hidden="true" />
                    <p>
                      {mayConfigure
                        ? t(
                            "Legg til en bryter eller termostat som PowerGuard kan sette på pause.",
                            "Add a switch or thermostat that PowerGuard can pause.",
                          )
                        : t(
                            "Ingen enheter er lagt til ennå.",
                            "No devices have been added yet.",
                          )}
                    </p>
                  </div>
                )}
                {mayConfigure &&
                  selectable.length > 0 &&
                  draft.devices.length < maxLoads && (
                    <button
                      type="button"
                      className="power-guard-add-button"
                      aria-haspopup="dialog"
                      disabled={!canEdit}
                      onClick={() => setAdding(true)}
                    >
                      <Plus size={20} aria-hidden="true" />
                      {t("Legg til enhet", "Add a device")}
                    </button>
                  )}
                {mayConfigure && !data.devices.length && (
                  <p className="power-guard-note">
                    {t(
                      "Ingen støttede enheter er tilgjengelige.",
                      "No supported devices are available.",
                    )}
                  </p>
                )}
                {mayConfigure && dirty && draft.devices.length > 0 && (
                  <p className="power-guard-note">
                    {t(
                      "Velg enheter som tåler automatisk av og på. Oppgi høyeste forventede effekt for enheter uten måler.",
                      "Choose devices that can safely switch off and on. Enter the maximum expected power for devices without a meter.",
                    )}
                  </p>
                )}
              </section>
            </div>

            <div className="power-guard-notices">
              {!online && (
                <p role="status">
                  {t(
                    "Viser sist hentede oppsett. Koble til hjemmet for å gjøre endringer.",
                    "Showing the last known settings. Reconnect to make changes.",
                  )}
                </p>
              )}
              {state === "demo" && (
                <p>
                  {t(
                    "Demomodus. Du kan prøve oppsettet uten at enheter styres.",
                    "Demo mode. You can try the settings without controlling devices.",
                  )}
                </p>
              )}
              {config?.enabled &&
                [
                  "waiting_meter",
                  "stale_meter",
                  "meter_unavailable",
                  "unavailable",
                ].includes(state ?? "") && (
                  <p>
                    {t(
                      "Styringen venter på ferske målinger før den gjenopptas.",
                      "Control will resume when fresh readings are available.",
                    )}
                  </p>
                )}
              {state === "settings_changed" && mayConfigure && (
                <p>
                  {t(
                    "Måleren eller nettleieoppsettet er endret. Kontroller oppsettet før du aktiverer PowerGuard på nytt.",
                    "The meter or grid settings changed. Check them before enabling PowerGuard again.",
                  )}
                </p>
              )}
              {paused.size > 0 && mayConfigure && (
                <p>
                  {t(
                    "Ved deaktivering kan du selv slå på enhetene som er pauset.",
                    "After switching PowerGuard off, you can turn paused devices back on manually.",
                  )}
                </p>
              )}
              {status?.last_action && (
                <p>
                  {status.last_action.command === "turn_on"
                    ? t("Sist koblet inn", "Last restored")
                    : t("Sist pauset", "Last paused")}
                  {" · "}
                  {devices.get(status.last_action.id)?.name ??
                    status.last_action.id}
                </p>
              )}
              {needsLoad && (
                <p role="status">
                  {t(
                    "Slå av PowerGuard før du fjerner den siste enheten.",
                    "Switch PowerGuard off before removing the last device.",
                  )}
                </p>
              )}
              {conflict && (
                <p role="alert">
                  {t(
                    "Oppsettet er endret et annet sted. Hent gjeldende oppsett før du redigerer videre.",
                    "Settings changed elsewhere. Load the current settings before continuing.",
                  )}
                </p>
              )}
              {save.isError && (
                <p role="alert">
                  {save.error instanceof ApiError &&
                  [409, 422].includes(save.error.status)
                    ? t(
                        "Kontroller hovedmåler, kapasitetstrinn og at hver enhet har egen måler eller oppgitt effekt.",
                        "Check the main meter, capacity tier and whether each device has its own meter or an entered power value.",
                      )
                    : t(
                        "Kunne ikke lagre PowerGuard. Prøv igjen.",
                        "Couldn’t save PowerGuard. Try again.",
                      )}
                </p>
              )}
            </div>

            <footer className="power-guard-settings">
              <div className="power-guard-settings-title">
                <h4>{t("Måler og grense", "Meter and limit")}</h4>
                {data.company && <small>{data.company}</small>}
              </div>
              <div className="power-guard-meter">
                <span id={`${id}-meter-label`}>
                  {t("Hovedmåler", "Main meter")}
                </span>
                {mayConfigure ? (
                  <button
                    type="button"
                    className="power-guard-meter-button"
                    aria-labelledby={`${id}-meter-label ${id}-meter-value`}
                    aria-haspopup="dialog"
                    disabled={!online}
                    onClick={() => onSetup("meter")}
                  >
                    <span id={`${id}-meter-value`}>
                      {data.meter?.name ??
                        t("Velg hovedmåler", "Select the main meter")}
                    </span>
                    <SlidersHorizontal size={16} aria-hidden="true" />
                  </button>
                ) : (
                  <span className="power-guard-meter-value">
                    {data.meter?.name ?? "—"}
                  </span>
                )}
              </div>
              <div className="power-guard-target">
                <span>{t("Kapasitetstrinn", "Capacity tier")}</span>
                {mayConfigure && data.tiers.length > 0 ? (
                  <select
                    aria-label={t(
                      "Velg kapasitetstrinn",
                      "Choose a capacity tier",
                    )}
                    disabled={!canEdit}
                    required={config?.enabled}
                    value={draft.limit_kw ?? ""}
                    onChange={(event) =>
                      edit({
                        limit_kw: event.target.value
                          ? Number(event.target.value)
                          : null,
                      })
                    }
                  >
                    <option value="">
                      {t("Velg et trinn", "Select a tier")}
                    </option>
                    {draft.limit_kw != null && !tierExists(draft.limit_kw) && (
                      <option value={draft.limit_kw} disabled>
                        {t("Tidligere grense", "Previous limit")} ·{" "}
                        {kw(draft.limit_kw)}
                      </option>
                    )}
                    {data.tiers.map((tier) => (
                      <option key={tier.limit_kw} value={tier.limit_kw}>
                        {tier.label}
                      </option>
                    ))}
                  </select>
                ) : !data.tiers.length && mayConfigure ? (
                  <button
                    type="button"
                    className="power-guard-meter-button"
                    disabled={!online}
                    onClick={() => onSetup("tariff")}
                  >
                    <span>
                      {t("Åpne nettleieoppsettet", "Open grid settings")}
                    </span>
                    <SlidersHorizontal size={16} aria-hidden="true" />
                  </button>
                ) : (
                  <span className="power-guard-meter-value">
                    {data.tiers.find(
                      ({ limit_kw }) => limit_kw === draft.limit_kw,
                    )?.label ?? kw(draft.limit_kw)}
                  </span>
                )}
              </div>
              {mayConfigure && (
                <div className="power-guard-actions">
                  {dirty && (
                    <button
                      type="button"
                      disabled={save.isPending}
                      onClick={() => {
                        setEditing(null);
                        setAdding(false);
                        save.reset();
                      }}
                    >
                      {conflict
                        ? t("Vis gjeldende oppsett", "Load current settings")
                        : t("Forkast", "Discard")}
                    </button>
                  )}
                  <button
                    className="power-guard-save"
                    type="submit"
                    disabled={!dirty || !canEdit || needsLoad}
                  >
                    {save.isPending
                      ? t("Lagrer…", "Saving…")
                      : t("Lagre innstillinger", "Save settings")}
                  </button>
                </div>
              )}
            </footer>
          </form>
        )}
      </div>
      {adding && draft && mayConfigure && (
        <PowerGuardDevicePicker
          lang={lang}
          devices={selectable}
          remainingSlots={maxLoads - draft.devices.length}
          disabled={!canEdit}
          onClose={() => setAdding(false)}
          onAdd={(ids) => {
            if (!canEdit || draft.devices.length + ids.length > maxLoads)
              return;
            edit({
              devices: [
                ...draft.devices,
                ...ids.map((id) => ({ id, watts: null })),
              ],
            });
            setAdding(false);
            setFocusLoad(
              ids.find((id) => !devices.get(id)?.automatic_power_meter_id) ??
                null,
            );
          }}
        />
      )}
    </section>
  );
}

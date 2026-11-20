import { type FormEvent, useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ChevronDown, Shield, X } from "lucide-react";
import { ApiError, api } from "../api";
import "./powerGuard.css";

type Load = { id: string; watts: number };
type Policy = { enabled: boolean; limit_kw: number | null; devices: Load[] };
type Draft = Omit<Policy, "devices"> & {
  devices: { id: string; watts: number | null }[];
};
type PowerGuardData = {
  can_edit?: boolean;
  configured_meter: boolean;
  meter: { id: string; name: string } | null;
  company: string | null;
  tiers: { label: string; limit_kw: number }[];
  devices: {
    id: string;
    name: string;
    room: string | null;
    kind: "switch" | "climate";
    state: string;
  }[];
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

function samePolicy(a: Draft, b: Policy) {
  return (
    a.enabled === b.enabled &&
    a.limit_kw === b.limit_kw &&
    a.devices.length === b.devices.length &&
    a.devices.every(
      (load, index) =>
        load.id === b.devices[index].id &&
        load.watts === b.devices[index].watts,
    )
  );
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
  onSetup: () => void;
}) {
  const english = lang === "en";
  const t = (nb: string, en: string) => (english ? en : nb);
  const id = useId();
  const cache = useQueryClient();
  const [open, setOpen] = useState(false);
  const [candidate, setCandidate] = useState("");
  const [editing, setEditing] = useState<{ base: Policy; draft: Draft } | null>(
    null,
  );
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
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
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
    config.devices.every(({ id }) => devices.has(id));
  const canToggle = !!config && (config.enabled || (!dirty && canEnable));
  const canEdit = mayConfigure && online && !save.isPending && !conflict;
  const needsLoad = !!(config?.enabled && !draft?.devices.length);
  const selectable = (data?.devices ?? []).filter(
    (item) => !draft?.devices.some(({ id }) => id === item.id),
  );
  const tierLabel = data?.tiers.find(
    (tier) => tier.limit_kw === config?.limit_kw,
  )?.label;
  const projected = status?.projected_kw;
  const target = config?.limit_kw;
  const scale = Math.max(projected ?? 0, target ?? 0) * 1.12;
  const canPlot = projected != null && target != null && scale > 0;
  const time = status?.updated_at ? new Date(status.updated_at) : null;
  const formattedTime =
    time && Number.isFinite(time.getTime())
      ? time.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })
      : null;

  function edit(patch: Partial<Draft>) {
    if (!config) return;
    save.reset();
    setEditing((current) => ({
      base: current?.base ?? config,
      draft: { ...(current?.draft ?? config), ...patch },
    }));
  }
  function move(index: number, offset: number) {
    if (!draft) return;
    const next = [...draft.devices];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    edit({ devices: next });
  }
  function savePolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !config || !dirty || !canEdit || needsLoad) return;
    const loads = draft.devices.flatMap(({ id, watts }) =>
      watts != null &&
      Number.isInteger(watts) &&
      watts >= 1 &&
      watts <= maxWatts
        ? [{ id, watts }]
        : [],
    );
    if (loads.length !== draft.devices.length) return;
    save.mutate({
      policy: {
        enabled: config.enabled,
        limit_kw: draft.limit_kw,
        devices: loads,
      },
    });
  }

  return (
    <section className="power-guard" aria-label="PowerGuard">
      <button
        type="button"
        className="power-guard-summary"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <span className="power-guard-icon">
          <Shield size={22} aria-hidden="true" />
        </span>
        <span className="power-guard-name">
          <strong>PowerGuard</strong>
          <span>
            {t("Automatisk lastbalansering", "Automatic load balancing")}
          </span>
        </span>
        <span className="power-guard-status" data-tone={tone}>
          {stateLabel}
        </span>
        <ChevronDown
          size={18}
          className="power-guard-chevron"
          aria-hidden="true"
        />
      </button>
      <div id={id} hidden={!open} className="power-guard-body">
        {!data ? (
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
          <>
            <div className="power-guard-control">
              <div>
                <p>
                  {t(
                    "PowerGuard bruker hovedmåleren til å begrense topper i timeforbruket.",
                    "PowerGuard uses the main meter to reduce peaks in hourly power use.",
                  )}
                </p>
                <small>
                  {t(
                    "Styringen reduserer risikoen for et dyrere kapasitetstrinn. Nettselskapet fastsetter trinnet på fakturaen.",
                    "Load balancing reduces the risk of a higher capacity tier. Your grid company determines the billed tier.",
                  )}
                </small>
              </div>
              {mayConfigure && config && (
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
                  <span>{config.enabled ? t("På", "On") : t("Av", "Off")}</span>
                  <i aria-hidden="true" />
                </button>
              )}
            </div>
            {!online && (
              <p role="status" className="power-guard-note">
                {t(
                  "Viser sist hentede status. Koble til på nytt for å gjøre endringer.",
                  "Showing the last known status. Reconnect to make changes.",
                )}
              </p>
            )}
            <div className="power-guard-monitor">
              <dl>
                <div>
                  <dt>{t("Effekt nå", "Power now")}</dt>
                  <dd>{kw(status?.power_kw)}</dd>
                </div>
                <div>
                  <dt>{t("Anslått timesnitt", "Estimated hourly average")}</dt>
                  <dd>{kw(projected)}</dd>
                </div>
                <div>
                  <dt>{t("Valgt kapasitetstrinn", "Target capacity tier")}</dt>
                  <dd>{tierLabel ?? kw(target)}</dd>
                </div>
              </dl>
              {canPlot && (
                <div
                  className="power-guard-track"
                  data-over={projected >= target}
                  aria-hidden="true"
                >
                  <i style={{ width: `${(projected / scale) * 100}%` }} />
                  <span style={{ left: `${(target / scale) * 100}%` }} />
                </div>
              )}
              <div className="power-guard-meter">
                <span>
                  {data.meter?.name ??
                    t("Hovedmåler mangler", "Main meter is missing")}
                </span>
                {formattedTime && (
                  <span>
                    {t("Oppdatert", "Updated")} {formattedTime}
                  </span>
                )}
              </div>
            </div>
            {state === "demo" && (
              <p className="power-guard-note">
                {t(
                  "Dette er en demo. Du kan prøve oppsettet uten at enheter styres.",
                  "This is a demo. You can try the settings without controlling any devices.",
                )}
              </p>
            )}
            {state &&
              [
                "waiting_meter",
                "stale_meter",
                "meter_unavailable",
                "unavailable",
              ].includes(state) &&
              config?.enabled && (
                <p className="power-guard-note">
                  {t(
                    "Styringen venter på ferske målinger. Enheter PowerGuard allerede har pauset, kan kobles inn igjen når målingene kommer tilbake.",
                    "Control is waiting for fresh readings. PowerGuard can restore loads it already paused once readings return.",
                  )}
                </p>
              )}
            {paused.size > 0 && (
              <p className="power-guard-note">
                {t(
                  "Slår du av PowerGuard, kan du selv slå på enhetene som er pauset.",
                  "If you switch PowerGuard off, you can turn paused devices back on manually.",
                )}
              </p>
            )}
            {state === "settings_changed" && mayConfigure && (
              <p className="power-guard-note">
                {t(
                  "Måleren eller nettleieoppsettet er endret. Kontroller oppsettet før du aktiverer PowerGuard på nytt.",
                  "The meter or grid settings changed. Check them before enabling PowerGuard again.",
                )}
              </p>
            )}
            {status?.last_action && (
              <p className="power-guard-note">
                {["on", "turn_on", "restore"].includes(
                  status.last_action.command,
                )
                  ? t("Sist koblet inn", "Last restored")
                  : t("Sist pauset", "Last paused")}
                {" · "}
                {devices.get(status.last_action.id)?.name ??
                  status.last_action.id}
              </p>
            )}
            {mayConfigure &&
              (!data.configured_meter ||
                !data.tiers.length ||
                state === "settings_changed") && (
                <button type="button" disabled={!online} onClick={onSetup}>
                  {data.configured_meter
                    ? t("Åpne energioppsettet", "Open energy settings")
                    : t("Velg hovedmåler", "Select the main meter")}
                </button>
              )}
            {save.isError && (
              <p role="alert" className="power-guard-error">
                {save.error instanceof ApiError && save.error.status === 409
                  ? t(
                      "Oppsettet kan ha endret seg. Kontroller måleren, trinnet og enhetslisten.",
                      "Settings may have changed. Check the meter, tier and device list.",
                    )
                  : t(
                      "Kunne ikke lagre PowerGuard. Prøv igjen.",
                      "Couldn’t save PowerGuard. Try again.",
                    )}
              </p>
            )}
            {mayConfigure && draft && (
              <form className="power-guard-form" onSubmit={savePolicy}>
                <div className="power-guard-target">
                  <label htmlFor={`${id}-tier`}>
                    {t("Velg kapasitetstrinn", "Choose a capacity tier")}
                  </label>
                  {data.company && <small>{data.company}</small>}
                  <select
                    id={`${id}-tier`}
                    disabled={!canEdit || !data.tiers.length}
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
                  {!data.tiers.length && (
                    <p className="power-guard-note">
                      {t(
                        "Kapasitetstrinn er ikke tilgjengelig for denne nettleieavtalen.",
                        "Capacity tiers are unavailable for this grid agreement.",
                      )}
                    </p>
                  )}
                </div>
                <div className="power-guard-loads">
                  <h3>{t("Enheter og prioritet", "Devices and priority")}</h3>
                  <p className="power-guard-note">
                    {t(
                      "Nr. 1 har høyest prioritet. PowerGuard pauser de nederste enhetene først.",
                      "No. 1 has the highest priority. PowerGuard pauses the lowest items first.",
                    )}
                  </p>
                  <ol role="list">
                    {draft.devices.map((load, index) => {
                      const device = devices.get(load.id);
                      const name = device?.name ?? load.id;
                      const loadState = paused.has(load.id)
                        ? t("Pauset av PowerGuard", "Paused by PowerGuard")
                        : device?.state === "on"
                          ? t("På", "On")
                          : device?.state === "off"
                            ? t("Av", "Off")
                            : t("Utilgjengelig", "Unavailable");
                      return (
                        <li key={load.id} data-paused={paused.has(load.id)}>
                          <span
                            className="power-guard-priority"
                            aria-hidden="true"
                          >
                            {index + 1}
                          </span>
                          <div className="power-guard-device">
                            <strong>{name}</strong>
                            <small>
                              {device?.room ? `${device.room} · ` : ""}
                              {loadState}
                            </small>
                          </div>
                          <label className="power-guard-watts">
                            <span>{t("Maks effekt (W)", "Max power (W)")}</span>
                            <input
                              type="number"
                              inputMode="numeric"
                              min={1}
                              max={maxWatts}
                              step={1}
                              required
                              disabled={!canEdit}
                              value={load.watts ?? ""}
                              aria-label={`${t("Maks effekt i watt for", "Maximum watts for")} ${name}`}
                              onChange={({ target }) =>
                                edit({
                                  devices: draft.devices.map((current) =>
                                    current.id === load.id
                                      ? {
                                          ...current,
                                          watts: Number.isFinite(
                                            target.valueAsNumber,
                                          )
                                            ? target.valueAsNumber
                                            : null,
                                        }
                                      : current,
                                  ),
                                })
                              }
                            />
                          </label>
                          <div className="power-guard-order">
                            <button
                              type="button"
                              disabled={!canEdit || index === 0}
                              aria-label={`${t("Flytt opp", "Move up")} ${name}`}
                              onClick={() => move(index, -1)}
                            >
                              <ArrowUp size={17} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              disabled={
                                !canEdit || index === draft.devices.length - 1
                              }
                              aria-label={`${t("Flytt ned", "Move down")} ${name}`}
                              onClick={() => move(index, 1)}
                            >
                              <ArrowDown size={17} aria-hidden="true" />
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
                              <X size={17} aria-hidden="true" />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                  {selectable.length > 0 && draft.devices.length < maxLoads && (
                    <div className="power-guard-add">
                      <label htmlFor={`${id}-device`}>
                        {t("Velg enhet", "Select a device")}
                      </label>
                      <select
                        id={`${id}-device`}
                        disabled={!canEdit}
                        value={candidate}
                        onChange={(event) => setCandidate(event.target.value)}
                      >
                        <option value="">
                          {t(
                            "Velg bryter eller termostat…",
                            "Select a switch or thermostat…",
                          )}
                        </option>
                        {selectable.map(({ id, name, room, kind }) => (
                          <option key={id} value={id}>
                            {name}
                            {room
                              ? ` · ${room}`
                              : kind === "climate"
                                ? ` · ${t("Termostat", "Thermostat")}`
                                : ""}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={
                          !canEdit ||
                          !selectable.some(({ id }) => id === candidate)
                        }
                        onClick={() => {
                          edit({
                            devices: [
                              ...draft.devices,
                              { id: candidate, watts: null },
                            ],
                          });
                          setCandidate("");
                        }}
                      >
                        {t("Legg til", "Add")}
                      </button>
                    </div>
                  )}
                  {!data.devices.length && (
                    <p className="power-guard-note">
                      {t(
                        "Ingen støttede brytere eller termostater er tilgjengelige.",
                        "No supported switches or thermostats are available.",
                      )}
                    </p>
                  )}
                  {draft.devices.length >= maxLoads && (
                    <p className="power-guard-note">
                      {t(
                        "Du har lagt til 20 enheter.",
                        "You’ve added 20 devices.",
                      )}
                    </p>
                  )}
                  <p className="power-guard-note">
                    {t(
                      "Velg enheter som tåler automatisk av og på. Oppgi høyeste forventede effekt for trygg gjeninnkobling.",
                      "Choose devices that can safely switch off and on automatically. Enter the maximum expected power for restoration.",
                    )}
                  </p>
                </div>
                <div className="power-guard-actions">
                  {needsLoad && (
                    <p role="status" className="power-guard-note">
                      {t(
                        "Slå av PowerGuard før du fjerner den siste enheten.",
                        "Switch PowerGuard off before removing the last device.",
                      )}
                    </p>
                  )}
                  {conflict && (
                    <p role="alert">
                      {t(
                        "Oppsettet er endret et annet sted. Hent det gjeldende oppsettet før du redigerer videre.",
                        "Settings changed elsewhere. Load the current settings before continuing.",
                      )}
                    </p>
                  )}
                  {!config?.enabled && !canEnable && !dirty && (
                    <p className="power-guard-note">
                      {t(
                        "Velg hovedmåler, kapasitetstrinn og minst én enhet før du aktiverer PowerGuard.",
                        "Select a main meter, a capacity tier and at least one device before enabling PowerGuard.",
                      )}
                    </p>
                  )}
                  {dirty && (
                    <button
                      type="button"
                      disabled={save.isPending}
                      onClick={() => {
                        setEditing(null);
                        save.reset();
                      }}
                    >
                      {conflict
                        ? t("Vis gjeldende oppsett", "Load current settings")
                        : t("Forkast endringer", "Discard changes")}
                    </button>
                  )}
                  <button
                    className="power-guard-save"
                    type="submit"
                    disabled={!dirty || !canEdit || needsLoad}
                  >
                    {save.isPending
                      ? t("Lagrer…", "Saving…")
                      : t("Lagre oppsett", "Save settings")}
                  </button>
                </div>
              </form>
            )}
            {!mayConfigure && paused.size > 0 && (
              <p className="power-guard-note">
                {t("Pauset av PowerGuard", "Paused by PowerGuard")} ·{" "}
                {[...paused]
                  .map((id) => devices.get(id)?.name ?? id)
                  .join(", ")}
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

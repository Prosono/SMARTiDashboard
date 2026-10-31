import {
  Fragment,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Battery,
  Blinds,
  ChevronRight,
  Droplets,
  Fan,
  House,
  LoaderCircle,
  LockKeyhole,
  Pause,
  Play,
  Plug,
  ShieldCheck,
  Sparkles,
  Square,
  Sun,
  Thermometer,
  UnlockKeyhole,
  Volume2,
  WifiOff,
  TriangleAlert,
} from "lucide-react";
import { api } from "../api";
import { controlState } from "../controlState";
import { lightIcon } from "../LightAppearance";
import { mediaIcon } from "../MediaIcons";
import { Thermostat } from "../Thermostat";
import type { Capability, Control, Home } from "../types";
import { MetricDeviceRenderer } from "./MetricDetails";
import { InSettingsDialog, SettingsDialog } from "./SettingsDialog";
import { numeric, reading, usable } from "./homeModel";
import { RobotVacuumIcon } from "./RobotVacuumIcon";
import { TemperatureValue } from "./TemperatureValue";
import { EquipmentArtwork } from "./EquipmentArtwork";
import { EquipmentColorControls } from "./EquipmentColorControls";
import { CardIcon, CardTitle } from "./CardPresentation";
import {
  deviceBattery,
  deviceReading,
  equipmentArt,
  finiteReading,
  lightColor,
  lightPercentage,
  securityAttention,
} from "./equipmentModel";

const number = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const requiresConfirmation = new Set([
  "lock",
  "unlock",
  "open_cover",
  "close_cover",
  "activate",
]);
function feature(c: Control) {
  if (c.domain === "light") return "lights";
  if (["climate", "fan"].includes(c.domain)) return "climate";
  if (
    ["lock", "cover", "alarm_control_panel", "binary_sensor"].includes(c.domain)
  )
    return "security";
  if (c.domain === "media_player") return "media";
  if (c.domain === "vacuum") return "cleaning";
  if (["scene", "script", "automation"].includes(c.domain)) return "scenes";
  return "other";
}
function deviceAppearance(c: Control) {
  const dc = c.attributes.device_class;
  if (c.domain === "sensor" && dc === "battery")
    return { Icon: Battery, tone: "energy" };
  if (c.domain === "light") return { Icon: lightIcon(c), tone: "light" };
  if (c.domain === "climate" || dc === "temperature")
    return { Icon: Thermometer, tone: "climate" };
  if (dc === "humidity" || dc === "moisture")
    return { Icon: Droplets, tone: "air" };
  if (c.domain === "fan") return { Icon: Fan, tone: "air" };
  if (c.domain === "switch") return { Icon: Plug, tone: "energy" };
  if (c.domain === "lock")
    return {
      Icon: c.state === "locked" ? LockKeyhole : UnlockKeyhole,
      tone: "security",
    };
  if (c.domain === "cover") return { Icon: Blinds, tone: "shade" };
  if (c.domain === "media_player") return { Icon: mediaIcon(c), tone: "media" };
  if (c.domain === "vacuum") return { Icon: RobotVacuumIcon, tone: "cleaning" };
  if (["scene", "script"].includes(c.domain))
    return { Icon: Sparkles, tone: "light" };
  if (["power", "energy"].includes(String(dc)))
    return { Icon: Plug, tone: "energy" };
  if (["binary_sensor", "alarm_control_panel"].includes(c.domain))
    return { Icon: ShieldCheck, tone: "security" };
  return { Icon: Activity, tone: "neutral" };
}

/** Commit once on release or a keyboard step; dragging never floods the hub. */
function DeviceRange({
  label,
  displayLabel,
  value,
  capability,
  disabled,
  change,
  Icon = Sun,
}: {
  label: string;
  displayLabel: string;
  value: number | null;
  capability: Capability;
  disabled: boolean;
  change: (value: number) => void;
  Icon?: typeof Sun;
}) {
  const [draft, setDraft] = useState(value ?? capability.minimum ?? 0);
  useEffect(
    () => setDraft(value ?? capability.minimum ?? 0),
    [value, capability.minimum],
  );
  const min = capability.minimum ?? 0,
    max = capability.maximum ?? 100;
  const valid = max > min && (capability.step ?? 1) > 0;
  const commit = () => {
    if (valid && !disabled) change(draft);
  };
  return (
    <label
      className="harmony-range"
      style={
        {
          "--level": `${valid ? Math.max(0, Math.min(100, ((draft - min) / (max - min)) * 100)) : 0}%`,
        } as CSSProperties
      }
    >
      <span>
        <Icon size={16} />
        <span>{displayLabel}</span>
        <strong>
          {value === null
            ? "—"
            : `${Math.round(draft)}${capability.unit || "%"}`}
        </strong>
      </span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={capability.step || 1}
        value={Math.max(min, Math.min(max, draft))}
        disabled={disabled || !valid || value === null}
        onChange={(e) => setDraft(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={(e) => {
          if (
            [
              "ArrowLeft",
              "ArrowRight",
              "ArrowUp",
              "ArrowDown",
              "Home",
              "End",
              "PageUp",
              "PageDown",
            ].includes(e.key)
          )
            commit();
        }}
      />
    </label>
  );
}

function HarmonyDevice({
  c,
  home,
  lang,
  offline,
  open,
}: {
  c: Control;
  home: Home;
  lang: string;
  offline: boolean;
  open: () => void;
}) {
  const en = lang === "en",
    t = (nb: string, english: string) => (en ? english : nb);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [confirmation, confirm] = useState<{
    action: string;
    label: string;
  } | null>(null);
  const pending = useRef(false);
  const actions = c.capabilities.flatMap((cap) => cap.actions);
  const available = !offline && home.connected && usable(c);
  const canControl =
    !home.permissions || home.permissions.includes(`${feature(c)}.control`);
  const disabled = !available || !canControl || busy;
  const on =
    available &&
    ["on", "playing", "cleaning", "heat", "cool", "auto"].includes(c.state);
  const { Icon, tone } = deviceAppearance(c);
  const room =
    home.areas.find((a) => a.area_id === c.area_id)?.name ||
    t("Uten rom", "No room");
  const state = !available
    ? offline || !home.connected
      ? t("Frakoblet", "Disconnected")
      : controlState(
          c,
          c.availability === "unknown" || c.state === "unknown"
            ? "unknown"
            : "unavailable",
          lang,
        )
    : c.domain === "sensor"
      ? t("Siste måling", "Latest reading")
      : c.domain === "climate"
        ? (
            {
              heat: t("Varme", "Heat"),
              cool: t("Kjøling", "Cooling"),
              auto: "Auto",
              off: t("Av", "Off"),
              fan_only: t("Vifte", "Fan"),
              dry: t("Avfukting", "Drying"),
              heat_cool: t("Varme / kjøling", "Heat / cool"),
            } as Record<string, string>
          )[c.state] || controlState(c, c.state, lang)
        : c.domain === "media_player"
          ? (
              {
                playing: t("Spiller", "Playing"),
                paused: t("På pause", "Paused"),
                idle: t("Klar", "Idle"),
                standby: t("Hvilemodus", "Standby"),
              } as Record<string, string>
            )[c.state] || controlState(c, c.state, lang)
          : controlState(c, c.state, lang);
  const brightness = c.capabilities.find((cap) =>
    cap.actions.includes("set_brightness"),
  );
  const volume = c.capabilities.find((cap) =>
    cap.actions.includes("set_volume"),
  );
  const battery = deviceBattery(c, home);
  const position = finiteReading(c.attributes.current_position, 0, 100);
  const labels: Record<string, string> = {
    lock: t("Lås", "Lock"),
    unlock: t("Lås opp", "Unlock"),
    open_cover: t("Åpne", "Open"),
    stop_cover: t("Stopp", "Stop"),
    close_cover: t("Lukk", "Close"),
    activate: t("Aktiver", "Activate"),
    media_play: t("Spill av", "Play"),
    media_pause: t("Pause", "Pause"),
    start: t("Start rengjøring", "Start cleaning"),
    pause: t("Pause", "Pause"),
    return_to_base: t("Til ladestasjonen", "Return to dock"),
    turn_on: t("Slå på", "Turn on"),
    turn_off: t("Slå av", "Turn off"),
  };
  async function send(
    action: string,
    value?: number | string | number[],
    confirmed = false,
  ) {
    if (disabled || pending.current || !actions.includes(action)) return;
    pending.current = true;
    setBusy(true);
    setFailed(false);
    setMessage("");
    confirm(null);
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
      if (result.status === "failed") setFailed(true);
      setMessage(
        result.status === "simulated"
          ? t("Oppdatert i demo", "Updated in demo")
          : result.status === "state_updated"
            ? t("Oppdatert", "Updated")
            : result.status === "failed"
              ? t(
                  "Handlingen feilet. Kontroller enheten.",
                  "Action failed. Check the device.",
                )
              : t(
                  "Sendt. Venter på bekreftelse fra enheten.",
                  "Sent. Waiting for the device to confirm.",
                ),
      );
      await qc.invalidateQueries({ queryKey: ["home"] });
    } catch {
      setFailed(true);
      setMessage(
        t(
          "Kunne ikke bekrefte handlingen. Sjekk tilkoblingen.",
          "Could not confirm the action. Check the connection.",
        ),
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  function request(action: string) {
    if (disabled || !actions.includes(action)) return;
    if (requiresConfirmation.has(action))
      confirm({ action, label: labels[action] });
    else void send(action);
  }
  function actionButton(action: string, ActionIcon: typeof Play) {
    if (!actions.includes(action)) return null;
    return (
      <button
        type="button"
        key={action}
        className="harmony-action"
        disabled={disabled}
        aria-label={`${c.name}: ${labels[action]}`}
        onClick={() => request(action)}
      >
        <ActionIcon size={18} aria-hidden="true" />
        <span>{labels[action]}</span>
      </button>
    );
  }
  const powerAction = c.state === "on" ? "turn_off" : "turn_on";
  const art = equipmentArt(c);
  const batteryPercent =
    art === "battery" ? finiteReading(numeric(c), 0, 100) : null;
  const rgb = actions.includes("set_rgb_color");
  const white = c.capabilities.find((cap) =>
    cap.actions.includes("set_color_temp"),
  );
  const whiteMode =
    !!white && (c.attributes.color_mode === "color_temp" || !rgb);
  const kelvin = finiteReading(c.attributes.color_temp_kelvin, 1000, 40000);
  const percent = lightPercentage(c);
  const power = deviceReading(c, home, "power"),
    energy = deviceReading(c, home, "energy");
  const powerControl =
    ["light", "switch", "input_boolean", "fan", "automation"].includes(
      c.domain,
    ) && actions.includes(powerAction);
  const topSwitch =
    powerControl && (c.domain !== "light" || brightness || rgb || white);
  const attention = available && securityAttention(c);
  const updated =
    c.updated_at && Number.isFinite(Date.parse(c.updated_at))
      ? new Date(c.updated_at).toLocaleTimeString(en ? "en-GB" : "nb-NO", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;
  const primary = !available
    ? state
    : c.domain === "binary_sensor" && c.attributes.device_class === "occupancy"
      ? c.state === "on"
        ? t("Registrert", "Occupied")
        : state
      : c.domain === "light" &&
          c.state === "on" &&
          white &&
          kelvin !== null &&
          (c.attributes.color_mode === "color_temp" || !rgb)
        ? `${kelvin.toLocaleString(en ? "en-GB" : "nb-NO")} K`
        : c.domain === "light" &&
            c.state === "on" &&
            brightness &&
            percent !== null
          ? `${percent} %`
          : c.domain === "switch" && power
            ? reading(power, lang)
            : c.domain === "cover" && position !== null
              ? `${position}%`
              : c.domain === "sensor" && art === "battery"
                ? batteryPercent === null
                  ? "—"
                  : `${batteryPercent} %`
                : c.domain === "sensor" && numeric(c) !== null
                  ? reading(c, lang)
                  : state;
  const secondary =
    c.domain === "light" && c.state === "on" && brightness
      ? whiteMode && percent !== null
        ? `${t("Lysstyrke", "Brightness")} ${percent} %`
        : t("Lysstyrke", "Brightness")
      : c.domain === "cover" && position !== null
        ? art === "awning"
          ? t("Utrulling", "Extension")
          : t("Åpen", "Open")
        : c.domain === "switch" && power
          ? state
          : c.domain === "sensor" && art === "battery"
            ? t("Batterinivå", "Battery level")
            : "";
  const feedback = message && (
    <p
      className="harmony-device-feedback"
      role={failed ? "alert" : "status"}
      data-error={failed}
    >
      {message}
    </p>
  );
  const toggle = () => (
    <button
      type="button"
      className="harmony-power equipment-toggle"
      role="switch"
      aria-checked={available && c.state === "on"}
      aria-label={`${c.name}: ${labels[powerAction]}`}
      disabled={disabled}
      onClick={() => request(powerAction)}
    >
      <span>{labels[powerAction]}</span>
      <i aria-hidden="true" />
    </button>
  );
  return (
    <article
      className="harmony-device equipment-card"
      data-domain={c.domain}
      data-art={art}
      data-tone={tone}
      data-active={on}
      data-available={available}
      data-attention={attention}
      data-color-light={rgb || white || undefined}
      aria-busy={busy}
      style={{ "--equipment-color": lightColor(c) } as CSSProperties}
    >
      <header className="harmony-device-header">
        <span className="harmony-device-icon">
          <CardIcon fallback={Icon} size={26} />
        </span>
        <button
          className="harmony-device-open"
          onClick={open}
          aria-label={`${t("Åpne", "Open")} ${c.name}`}
          aria-haspopup="dialog"
        >
          <span>
            <strong>
              <CardTitle>{c.name}</CardTitle>
            </strong>
            <small>{room}</small>
          </span>
          {!topSwitch && <ChevronRight size={17} aria-hidden="true" />}
        </button>
        {topSwitch && toggle()}
      </header>
      {c.domain === "climate" ? (
        <>
          <div className="harmony-device-status">
            <i aria-hidden="true" />
            <span>{busy ? t("Sender…", "Sending…") : state}</span>
            {available && battery !== null && (
              <small>
                <Battery size={15} />
                {battery}%
              </small>
            )}
          </div>
          <Thermostat
            compact
            c={{
              ...c,
              availability: available ? c.availability : "unavailable",
            }}
            lang={lang}
            disabled={disabled}
            change={(value) => void send("set_temperature", value)}
            changeMode={(value) => void send("set_hvac_mode", value)}
          />
        </>
      ) : (
        <div className="equipment-body">
          <div className="equipment-reading-group">
            <strong
              className="harmony-device-reading"
              data-numeric={!!secondary || c.domain === "sensor"}
            >
              {attention && <TriangleAlert size={25} aria-hidden="true" />}
              {primary}
            </strong>
            {secondary && available && (
              <small className="equipment-reading-caption">{secondary}</small>
            )}
            {busy && (
              <span className="harmony-device-status">
                <LoaderCircle size={14} className="spin" />
                {t("Sender…", "Sending…")}
              </span>
            )}
            {!available && (
              <span className="equipment-reading-caption">
                <WifiOff size={14} />
                {t("Ingen fersk status", "No current status")}
              </span>
            )}
            {available && battery !== null && (
              <span className="equipment-battery">
                <Battery size={16} />
                {t("Batteri", "Battery")} {battery}%
              </span>
            )}
            {updated &&
              ["binary_sensor", "alarm_control_panel"].includes(c.domain) && (
                <small className="equipment-updated">
                  {t("Sist oppdatert", "Last updated")} {updated}
                </small>
              )}
            {available && energy && c.domain === "switch" && (
              <span className="equipment-extra-reading">
                <small>{energy.name}</small>
                <strong>{reading(energy, lang)}</strong>
              </span>
            )}
            {feedback}
          </div>
          <EquipmentArtwork c={c} available={available} />
        </div>
      )}
      {c.domain === "media_player" && (
        <div className="harmony-now-playing">
          <strong>
            {available
              ? String(
                  c.attributes.media_title ||
                    t("Ingen avspilling", "Nothing playing"),
                )
              : "—"}
          </strong>
          {!!c.attributes.media_artist && (
            <small>{String(c.attributes.media_artist)}</small>
          )}
        </div>
      )}
      <div className="equipment-controls">
        {art === "battery" && available && batteryPercent !== null && (
          <progress
            className="equipment-battery-progress"
            aria-label={`${c.name}: ${t("Batterinivå", "Battery level")}`}
            max={100}
            value={batteryPercent}
            data-low={batteryPercent < 20}
          />
        )}
        {powerControl && !topSwitch && (
          <div className="equipment-main-toggle">{toggle()}</div>
        )}
        {c.domain === "light" && (
          <EquipmentColorControls
            c={c}
            lang={lang}
            disabled={disabled}
            change={(action, value) => void send(action, value)}
          />
        )}
        {brightness && !whiteMode && (
          <DeviceRange
            displayLabel={t("Lysstyrke", "Brightness")}
            label={`${c.name}: ${t("Lysstyrke", "Brightness")}`}
            value={percent}
            capability={brightness}
            disabled={disabled}
            change={(value) => void send("set_brightness", value)}
          />
        )}
        {white && whiteMode && (
          <div className="equipment-white-range">
            <DeviceRange
              displayLabel={t("Hvittemperatur", "White temperature")}
              label={`${c.name}: ${t("Hvittemperatur", "White temperature")}`}
              value={kelvin}
              capability={white}
              disabled={disabled}
              change={(value) => void send("set_color_temp", value)}
            />
          </div>
        )}
        {volume && (
          <DeviceRange
            Icon={Volume2}
            displayLabel={t("Volum", "Volume")}
            label={`${c.name}: ${t("Volum", "Volume")}`}
            value={
              number(c.attributes.volume_level) === null
                ? null
                : Number(c.attributes.volume_level) * 100
            }
            capability={volume}
            disabled={disabled}
            change={(value) => void send("set_volume", value)}
          />
        )}
        <div className="harmony-device-actions">
          {c.domain === "lock" &&
            actionButton(
              c.state === "locked" ? "unlock" : "lock",
              c.state === "locked" ? UnlockKeyhole : LockKeyhole,
            )}
          {c.domain === "cover" && (
            <>
              {actionButton("open_cover", ArrowUp)}
              {actionButton("stop_cover", Square)}
              {actionButton("close_cover", ArrowDown)}
            </>
          )}
          {c.domain === "media_player" &&
            actionButton(
              c.state === "playing" ? "media_pause" : "media_play",
              c.state === "playing" ? Pause : Play,
            )}
          {c.domain === "vacuum" && (
            <>
              {actionButton(
                c.state === "cleaning" ? "pause" : "start",
                c.state === "cleaning" ? Pause : Play,
              )}
              {actionButton("return_to_base", House)}
            </>
          )}
          {["scene", "script"].includes(c.domain) &&
            actionButton("activate", Sparkles)}
        </div>
      </div>
      {!canControl && (
        <small className="harmony-readonly">
          {t("Kun visning", "View only")}
        </small>
      )}
      {c.domain === "climate" && feedback}
      {confirmation && (
        <SettingsDialog
          title={`${confirmation.label} ${c.name}?`}
          lang={lang}
          compact
          onClose={() => confirm(null)}
        >
          <p>
            {c.domain === "cover"
              ? t(
                  "Kontroller at ingenting er i veien før enheten beveger seg.",
                  "Make sure the path is clear before the device moves.",
                )
              : c.domain === "lock"
                ? t(
                    "Dette endrer tilgangen til hjemmet ditt.",
                    "This changes access to your home.",
                  )
                : t(
                    "Dette kjører den valgte rutinen i hjemmet.",
                    "This runs the selected routine in your home.",
                  )}
          </p>
          <div className="harmony-confirm-actions">
            <button onClick={() => confirm(null)}>
              {t("Avbryt", "Cancel")}
            </button>
            <button
              className="primary"
              disabled={disabled}
              onClick={() => void send(confirmation.action, undefined, true)}
            >
              {confirmation.label}
            </button>
          </div>
        </SettingsDialog>
      )}
    </article>
  );
}

/** Shared cards for favorites, room views and category selections. Details reuse the full existing controls. */
export function HarmonyDevices({
  controls,
  home,
  lang,
  offline,
}: {
  controls: Control[];
  home: Home;
  lang: string;
  offline: boolean;
}) {
  const render = useContext(MetricDeviceRenderer);
  const inDialog = useContext(InSettingsDialog);
  const [selected, select] = useState<string | null>(null);
  const active = home.controls.find((c) => c.id === selected);
  if (inDialog)
    return (
      <div className="harmony-detail-devices">
        {controls.map((c) => (
          <Fragment key={c.id}>{render?.(c)}</Fragment>
        ))}
      </div>
    );
  return (
    <>
      <div className="harmony-device-grid">
        {controls.map((c) => (
          <HarmonyDevice
            key={c.id}
            c={c}
            home={home}
            lang={lang}
            offline={offline}
            open={() => select(c.id)}
          />
        ))}
      </div>
      {active && render && (
        <SettingsDialog
          title={active.name}
          lang={lang}
          onClose={() => select(null)}
        >
          {render(active)}
        </SettingsDialog>
      )}
    </>
  );
}

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Camera,
  ChevronRight,
  CirclePlay,
  Power,
  TriangleAlert,
} from "lucide-react";
import { api } from "../api";
import type { Control, Home } from "../types";
import { controlState } from "../controlState";
import { CardPresentation, CardTitle } from "./CardPresentation";
import { MobileCardArtwork } from "./MobileCardArtwork";
import type { MobileCardProps } from "./MobileCardTile";
import { usable } from "./homeModel";
import { lightPercentage, securityAttention } from "./equipmentModel";
import { PhoneMediaCard } from "./PhoneMediaCard";
import { PhoneMiscDeviceCard } from "./PhoneMiscDeviceCard";

function useLightCommand(home: Home, offline: boolean, lang: string) {
  const query = useQueryClient(),
    pending = useRef(false);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const permitted =
    !home.permissions || home.permissions.includes("lights.control");
  async function send(c: Control, action: string, value?: number) {
    if (
      offline ||
      !home.connected ||
      !usable(c) ||
      !permitted ||
      !c.capabilities.some((cap) => cap.actions.includes(action))
    )
      return;
    const result = await api<{ status: string }>(
      `controls/${encodeURIComponent(c.entity_id)}/commands`,
      "POST",
      { action, ...(value === undefined ? {} : { value }) },
    );
    if (result.status === "failed") throw new Error("command_failed");
    return result.status;
  }
  async function run(
    work: (dispatch: typeof send) => Promise<(string | undefined)[]>,
  ) {
    if (pending.current || !permitted || offline || !home.connected) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      const statuses = await work(send);
      setMessage(
        statuses.some((s) => s === "accepted_unconfirmed")
          ? lang === "en"
            ? "Sent. Waiting for confirmation."
            : "Sendt. Venter på bekreftelse."
          : "",
      );
    } catch {
      setMessage(
        lang === "en"
          ? "Could not control the light. Please retry."
          : "Kunne ikke styre lyset. Prøv igjen.",
      );
    } finally {
      await query.invalidateQueries({ queryKey: ["home"] });
      pending.current = false;
      setBusy(false);
    }
  }
  return { run, busy, message, permitted };
}

export function PhoneLightsOff({
  controls,
  home,
  offline,
  lang,
}: {
  controls: Control[];
  home: Home;
  offline: boolean;
  lang: string;
}) {
  const command = useLightCommand(home, offline, lang);
  const targets = controls.filter(
    (c) =>
      c.domain === "light" &&
      usable(c) &&
      c.state === "on" &&
      c.capabilities.some((cap) => cap.actions.includes("turn_off")),
  );
  return (
    <div className="phone-room-actions">
      <button
        disabled={
          !targets.length ||
          command.busy ||
          !command.permitted ||
          offline ||
          !home.connected
        }
        onClick={() =>
          void command.run(async (send) => {
            const statuses: (string | undefined)[] = [];
            for (const c of targets) statuses.push(await send(c, "turn_off"));
            return statuses;
          })
        }
      >
        <Power size={19} />
        {lang === "en" ? "Turn all off" : "Slå av alle"}
      </button>
      {command.message && <small role="status">{command.message}</small>}
    </div>
  );
}

function PhoneLight({
  c,
  onOpen,
  ...props
}: MobileCardProps & { c: Control; onOpen: () => void }) {
  const { home, offline, lang } = props,
    en = lang === "en";
  const command = useLightCommand(home, offline, lang);
  const available = !offline && home.connected && usable(c),
    on = available && c.state === "on";
  const capability = c.capabilities.find((cap) =>
    cap.actions.includes("set_brightness"),
  );
  const value = on
    ? lightPercentage(c)
    : available && c.state === "off"
      ? 0
      : null;
  const [draft, setDraft] = useState(value),
    dirty = useRef(false);
  useEffect(() => {
    setDraft(value);
    dirty.current = false;
  }, [value, c.entity_id]);
  const blocked = !available || command.busy || !command.permitted;
  const rgb = c.attributes.rgb_color;
  const colored =
    on &&
    ["rgb", "rgbw", "rgbww", "hs", "xy"].includes(
      String(c.attributes.color_mode),
    ) &&
    Array.isArray(rgb) &&
    rgb.length === 3 &&
    rgb.every(
      (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 255,
    ) &&
    Math.max(...rgb) - Math.min(...rgb) >= 8;
  const action = on ? "turn_off" : "turn_on",
    canToggle = c.capabilities.some((cap) => cap.actions.includes(action));
  const min = capability?.minimum ?? 0,
    max = capability?.maximum ?? 100,
    step = capability?.step ?? 1;
  const commit = () => {
    if (!dirty.current || blocked || draft === null) return;
    dirty.current = false;
    void command.run(async (send) => [await send(c, "set_brightness", draft)]);
  };
  return (
    <article
      className="phone-light"
      data-on={on}
      data-colored={colored || undefined}
      data-unavailable={!available}
    >
      <button
        className="phone-product-open"
        onClick={onOpen}
        aria-label={`${en ? "Details" : "Detaljer"}: ${c.name}`}
      >
        <MobileCardArtwork {...props} />
      </button>
      {canToggle && (
        <button
          className="phone-light-power"
          aria-label={`${on ? (en ? "Turn off" : "Slå av") : en ? "Turn on" : "Slå på"}: ${c.name}`}
          aria-pressed={on}
          disabled={blocked}
          onClick={() =>
            void command.run(async (send) => [await send(c, action)])
          }
        >
          <Power size={22} />
        </button>
      )}
      <button className="phone-device-name" onClick={onOpen}>
        <CardTitle>{c.name}</CardTitle>
      </button>
      <div className="phone-light-reading">
        <span>
          {!available
            ? en
              ? "Unavailable"
              : "Utilgjengelig"
            : on
              ? en
                ? "On"
                : "På"
              : en
                ? "Off"
                : "Av"}
        </span>
        {on && (
          <strong>{draft === null ? "—" : `${Math.round(draft)} %`}</strong>
        )}
      </div>
      {capability && (
        <input
          type="range"
          aria-label={`${c.name}: ${en ? "brightness" : "lysstyrke"}`}
          min={min}
          max={max}
          step={step}
          value={Math.max(min, Math.min(max, draft ?? min))}
          disabled={blocked || draft === null || max <= min || step <= 0}
          style={
            {
              "--phone-level": `${draft === null || max <= min ? 0 : Math.max(0, Math.min(100, ((draft - min) / (max - min)) * 100))}%`,
            } as CSSProperties
          }
          onChange={(event) => {
            dirty.current = true;
            setDraft(Number(event.target.value));
          }}
          onPointerUp={commit}
          onPointerCancel={() => {
            dirty.current = false;
            setDraft(value);
          }}
          onKeyUp={(event) => {
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
              ].includes(event.key)
            )
              commit();
          }}
          onBlur={commit}
        />
      )}
      {command.message && (
        <small className="phone-command-status" role="status">
          {command.message}
        </small>
      )}
    </article>
  );
}

export function PhoneDeviceCard({
  onOpen,
  miscellaneous = false,
  ...props
}: MobileCardProps & { onOpen: () => void; miscellaneous?: boolean }) {
  const { home, config, card, offline, lang } = props;
  const c = home.controls.find(
    (c) => c.entity_id === (config?.sources[0] || card.entityId),
  );
  if (!c) return null;
  const en = lang === "en",
    available = !offline && home.connected && usable(c);
  const alert = !available || securityAttention(c);
  const warning =
    available &&
    ((c.domain === "lock" && c.state === "unlocked") ||
      (c.domain === "cover" && c.state === "open") ||
      (c.domain === "binary_sensor" &&
        c.state === "on" &&
        ["door", "window", "opening", "garage_door"].includes(
          String(c.attributes.device_class),
        )));
  const state = !available
    ? offline || !home.connected
      ? en
        ? "Disconnected"
        : "Frakoblet"
      : en
        ? "Unavailable"
        : "Utilgjengelig"
    : controlState(c, c.state, lang);
  return (
    <CardPresentation.Provider value={config || {}}>
      {miscellaneous &&
      ["cover", "switch", "input_boolean", "vacuum"].includes(c.domain) ? (
        <PhoneMiscDeviceCard {...props} c={c} onOpen={onOpen} />
      ) : c.domain === "light" ? (
        <PhoneLight {...props} c={c} onOpen={onOpen} />
      ) : c.domain === "media_player" ? (
        <PhoneMediaCard {...props} c={c} onOpen={onOpen} />
      ) : c.domain === "camera" ? (
        <article className="phone-camera">
          <header>
            <Camera size={22} />
            <strong>
              <CardTitle>{c.name}</CardTitle>
            </strong>
            <span>{available ? (en ? "Inactive" : "Inaktiv") : state}</span>
          </header>
          <button
            className="phone-camera-preview"
            onClick={onOpen}
            aria-label={`${en ? "Open camera" : "Åpne kamera"}: ${c.name}`}
          >
            <Camera size={48} />
            <span>
              <CirclePlay size={23} />
              {en ? "Open camera" : "Åpne kamera"}
            </span>
          </button>
        </article>
      ) : (
        <button
          className="phone-security"
          data-attention={alert}
          data-warning={warning || undefined}
          data-unavailable={!available}
          onClick={onOpen}
          aria-label={`${c.name}: ${state}. ${en ? "View details" : "Se detaljer"}`}
        >
          <MobileCardArtwork {...props} />
          <strong>
            <CardTitle>{c.name}</CardTitle>
          </strong>
          <span className="phone-security-state">
            {alert ? <TriangleAlert size={19} /> : <i />}
            {state}
          </span>
          <ChevronRight className="phone-security-chevron" size={20} />
          <small>{en ? "View details" : "Se detaljer"}</small>
        </button>
      )}
    </CardPresentation.Provider>
  );
}

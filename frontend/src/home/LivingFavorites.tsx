import { useContext, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Blinds,
  ChevronRight,
  Lightbulb,
  LockKeyhole,
  Plug,
  Thermometer,
  Volume2,
} from "lucide-react";
import { api } from "../api";
import { controlState } from "../controlState";
import type { Control, Home } from "../types";
import { MetricDeviceRenderer } from "./MetricDetails";
import { SettingsDialog } from "./SettingsDialog";
import { reading, usable } from "./homeModel";

function FavoriteTile({
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
  const en = lang === "en";
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const canPower =
    ["light", "switch"].includes(c.domain) &&
    c.capabilities.some((cap) => cap.kind === "power");
  const available = !offline && usable(c);
  const on = c.state === "on";
  const Icon =
    c.domain === "light"
      ? Lightbulb
      : c.domain === "switch"
        ? Plug
        : c.domain === "climate"
          ? Thermometer
          : c.domain === "lock"
            ? LockKeyhole
            : c.domain === "cover"
              ? Blinds
              : c.domain === "media_player"
                ? Volume2
                : Activity;
  const room = home.areas.find((a) => a.area_id === c.area_id)?.name;
  const current =
    c.domain === "climate" &&
    typeof c.attributes.current_temperature === "number"
      ? `${c.attributes.current_temperature.toLocaleString(en ? "en-GB" : "nb-NO", { maximumFractionDigits: 1 })} ${String(c.attributes.temperature_unit || "°C")}`
      : c.domain === "sensor" && available
        ? reading(c, lang)
        : controlState(c, available ? c.state : "unavailable", lang);
  async function toggle() {
    if (!available || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await api<{ status: string }>(
        `controls/${encodeURIComponent(c.entity_id)}/commands`,
        "POST",
        { action: on ? "turn_off" : "turn_on", confirmed: false },
      );
      setMessage(
        result.status === "simulated"
          ? en
            ? "Updated in demo"
            : "Oppdatert i demo"
          : result.status === "state_updated"
            ? en
              ? "Updated"
              : "Oppdatert"
            : en
              ? "Sent, awaiting confirmation"
              : "Sendt, venter på bekreftelse",
      );
      await qc.invalidateQueries({ queryKey: ["home"] });
    } catch {
      setMessage(
        en
          ? "Could not confirm. Check the device."
          : "Kunne ikke bekrefte. Kontroller enheten.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <article
      className={`living-favorite ${on && available ? "is-active" : ""}`}
    >
      <button
        className="living-favorite-open"
        onClick={open}
        aria-label={`${en ? "Open" : "Åpne"} ${c.name}`}
        aria-haspopup="dialog"
      >
        <span className="living-favorite-icon">
          <Icon size={22} />
        </span>
        <span className="living-favorite-copy">
          <strong>{c.name}</strong>
          <small>
            {room || (en ? "Home" : "Hjemmet")} · {current}
          </small>
        </span>
        <ChevronRight className="living-favorite-arrow" size={17} />
      </button>
      {canPower && (
        <button
          className="living-favorite-switch"
          role="switch"
          aria-checked={on}
          aria-label={`${c.name}: ${on ? (en ? "Turn off" : "Slå av") : en ? "Turn on" : "Slå på"}`}
          disabled={!available || busy}
          onClick={() => void toggle()}
        >
          <span />
        </button>
      )}
      {message && (
        <span className="living-favorite-feedback" role="status">
          {message}
        </span>
      )}
    </article>
  );
}

export function LivingFavorites({
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
  const [selected, select] = useState<string | null>(null);
  const render = useContext(MetricDeviceRenderer);
  const active = home.controls.find((c) => c.id === selected);
  return (
    <>
      <div className="living-favorites-grid">
        {controls.map((c) => (
          <FavoriteTile
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

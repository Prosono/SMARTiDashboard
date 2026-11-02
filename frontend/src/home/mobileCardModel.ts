import type { Control, Home } from "../types";
import type { CardConfig, GridItem } from "./homeGridModel";
import { controlState } from "../controlState";
import { numeric, overview, temperature, usable } from "./homeModel";
import { weatherLabel } from "./weatherPresentation";

export type MobileCardRef = {
  id: string;
  title: string;
  entityId?: string;
  summary?: MobileSummary;
};
export type MobileSummary = {
  reading: string;
  detail: string;
  icon: string;
  unavailable?: boolean;
  climateTone?: "heat" | "cool" | "off" | "auto";
};

/** Display-only geometry: neither the saved placements nor their configuration change. */
export function mobileGridItems(items: GridItem[]) {
  return items.map((item) => ({ ...item, w: 1, h: 1 }));
}

export function mobileCardSummary(
  card: MobileCardRef,
  config: CardConfig | undefined,
  home: Home,
  offline: boolean,
  lang: string,
): MobileSummary {
  const en = lang === "en",
    t = (nb: string, english: string) => (en ? english : nb);
  const missing = (
    detail = t("Åpne kortet for detaljer", "Open for details"),
  ): MobileSummary => ({
    reading: t("Utilgjengelig", "Unavailable"),
    detail,
    icon: "activity",
    unavailable: true,
  });
  const format = (v: number) =>
    v.toLocaleString(en ? "en-GB" : "nb-NO", { maximumFractionDigits: 1 });
  const finite = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  if (offline || !home.connected)
    return { ...missing(), reading: t("Frakoblet", "Disconnected") };
  const sources = config?.sources.length
    ? config.sources
    : card.entityId
      ? [card.entityId]
      : [];
  if (!sources.length && card.summary) return card.summary;
  if (!sources.length && card.id === "routines")
    return {
      reading: t("Velg rutine", "Choose routine"),
      detail: t(
        "Hjemme · Borte · Natt · Ferie",
        "Home · Away · Night · Holiday",
      ),
      icon: "routines",
    };
  if (!sources.length && card.id === "scenes")
    return {
      reading: t("Velg stemning", "Choose a scene"),
      detail: t("Se scenene dine", "See your scenes"),
      icon: "scenes",
    };
  if (!sources.length && card.id === "lighting") {
    const all = home.controls.filter(
        (c) => c.domain === "light" && !c.diagnostic,
      ),
      known = all.filter(usable);
    if (!known.length) return { ...missing(), icon: "light" };
    const on = known.filter((c) => c.state === "on").length;
    return {
      reading: `${on} ${t("på", "on")}`,
      detail:
        known.length < all.length
          ? `${all.length - known.length} ${t("ukjent", "unknown")}`
          : `${all.length} ${t("lys totalt", "lights in total")}`,
      icon: "light",
    };
  }
  if (!sources.length && card.id.startsWith("room:")) {
    const room = home.controls.filter(
        (c) => c.area_id === card.id.slice(5) && !c.diagnostic,
      ),
      measured = room.map(temperature).find((v) => v !== null),
      lights = room.filter((c) => c.domain === "light" && usable(c));
    return {
      reading:
        measured !== undefined
          ? `${format(measured)} °C`
          : `${room.length} ${t("enheter", "devices")}`,
      detail: lights.length
        ? `${lights.filter((c) => c.state === "on").length} ${t("lys på", "lights on")}`
        : t("Åpne rommet", "Open room"),
      icon: "room",
    };
  }
  if (!sources.length && card.id === "summary:connection")
    return {
      reading: t("Tilkoblet", "Connected"),
      detail: `${home.controls.length} ${t("målepunkter", "entities")}`,
      icon: "network",
    };
  if (!sources.length && card.id === "summary:alerts") {
    const count = overview(home).alerts.length;
    return {
      reading: `${count} ${t("å sjekke", "to check")}`,
      detail: t("Se status og varsler", "View status and alerts"),
      icon: "alert",
    };
  }
  const control = home.controls.find((c) => c.entity_id === sources[0]);
  if (!control)
    return sources.length
      ? missing(t("Datakilden mangler", "Source is missing"))
      : {
          reading: t("Åpne kort", "Open card"),
          detail: t("Se detaljer", "View details"),
          icon: card.id.includes("batteries") ? "battery" : "activity",
        };
  if (!usable(control))
    return {
      ...missing(),
      icon: control.domain,
      climateTone: control.domain === "climate" ? "off" : undefined,
    };
  const c: Control = control,
    a = c.attributes,
    room = home.areas.find((r) => r.area_id === c.area_id)?.name || "",
    state = controlState(c, c.state, lang);
  if (c.domain === "climate") {
    const target = finite(a.temperature),
      current = finite(a.current_temperature),
      unit = String(
        a.temperature_unit ||
          c.capabilities.find((cap) => cap.actions.includes("set_temperature"))
            ?.unit ||
          "°",
      ),
      action = String(a.hvac_action || ""),
      mode =
        c.state === "off"
          ? t("Av", "Off")
          : action === "heating"
            ? t("Varmer", "Heating")
            : action === "cooling"
              ? t("Kjøler", "Cooling")
              : c.state === "cool"
                ? t("Kjøling", "Cool")
                : c.state === "heat"
                  ? t("Varme", "Heat")
                  : c.state === "fan_only"
                    ? t("Vifte", "Fan")
                    : c.state === "dry"
                      ? t("Avfukting", "Dry")
                      : "Auto";
    return {
      reading: target === null ? "—" : `${format(target)} ${unit}`,
      detail: `${mode}${current === null ? "" : ` · ${t("rommet", "room")} ${format(current)}${unit}`}`,
      icon: "climate",
      climateTone:
        c.state === "off"
          ? "off"
          : action === "cooling" || c.state === "cool"
            ? "cool"
            : action === "heating" || c.state === "heat"
              ? "heat"
              : "auto",
    };
  }
  if (c.domain === "weather") {
    const value = finite(a.temperature);
    return {
      reading:
        value === null
          ? "—"
          : `${format(value)}${String(a.temperature_unit || "°")}`,
      detail: weatherLabel(c.state, lang),
      icon: "weather",
    };
  }
  if (c.domain === "sensor") {
    const n = numeric(c);
    if (n === null) return missing();
    const metricTemp =
      card.id === "metric:temperature" ||
      (config?.type === "graph" &&
        ["°F", "°C"].includes(String(a.unit_of_measurement)));
    const value = metricTemp ? temperature(c) : n,
      rawUnit = String(a.unit_of_measurement || ""),
      unit = metricTemp
        ? "°C"
        : rawUnit === "W" && Math.abs(n) >= 1000
          ? "kW"
          : rawUnit;
    return {
      reading:
        value === null
          ? "—"
          : `${format(!metricTemp && unit === "kW" && rawUnit === "W" ? n / 1000 : value)}${unit ? ` ${unit}` : ""}`,
      detail:
        config?.sources.length && config.sources.length > 1
          ? `${config.sources.length} ${t("datakilder", "sources")}`
          : room || c.name,
      icon: String(a.device_class || "sensor"),
    };
  }
  if (c.domain === "light") {
    const brightness = finite(a.brightness);
    return {
      reading:
        c.state === "on" && brightness !== null
          ? `${format(Math.max(0, Math.min(100, (brightness / 255) * 100)))} %`
          : state,
      detail:
        c.state === "on"
          ? t("Lys på", "Light on")
          : room || t("Lys av", "Light off"),
      icon: "light",
    };
  }
  if (c.domain === "media_player") {
    const label =
      (
        {
          playing: t("Spiller", "Playing"),
          paused: t("På pause", "Paused"),
          idle: t("Klar", "Ready"),
          standby: t("Hvilemodus", "Standby"),
          buffering: t("Laster…", "Buffering…"),
        } as Record<string, string>
      )[c.state] || state;
    return {
      reading: label,
      detail:
        typeof a.media_title === "string" && a.media_title
          ? a.media_title
          : room || t("Åpne spiller", "Open player"),
      icon: "media",
    };
  }
  if (c.domain === "vacuum") {
    const battery = finite(a.battery_level);
    return {
      reading: state,
      detail:
        battery === null
          ? room
          : `${format(battery)} % ${t("batteri", "battery")}`,
      icon: "vacuum",
    };
  }
  if (c.domain === "fan") {
    const speed = finite(a.percentage);
    return {
      reading:
        c.state === "on" && speed !== null ? `${format(speed)} %` : state,
      detail: room,
      icon: "fan",
    };
  }
  if (c.domain === "cover") {
    const pos = finite(a.current_position);
    return {
      reading: pos === null ? state : `${format(pos)} %`,
      detail: pos === null ? room : state,
      icon: "cover",
    };
  }
  return {
    reading: state,
    detail: room || t("Åpne for detaljer", "Open for details"),
    icon: c.domain,
  };
}

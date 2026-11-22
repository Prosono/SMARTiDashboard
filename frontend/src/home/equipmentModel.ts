import type { Control, Home } from "../types";
import { numeric, usable } from "./homeModel";
import { equipmentPortraitKinds } from "./equipmentAssets";
export { deviceBattery } from "./deviceMetadata";

const householdApplianceTypes = [
  {
    kind: "washing-machine",
    names: [
      "vaskemaskin",
      "vaskemaskinen",
      "washing machine",
      "clothes washer",
    ],
    icons: ["mdi:washing-machine"],
  },
  {
    kind: "tumble-dryer",
    names: [
      "tørketrommel",
      "tørketrommelen",
      "torketrommel",
      "tumble dryer",
      "clothes dryer",
    ],
    icons: ["mdi:tumble-dryer"],
  },
  {
    kind: "dishwasher",
    names: ["oppvaskmaskin", "oppvaskmaskinen", "dishwasher", "dish washer"],
    icons: ["mdi:dishwasher"],
  },
  {
    kind: "refrigerator",
    names: [
      "kjøleskap",
      "kjøleskapet",
      "kjoleskap",
      "kjøl frys",
      "kjøl og frys",
      "fryser",
      "fryseren",
      "refrigerator",
      "fridge",
      "freezer",
    ],
    icons: ["mdi:fridge", "mdi:fridge-outline"],
  },
] as const;
type HouseholdApplianceArt = (typeof householdApplianceTypes)[number]["kind"];

export type EquipmentArt =
  | "pendant"
  | "bulb"
  | "ceiling"
  | "floor"
  | "desk"
  | "strip"
  | "spot"
  | "outdoor"
  | "track"
  | "charger"
  | "plug"
  | "switch"
  | "lock"
  | "contact"
  | "window"
  | "motion"
  | "movement"
  | "presence"
  | "smoke"
  | "leak"
  | "alarm"
  | "blind"
  | "roller"
  | "curtain"
  | "awning"
  | "garage"
  | "fan"
  | "thermostat"
  | "air-conditioner"
  | "water-heater"
  | HouseholdApplianceArt
  | "battery"
  | "generic";

type EquipmentIdentity = Pick<
  Control,
  "name" | "device_name" | "entity_id" | "attributes"
>;

function equipmentDescription(c: EquipmentIdentity) {
  return [
    c.name,
    c.device_name,
    c.entity_id,
    c.attributes.device_class,
    c.attributes.smarti_device_model,
  ]
    .filter((value) => typeof value === "string")
    .join(" ")
    .replace(/[_-]/g, " ");
}

export function householdApplianceArt(c: EquipmentIdentity) {
  const explicit = householdApplianceTypes.find(({ icons }) =>
    icons.some((icon) => icon === c.attributes.icon),
  );
  if (explicit) return explicit.kind;
  const words = ` ${equipmentDescription(c)
    .normalize("NFC")
    .toLocaleLowerCase("nb-NO")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()} `;
  const matches = householdApplianceTypes.filter(({ names }) =>
    names.some((name) => words.includes(` ${name} `)),
  );
  return matches.length === 1 ? matches[0].kind : undefined;
}

export function isHouseholdApplianceArt(kind: EquipmentArt) {
  return householdApplianceTypes.some((appliance) => appliance.kind === kind);
}

export function hasAirConditionerHint(c: EquipmentIdentity) {
  return (
    /\b(ac|air[ _-]?con(?:ditioner)?|airconditioning)\b|varmepumpe|luft[ -]til[ -]luft/i.test(
      equipmentDescription(c),
    ) || c.attributes.icon === "mdi:air-conditioner"
  );
}

export function hasWaterHeaterHint(c: EquipmentIdentity) {
  return (
    /\b(?:varmtvann(?:s?(?:bereder|tank))?|water\s*heater|hot\s*water(?:\s*(?:heater|tank|cylinder))?|dhw)\b/i.test(
      equipmentDescription(c),
    ) ||
    ["mdi:water-boiler", "mdi:water-boiler-auto"].includes(
      String(c.attributes.icon),
    )
  );
}

export function isAirConditioner(c: Control) {
  return c.domain === "climate" && hasAirConditionerHint(c);
}

export function equipmentArt(c: Control): EquipmentArt {
  const deviceClass = String(c.attributes.device_class || "");
  if (c.domain === "light") {
    const chosen = String(c.attributes.smarti_icon || "auto");
    if (
      [
        "bulb",
        "pendant",
        "floor",
        "desk",
        "ceiling",
        "strip",
        "sun",
        "outdoor",
        "track",
        "spot",
      ].includes(chosen)
    )
      return chosen === "sun" ? "spot" : (chosen as EquipmentArt);
    const name = c.name.toLocaleLowerCase();
    if (
      /lysskinne|lysskinna|spottskinne|spot\s*skinne|track|\brail\b/.test(name)
    )
      return "track";
    if (
      /utelys|utelampe|utendørs|outdoor|terrasselampe|vegglampe ute/.test(name)
    )
      return "outdoor";
    if (/lyspære|\bpære\b|\bbulb\b|\be27\b|\be14\b/.test(name)) return "bulb";
    if (/strip|lyslist|lysbånd|led[ -]?(list|bånd)|benk/.test(name))
      return "strip";
    if (/spot|downlight/.test(name)) return "spot";
    if (/gulv|floor/.test(name)) return "floor";
    if (/bord|desk|table/.test(name)) return "desk";
    if (/tak|ceiling|plafond/.test(name)) return "ceiling";
    if (/led/.test(name)) return "strip";
    return "pendant";
  }
  if (c.domain === "cover")
    return (
      (
        {
          curtain: "curtain",
          awning: "awning",
          shade: "roller",
          garage: "garage",
          gate: "garage",
          door: "garage",
        } as Record<string, EquipmentArt>
      )[deviceClass] || "blind"
    );
  if (c.domain === "lock") return "lock";
  if (
    c.domain === "water_heater" ||
    (c.domain === "switch" && hasWaterHeaterHint(c))
  )
    return "water-heater";
  if (c.domain === "climate")
    return isAirConditioner(c) ? "air-conditioner" : "thermostat";
  if (c.domain === "fan") return "fan";
  if (["switch", "input_boolean"].includes(c.domain)) {
    const appliance = householdApplianceArt(c);
    if (appliance) return appliance;
    return /elbillad|ev[ _-]?(charg|lad)|\bevse\b|wallbox|ladestasjon/.test(
      [c.name, c.device_name, c.attributes.smarti_device_model]
        .filter((v) => typeof v === "string")
        .join(" ")
        .toLocaleLowerCase(),
    ) || c.attributes.icon === "mdi:ev-station"
      ? "charger"
      : deviceClass === "outlet" ||
          /stikk|socket|plug/.test(c.name.toLocaleLowerCase())
        ? "plug"
        : "switch";
  }
  if (c.domain === "alarm_control_panel") return "alarm";
  if (c.domain === "sensor" && deviceClass === "battery") return "battery";
  if (c.domain === "binary_sensor")
    return (
      (
        {
          door: "contact",
          opening: "contact",
          window: "window",
          motion: "movement",
          occupancy: "presence",
          presence: "presence",
          smoke: "smoke",
          gas: "smoke",
          carbon_monoxide: "smoke",
          moisture: "leak",
        } as Record<string, EquipmentArt>
      )[deviceClass] || "contact"
    );
  return "generic";
}

export function equipmentPortrait(
  c: Control,
  kind: EquipmentArt,
  available: boolean,
) {
  if (kind === "window") {
    if (available && ["on", "open"].includes(c.state)) return "window-open";
    if (available && ["off", "closed"].includes(c.state))
      return "window-closed";
    return null;
  }
  if (kind === "movement") {
    if (!available || !usable(c)) return "motion";
    if (c.state === "on") return "movement";
    if (c.state === "off") return "movement-idle";
    return "motion";
  }
  return equipmentPortraitKinds.has(kind) ? kind : null;
}

export function finiteReading(
  value: unknown,
  minimum = -Infinity,
  maximum = Infinity,
) {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : null;
}

export function deviceReading(
  c: Control,
  home: Home,
  kind: "power" | "energy" | "battery",
) {
  if (!c.device_id) return undefined;
  const units =
    kind === "power" ? ["W", "kW"] : kind === "energy" ? ["Wh", "kWh"] : ["%"];
  const candidates = home.controls.filter(
    (item) =>
      item.domain === "sensor" &&
      !item.diagnostic &&
      item.device_id === c.device_id &&
      item.attributes.device_class === kind &&
      units.includes(String(item.attributes.unit_of_measurement)) &&
      usable(item) &&
      numeric(item) !== null,
  );
  // Multiple sources are ambiguous: do not silently pick a circuit, total or tariff.
  return candidates.length === 1 ? candidates[0] : undefined;
}

export function lightPercentage(c: Control) {
  const brightness = finiteReading(c.attributes.brightness, 0, 255);
  return brightness !== null
    ? Math.round((brightness / 255) * 100)
    : c.state === "off"
      ? 0
      : null;
}

export function lightColor(c: Control) {
  const color = c.attributes.rgb_color;
  return Array.isArray(color) &&
    color.length === 3 &&
    color.every((value) => finiteReading(value, 0, 255) !== null)
    ? `rgb(${color.map((value) => Math.round(value)).join(" ")})`
    : "#ffb347";
}

export function securityAttention(c: Control) {
  return (
    usable(c) &&
    (c.state === "triggered" ||
      (c.domain === "binary_sensor" &&
        c.state === "on" &&
        [
          "smoke",
          "gas",
          "carbon_monoxide",
          "moisture",
          "safety",
          "tamper",
        ].includes(String(c.attributes.device_class))))
  );
}

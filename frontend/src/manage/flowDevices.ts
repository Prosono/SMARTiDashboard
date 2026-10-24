import type { Control, Home } from "../types";
import type { FlowKind } from "./flowPresentation";
export type DeviceGroup = {
  id: string;
  name: string;
  room: string;
  controls: Control[];
};
export type DeviceFeature = {
  control: Control;
  attribute?: string;
  name: string;
  value: unknown;
  numeric: boolean;
  unit: string;
};
export function flowDevices(home: Home): DeviceGroup[] {
  const groups = new Map<string, DeviceGroup>();
  for (const c of home.controls) {
    const id = c.device_id || c.entity_id;
    if (!groups.has(id))
      groups.set(id, {
        id,
        name:
          c.device_name ||
          home.devices?.find((d) => d.id === id)?.name ||
          c.name,
        room: home.areas.find((a) => a.area_id === c.area_id)?.name || "",
        controls: [],
      });
    groups.get(id)!.controls.push(c);
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}
const labels: Record<string, [string, string]> = {
  current_temperature: ["Målt temperatur", "Current temperature"],
  temperature: ["Ønsket temperatur", "Target temperature"],
  current_humidity: ["Målt luftfuktighet", "Current humidity"],
  humidity: ["Luftfuktighet", "Humidity"],
  battery_level: ["Batterinivå", "Battery level"],
  battery: ["Batteri", "Battery"],
  brightness: ["Lysstyrke (0–255)", "Brightness (0–255)"],
  current_position: ["Åpningsgrad", "Position"],
  volume_level: ["Lydnivå (0–1)", "Volume (0–1)"],
  hvac_action: ["Klimaaktivitet", "HVAC activity"],
  fan_mode: ["Viftemodus", "Fan mode"],
  preset_mode: ["Forhåndsvalg", "Preset"],
  event_type: ["Siste hendelse", "Last event"],
};
const excluded =
  /^(friendly_name|icon|entity_picture|supported_|min_|max_|min$|max$|step$|latitude|longitude|gps_|source|attribution|.*token.*|.*password.*|.*secret.*|.*key.*|.*url.*|.*ip_address.*)/i;
export function deviceFeatures(
  group: DeviceGroup,
  lang: string,
): DeviceFeature[] {
  return group.controls.flatMap((control) => {
    const numeric = (v: unknown) =>
      v !== null &&
      v !== "" &&
      (typeof v === "number" ||
        (typeof v === "string" && Number.isFinite(Number(v))));
    const unit = String(control.attributes.unit_of_measurement || "");
    return [
      {
        control,
        name: control.name,
        value: control.state,
        numeric:
          control.domain !== "binary_sensor" &&
          (numeric(control.state) || !!unit),
        unit,
      },
      ...Object.entries(control.attributes)
        .filter(
          ([key, value]) =>
            !excluded.test(key) &&
            (typeof value === "number" ||
              typeof value === "boolean" ||
              (key in labels && typeof value === "string")),
        )
        .map(([attribute, value]) => ({
          control,
          attribute,
          name:
            labels[attribute]?.[lang === "en" ? 1 : 0] ||
            attribute.replaceAll("_", " "),
          value,
          numeric: numeric(value),
          unit: attribute.includes("temperature")
            ? String(control.attributes.temperature_unit || "")
            : /humidity|battery|percentage|position/.test(attribute)
              ? "%"
              : "",
        })),
    ];
  });
}
export function deviceFeatureStep(
  feature: DeviceFeature,
  kind: Exclude<FlowKind, "actions">,
) {
  const base = {
    entity_id: feature.control.entity_id,
    ...(feature.attribute ? { attribute: feature.attribute } : {}),
  };
  if (feature.numeric)
    return {
      ...base,
      [kind === "triggers" ? "trigger" : "condition"]: "numeric_state",
      above: 0,
    };
  // null means any state change (including button/event timestamps), not an invented "on" state.
  return kind === "triggers"
    ? { ...base, trigger: "state", to: null }
    : { ...base, condition: "state", state: String(feature.value ?? "") };
}

import type { Control } from "../types";

type EntityMatch = (control: Pick<Control, "domain" | "attributes">) => boolean;
export type FlowEntityScope = { label: [string, string]; matches: EntityMatch };

const binary =
  (...classes: string[]): EntityMatch =>
  (control) =>
    control.domain === "binary_sensor" &&
    classes.includes(String(control.attributes.device_class));

const measurement =
  (deviceClass: string, ...units: string[]): EntityMatch =>
  (control) =>
    control.domain === "sensor" &&
    (control.attributes.device_class === deviceClass ||
      (!control.attributes.device_class &&
        units.includes(String(control.attributes.unit_of_measurement))));

const presence: FlowEntityScope = {
  label: ["Velg person eller sporingsenhet", "Choose a person or tracker"],
  matches: (control) => ["person", "device_tracker"].includes(control.domain),
};
const motion: FlowEntityScope = {
  label: ["Velg bevegelsessensor", "Choose a motion sensor"],
  matches: binary("motion", "occupancy", "presence"),
};
const door: FlowEntityScope = {
  label: ["Velg dørsensor", "Choose a door sensor"],
  matches: binary("door", "garage_door", "opening"),
};
const temperature: FlowEntityScope = {
  label: ["Velg temperaturmåler", "Choose a temperature sensor"],
  matches: measurement("temperature", "°C", "°F", "K"),
};
const humidity: FlowEntityScope = {
  label: ["Velg luftfuktighetsmåler", "Choose a humidity sensor"],
  matches: measurement("humidity"),
};
const power: FlowEntityScope = {
  label: ["Velg effektmåler", "Choose a power sensor"],
  matches: measurement("power", "W", "kW", "MW"),
};
const battery: FlowEntityScope = {
  label: ["Velg batterimåler", "Choose a battery sensor"],
  matches: measurement("battery"),
};

const scopes: Partial<Record<string, FlowEntityScope>> = {
  "preset:home": presence,
  "preset:away": presence,
  "preset:motion": motion,
  "preset:still": motion,
  "preset:door": door,
  "preset:closed": door,
  "preset:leak": {
    label: ["Velg lekkasjesensor", "Choose a leak sensor"],
    matches: binary("moisture"),
  },
  "preset:smoke": {
    label: ["Velg røyksensor", "Choose a smoke sensor"],
    matches: binary("smoke"),
  },
  "preset:alarm-active": {
    label: ["Velg alarm", "Choose an alarm"],
    matches: (control) => control.domain === "alarm_control_panel",
  },
  "preset:warm": temperature,
  "preset:cold": temperature,
  "preset:humidity": humidity,
  "preset:humidity-low": humidity,
  "preset:power": power,
  "preset:power-low": power,
  "preset:energy": {
    label: ["Velg energimåler", "Choose an energy sensor"],
    matches: measurement("energy", "Wh", "kWh", "MWh", "GJ"),
  },
  "preset:battery-full": battery,
  "preset:battery-low": battery,
  "preset:wind": {
    label: ["Velg vindmåler", "Choose a wind speed sensor"],
    matches: measurement("wind_speed"),
  },
  "preset:dark": {
    label: ["Velg lysmåler", "Choose a light level sensor"],
    matches: measurement("illuminance", "lx"),
  },
  "preset:co2-high": {
    label: ["Velg CO₂-måler", "Choose a CO₂ sensor"],
    matches: measurement("carbon_dioxide"),
  },
};

// Keep picker context on draft cards. HA steps with identical states, such as
// leak and motion, serialize to the same shape and must keep their native keys.
const draftScopes = new WeakMap<object, FlowEntityScope>();

export function flowEntityScope(step: unknown) {
  return step && typeof step === "object" ? draftScopes.get(step) : undefined;
}

export function withFlowEntityScope<T>(
  step: T,
  scope: string | FlowEntityScope | undefined,
): T {
  const filter = typeof scope === "string" ? scopes[scope] : scope;
  if (filter && step && typeof step === "object") draftScopes.set(step, filter);
  return step;
}

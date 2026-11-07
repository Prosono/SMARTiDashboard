import type { Control, Home } from "../types";
import { primaryDeviceControl } from "../home/deviceAppearance";

const ids = (value: unknown): string[] => [
  ...new Set(
    (Array.isArray(value) ? value : [value]).filter(
      (v): v is string => typeof v === "string" && !!v && !/[{}]/.test(v),
    ),
  ),
];
const structural = [
  "choose",
  "if",
  "repeat",
  "parallel",
  "sequence",
  "delay",
  "wait_template",
  "wait_for_trigger",
  "stop",
  "variables",
];

/** Resolve visible, explicit targets for decoration only. Never modify or evaluate a flow. */
export function flowArtworkTargets(
  row: unknown,
  home: Home,
): { control?: Control; count: number | null } {
  if (!row || typeof row !== "object" || Array.isArray(row))
    return { count: 0 };
  const step = row as Record<string, any>;
  const type = String(
    step.trigger ||
      step.platform ||
      step.condition ||
      step.action ||
      step.service ||
      "",
  );
  if (
    structural.some((key) => key in step) ||
    ["template", "and", "or", "not", "trigger"].includes(type)
  )
    return { count: 0 };
  const entities = ids(step.entity_id ?? step.target?.entity_id);
  // Device triggers also carry a physical device ID as metadata for one entity.
  const devices = ids(
    step.target?.device_id ?? (entities.length ? undefined : step.device_id),
  );
  const areas = ids(step.target?.area_id);
  const domain = String(step.domain || type.split(".")[0]);
  const representative = (controls: Control[]) => {
    const matching = controls.filter((c) => c.domain === domain);
    const candidates = matching.length ? matching : controls;
    return (
      primaryDeviceControl(
        candidates.filter(
          (c) => !c.diagnostic && c.attributes.device_class !== "battery",
        ),
      ) || primaryDeviceControl(candidates)
    );
  };
  // A mixed target can overlap or contain unseen registry members. Show "+"
  // instead of claiming an exact device count from this partial home snapshot.
  if ([entities, devices, areas].filter((group) => group.length).length > 1)
    return {
      control: representative(
        home.controls.filter(
          (c) =>
            entities.includes(c.entity_id) ||
            entities.includes(c.id) ||
            (!!c.device_id && devices.includes(c.device_id)) ||
            (!!c.area_id &&
              areas.includes(c.area_id) &&
              (domain === "homeassistant" || c.domain === domain)),
        ),
      ),
      count: null,
    };
  if (entities.length)
    return {
      control: entities
        .map((id) =>
          home.controls.find((c) => c.entity_id === id || c.id === id),
        )
        .find(Boolean),
      count: entities.length,
    };
  if (devices.length)
    return {
      control: devices
        .map((id) =>
          representative(home.controls.filter((c) => c.device_id === id)),
        )
        .find(Boolean),
      count: devices.length,
    };
  if (areas.length) {
    const candidates = home.controls.filter(
      (c) =>
        c.area_id &&
        areas.includes(c.area_id) &&
        (domain === "homeassistant" || c.domain === domain),
    );
    return { control: representative(candidates), count: candidates.length };
  }
  return { count: 0 };
}

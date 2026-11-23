export const flowRoles = ["solar", "home", "ev", "battery", "grid"] as const;
export type FlowRole = (typeof flowRoles)[number];
export type Flow = {
  watts: number | null;
  status: "ok" | "unavailable" | "stale" | "invalid" | "unconfigured";
  measured_at: string | null;
  visible: boolean;
};
export type FlowSnapshot = Record<FlowRole, Flow>;

export function isEvCharging(flow: Flow) {
  // A powered wallbox may draw a little power while the car is idle.
  return flow.visible && flow.status === "ok" && (flow.watts ?? 0) >= 100;
}

export type FlowBinding = {
  visible: boolean;
  source: string | null;
  return_source: string | null;
  positive: "supply" | "consume";
};
export type FlowPreferences = Record<FlowRole, FlowBinding> & {
  battery_level: string | null;
  max_age: number;
  animation: boolean;
};
export function noFlows(): FlowSnapshot {
  return Object.fromEntries(
    flowRoles.map((role) => [
      role,
      { watts: null, status: "unconfigured", measured_at: null, visible: true },
    ]),
  ) as FlowSnapshot;
}

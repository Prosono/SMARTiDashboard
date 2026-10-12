export type Capability = {
  kind: string;
  actions: string[];
  unit: string | null;
  minimum: number | null;
  maximum: number | null;
  step: number | null;
};
export type Control = {
  id: string;
  entity_id: string;
  device_id: string | null;
  area_id: string | null;
  name: string;
  domain: string;
  state: string;
  attributes: Record<string, unknown>;
  capabilities: Capability[];
  availability: string;
  updated_at: string | null;
  integration: string | null;
  diagnostic: boolean;
};
export type Home = {
  home_name: string;
  mode: "demo" | "live";
  connected: boolean;
  error: string | null;
  ha_version: string | null;
  last_sync: string | null;
  revision: number;
  areas: { area_id: string; name: string }[];
  devices: { id: string; availability: string }[];
  controls: Control[];
  favorites: string[];
};
export type Session = { name: string; role: "admin" | "user"; csrf: string };

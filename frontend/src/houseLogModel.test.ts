import { expect, it } from "vitest";
import {
  filterHouseLog,
  houseLogCategory,
  houseLogDays,
  houseLogMessage,
  type HouseLogEntry,
} from "./houseLogModel";
import type { Control } from "./types";

const light: Control = {
  id: "light.living",
  entity_id: "light.living",
  name: "Stuelampe",
  domain: "light",
  area_id: "living",
  attributes: {},
  device_id: null,
  state: "on",
  capabilities: [],
  availability: "available",
  updated_at: null,
  integration: null,
  diagnostic: false,
};
const door: Control = {
  ...light,
  entity_id: "binary_sensor.door",
  name: "Ytterdør",
  domain: "binary_sensor",
  area_id: "hall",
  attributes: { device_class: "door" },
};
const controls = new Map([light, door].map((c) => [c.entity_id, c]));
const entry = (patch: Partial<HouseLogEntry> = {}): HouseLogEntry => ({
  when: "2026-11-09T12:00:00Z",
  entity_id: light.entity_id,
  name: null,
  state: "on",
  message: null,
  context_name: null,
  context_entity_id: null,
  ...patch,
});
const filter = { text: "", area: "", category: "" };

it("orders events newest first without mutating, deduplicating or inventing missing entries", () => {
  const first = entry({ when: "2026-11-09T11:00:00Z" });
  const later = entry();
  const unknown = entry({ when: "invalid", entity_id: "removed.source" });
  const original = [first, later, later, unknown];
  expect(filterHouseLog(original, controls, filter, "nb")).toEqual([
    later,
    later,
    first,
    unknown,
  ]);
  expect(original).toEqual([first, later, later, unknown]);
});
it("searches native messages, recorded sources, device names, ids and translated states", () => {
  const lamp = entry({
    message: "Lysstyrke endret til 50 %",
    context_name: "Kveldslys",
    context_entity_id: "automation.evening",
  });
  const open = entry({ entity_id: door.entity_id });
  for (const text of [
    "LYSSTYRKE",
    "kveldslys",
    "light.living",
    "automation.evening",
    "stuelampe",
  ])
    expect(
      filterHouseLog([lamp, open], controls, { ...filter, text }, "nb"),
    ).toEqual([lamp]);
  expect(
    filterHouseLog([lamp, open], controls, { ...filter, text: "åpen" }, "nb"),
  ).toEqual([open]);
  expect(
    filterHouseLog([lamp, open], controls, { ...filter, text: "open" }, "en"),
  ).toEqual([open]);
});
it("filters the loaded events by actual room and category, retaining removed sources in the unfiltered view", () => {
  const lamp = entry(),
    open = entry({ entity_id: door.entity_id }),
    removed = entry({ entity_id: "light.removed" });
  expect(
    filterHouseLog(
      [lamp, open, removed],
      controls,
      { ...filter, area: "hall" },
      "nb",
    ),
  ).toEqual([open]);
  expect(
    filterHouseLog(
      [lamp, open, removed],
      controls,
      { ...filter, category: "lights" },
      "nb",
    ),
  ).toEqual([lamp, removed]);
  expect(
    filterHouseLog(
      [lamp, open, removed],
      controls,
      { ...filter, area: "living", category: "security" },
      "nb",
    ),
  ).toEqual([]);
});
it("classifies the subject rather than implying that its recorded source executed an automation", () => {
  const lamp = entry({
    context_entity_id: "automation.evening",
    context_name: "Kveldslys",
  });
  expect(houseLogCategory(lamp, light)).toBe("lights");
  expect(houseLogCategory(entry({ entity_id: "automation.evening" }))).toBe(
    "automations",
  );
  expect(houseLogCategory(entry({ entity_id: door.entity_id }), door)).toBe(
    "security",
  );
  expect(
    houseLogCategory(entry({ entity_id: "sensor.temp" }), {
      ...light,
      domain: "sensor",
      attributes: { device_class: "temperature" },
    }),
  ).toBe("climate");
  expect(houseLogCategory(entry({ entity_id: null }))).toBe("other");
  expect(houseLogMessage(lamp, light, "nb")).toBe("På");
  expect(
    houseLogMessage(
      entry({ message: "Original melding", state: "off" }),
      light,
      "en",
    ),
  ).toBe("Original melding");
  expect(houseLogMessage(entry({ state: null }), undefined, "nb")).toBe(
    "Aktivitet registrert",
  );
});
it("groups local calendar dates through Oslo midnight and the repeated autumn hour", () => {
  const rows = [
    entry({ when: "2026-10-25T23:00:00Z" }),
    entry({ when: "2026-10-25T01:30:00Z" }),
    entry({ when: "2026-10-25T00:30:00Z" }),
    entry({ when: "2026-10-24T21:59:00Z" }),
    entry({ when: "invalid" }),
  ];
  const days = houseLogDays(rows, "nb", "Europe/Oslo");
  expect(days.map((day) => day.entries.length)).toEqual([1, 2, 1, 1]);
  expect(days[0].title).toContain("26. oktober 2026");
  expect(days[1].title).toContain("25. oktober 2026");
  expect(days[3].title).toBe("Ukjent dato");
  expect(days.flatMap((day) => day.entries)).toEqual(rows);
});

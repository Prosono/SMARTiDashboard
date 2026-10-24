import { describe, it, expect } from "vitest";
import { flowLibrary, newFlowStep } from "./flowLibrary";
import { flowPresets } from "./flowPresets";
describe("flow suggestions", () => {
  it("distinguishes sunrise events from daylight requirements", () => {
    expect(newFlowStep("triggers", "preset:sunrise")).toEqual({
      trigger: "sun",
      event: "sunrise",
    });
    expect(newFlowStep("conditions", "preset:daylight")).toEqual({
      condition: "sun",
      after: "sunrise",
      before: "sunset",
    });
  });
  it("keeps power and energy as explicit sensor choices", () => {
    for (const id of ["power", "energy", "warm", "motion", "charging"]) {
      expect(newFlowStep("triggers", `preset:${id}`).entity_id).toBe("");
      expect(newFlowStep("conditions", `preset:${id}`).entity_id).toBe("");
    }
  });
  it("uses native weekday requirements and independent copies", () => {
    const a = newFlowStep("conditions", "preset:weekdays");
    a.weekday.push("sat");
    expect(newFlowStep("conditions", "preset:weekdays").weekday).toHaveLength(
      5,
    );
  });
  it.each(["triggers", "conditions", "actions"] as const)(
    "has unique categorized searchable cards for %s",
    (kind) => {
      const library = flowLibrary(kind, "nb");
      expect(new Set(library.map((x) => x.id)).size).toBe(library.length);
      for (const card of library) {
        expect(card.category).toBeTruthy();
        expect(card.hint).toBeTruthy();
        expect(newFlowStep(kind, card.id)).toBeTruthy();
      }
      expect(flowPresets(kind, "en").map((x) => x.id)).toEqual(
        flowPresets(kind, "nb").map((x) => x.id),
      );
    },
  );
});

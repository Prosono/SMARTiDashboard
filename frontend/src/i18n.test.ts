import { describe, it, expect } from "vitest";
import { nb, en } from "./i18n";
describe("translations", () => {
  it("has nonempty translations for every supported key", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(nb).sort());
    for (const text of [...Object.values(en), ...Object.values(nb)])
      expect(text.trim().length).toBeGreaterThan(0);
  });
});

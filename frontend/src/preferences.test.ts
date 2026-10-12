import { afterEach, describe, expect, it, vi } from "vitest";
import { readPreference, writePreference } from "./preferences";

afterEach(() => vi.unstubAllGlobals());
describe("optional browser preferences", () => {
  it("reads only supported values and defaults when missing or invalid", () => {
    const getItem = vi
      .fn()
      .mockReturnValueOnce("dark")
      .mockReturnValueOnce(null)
      .mockReturnValueOnce("invalid");
    vi.stubGlobal("localStorage", { getItem });
    expect(readPreference("smarti-theme", "light", ["light", "dark"])).toBe(
      "dark",
    );
    expect(readPreference("smarti-theme", "light", ["light", "dark"])).toBe(
      "light",
    );
    expect(readPreference("smarti-theme", "light", ["light", "dark"])).toBe(
      "light",
    );
  });
  it("does not crash if reads are denied", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new DOMException("Blocked", "SecurityError");
      },
    });
    expect(readPreference("smarti-language", "nb", ["nb", "en"])).toBe("nb");
  });
  it("does not clear shared storage when writes exceed the quota", () => {
    const clear = vi.fn();
    const removeItem = vi.fn();
    vi.stubGlobal("localStorage", {
      clear,
      removeItem,
      setItem: () => {
        throw new DOMException("Full", "QuotaExceededError");
      },
    });
    expect(() => writePreference("smarti-theme", "dark")).not.toThrow();
    expect(clear).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
  });
  it("persists the choice when storage is available", () => {
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", { setItem });
    writePreference("smarti-language", "en");
    expect(setItem).toHaveBeenCalledWith("smarti-language", "en");
  });
});

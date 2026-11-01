import { describe, expect, it } from "vitest";
import {
  ambientChoices,
  ambientConfig,
  ambientSize,
  clockDetails,
  clockZone,
  compass,
  daylightSegments,
  type Sky,
  moonShape,
  skyPath,
  skyX,
  skyY,
} from "./ambientModel";

describe("time and sky cards", () => {
  it("uses the home's calendar date, ISO week and leap-year lengths across year boundaries", () => {
    const clock = clockDetails(
      Date.parse("2026-12-31T23:59:58Z"),
      "Asia/Tokyo",
      "en",
    );
    expect(clock).toMatchObject({
      year: 2027,
      month: 1,
      day: 1,
      hour: 8,
      minute: 59,
      seconds: "58",
      week: 53,
      dayOfYear: 1,
      daysInYear: 365,
    });
    expect(
      clockDetails(Date.parse("2024-02-29T12:00Z"), "UTC", "en"),
    ).toMatchObject({ dayOfYear: 60, daysInYear: 366 });
  });
  it("handles repeated DST hours and distinguishes midnight/noon in 12-hour format", () => {
    const a = clockDetails(
        Date.parse("2026-10-25T00:30Z"),
        "Europe/Oslo",
        "en",
      ),
      b = clockDetails(Date.parse("2026-10-25T01:30Z"), "Europe/Oslo", "en");
    expect(a.time).toBe("02:30");
    expect(b.time).toBe("02:30");
    expect(a.zoneName).not.toBe(b.zoneName);
    const midnight = clockDetails(
        Date.parse("2026-11-01T00:05Z"),
        "UTC",
        "en",
        "12h",
      ),
      noon = clockDetails(Date.parse("2026-11-01T12:05Z"), "UTC", "en", "12h");
    expect(midnight.time).toBe("12:05");
    expect(noon.time).toBe("12:05");
    expect(midnight.period).not.toBe(noon.period);
    expect(
      clockDetails(Date.parse("2026-11-01T00:05Z"), "UTC", "en").time,
    ).toBe("00:05");
    expect(clockZone("Invalid/Zone").home).toBe(false);
    expect(clockZone("Europe/Oslo")).toEqual({
      zone: "Europe/Oslo",
      home: true,
    });
  });
  it("offers all seven source-less designs and gives the horizon a horizontal default size", () => {
    expect(ambientChoices).toHaveLength(7);
    for (const choice of ambientChoices) {
      const config = ambientConfig(choice.id);
      expect(config.sources).toEqual([]);
      expect(config.type).toBe(choice.type);
    }
    expect(ambientSize(ambientConfig("horizon"))).toEqual({ w: 2, h: 3 });
  });
  it("plots altitude relative to the horizon and breaks paths at north or invalid samples", () => {
    expect(skyY(0)).toBe(112);
    expect(skyY(90)).toBe(32);
    expect(skyY(-90)).toBe(192);
    expect(skyX(0)).toBe(34);
    expect(skyX(360)).toBe(566);
    expect(compass(90, "nb")).toBe("Ø");
    expect(compass(270, "en")).toBe("W");
    expect(compass(-45, "nb")).toBe("NV");
    const path = skyPath([
      { azimuth: 350, altitude: 10 },
      { azimuth: 359, altitude: 12 },
      { azimuth: 1, altitude: 13 },
      { azimuth: NaN, altitude: 20 },
      { azimuth: 10, altitude: -5 },
    ]);
    expect(path.match(/M/g)).toHaveLength(3);
    expect(path).not.toContain("NaN");
  });
  it("draws new, quarter and full moon illumination without inventing surface values", () => {
    const area = (phase: number) => {
      const points = [
        ...moonShape(phase).matchAll(/[ML]([\d.e+-]+),([\d.e+-]+)/g),
      ].map((match) => [Number(match[1]), Number(match[2])]);
      return (
        Math.abs(
          points.reduce((sum, [x, y], i) => {
            const [nx, ny] = points[(i + 1) % points.length];
            return sum + x * ny - nx * y;
          }, 0),
        ) / 2
      );
    };
    expect(area(0)).toBeCloseTo(0, 5);
    expect(area(1)).toBeCloseTo(0, 5);
    expect(area(0.5)).toBeGreaterThan(Math.PI * 40 * 40 * 0.99);
    expect(area(0.25)).toBeCloseTo(area(0.5) / 2, 3);
    expect(area(0.75)).toBeCloseTo(area(0.25), 3);
  });
  it("shows the actual daylight window, including midnight crossings, polar states and DST days", () => {
    const day = {
      date: "2026-10-25",
      start: "2026-10-24T22:00Z",
      end: "2026-10-25T23:00Z",
    };
    const sun = {
      state: "normal",
      rise: "2026-10-25T04:15Z",
      set: "2026-10-25T16:45Z",
    } as Sky["sun"];
    expect(daylightSegments(day, sun)).toEqual([[25, 75]]);
    expect(
      daylightSegments(day, { ...sun!, rise: sun!.set, set: sun!.rise }),
    ).toEqual([
      [0, 25],
      [75, 100],
    ]);
    expect(daylightSegments(day, { ...sun!, set: null })).toEqual([[25, 100]]);
    expect(daylightSegments(day, { ...sun!, rise: null })).toEqual([[0, 75]]);
    expect(daylightSegments(day, { ...sun!, state: "always_up" })).toEqual([
      [0, 100],
    ]);
    expect(daylightSegments(day, { ...sun!, state: "always_down" })).toEqual(
      [],
    );
    expect(daylightSegments(null, sun)).toEqual([]);
    expect(skyX(360, 300)).toBe(266);
    expect(skyY(-90, 300)).toBe(272);
  });
});

import { expect, it } from "vitest";
import {
  comparisonChange,
  priceSummary,
  reportCalendarSpan,
  reportCSV,
  reportDuration,
  reportValue,
  shiftReportDay,
} from "./reportModel";

it("preserves zero and negative readings and never turns missing/invalid readings into zero", () => {
  for (const missing of [
    null,
    undefined,
    "",
    " ",
    true,
    false,
    NaN,
    Infinity,
    "unavailable",
    [],
    {},
  ])
    expect(reportValue(missing)).toBeNull();
  expect(reportValue(0)).toBe(0);
  expect(reportValue("-3.5")).toBe(-3.5);
  expect(reportDuration(0)).toBe("0 t 0 min");
  expect(reportDuration(null)).toBe("—");
});
it("covers only the Oslo calendar days touched before the end, including DST days", () => {
  expect(
    reportCalendarSpan("2026-10-19T22:00:00Z", "2026-10-22T22:00:00Z"),
  ).toEqual({ from: "2026-10-20", to: "2026-10-22", end: "2026-10-23" });
  expect(
    reportCalendarSpan("2026-10-24T22:00:00Z", "2026-10-25T23:00:00Z"),
  ).toEqual({ from: "2026-10-25", to: "2026-10-25", end: "2026-10-26" });
  expect(shiftReportDay("2026-03-29", 1)).toBe("2026-03-30");
});
it("compares only complete periods with a nonzero previous baseline", () => {
  expect(comparisonChange(0, 20, true)).toBe(-100);
  expect(comparisonChange(40, 20, true)).toBe(100);
  expect(comparisonChange(40, 20, false)).toBeNull();
  expect(comparisonChange(40, 0, true)).toBeNull();
  expect(comparisonChange(null, 20, true)).toBeNull();
});
it("weights prices by interval duration and preserves negative and zero prices", () => {
  const result = priceSummary([
    {
      time_start: "2026-10-25T00:00:00Z",
      time_end: "2026-10-25T01:00:00Z",
      NOK_per_kWh: -0.2,
    },
    {
      time_start: "2026-10-25T01:00:00Z",
      time_end: "2026-10-25T01:15:00Z",
      NOK_per_kWh: 0,
    },
    {
      time_start: "2026-10-25T01:15:00Z",
      time_end: "2026-10-25T01:45:00Z",
      NOK_per_kWh: 0.6,
    },
    { time_start: "bad", time_end: "bad", NOK_per_kWh: 1000 },
  ]);
  expect(result.hours).toBe(1.75);
  expect(result.average).toBeCloseTo((100 * 0.1) / 1.75);
  expect(result.low).toBe(-20);
  expect(result.high).toBe(60);
  expect(priceSummary([]).average).toBeNull();
});
it("exports raw values, missing fields and quoted names without spreadsheet formula execution", () => {
  const csv = reportCSV([
    [
      '=HYPERLINK("x")',
      0,
      null,
      -2.5,
      "-0.12",
      "\t=1+1",
      'Stue, "øst"\nEtasje 2',
    ],
  ]);
  expect(csv).toContain('"\'=HYPERLINK(""x"")"');
  expect(csv).toContain('"0","","-2.5","-0.12"');
  expect(csv).toContain('"\'\t=1+1"');
  expect(csv).toContain('"Stue, ""øst""\nEtasje 2"');
});

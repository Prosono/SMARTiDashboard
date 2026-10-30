import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HarmonyTrend } from "./HarmonyTrend";

it("preserves recorder gaps, uses real timestamps and exposes the measured range", () => {
  const html = renderToStaticMarkup(
    <HarmonyTrend
      label="Temperatur"
      unit="°C"
      lang="nb"
      points={[
        { time: "2026-10-30T08:00:00Z", value: 18 },
        { time: "2026-10-30T09:00:00Z", value: 20 },
        { time: "2026-10-30T10:00:00Z", value: null },
        { time: "2026-10-30T12:00:00Z", value: 22 },
        { time: "2026-10-30T13:00:00Z", value: 21 },
      ]}
    />,
  );
  expect(html).toContain("Målt spenn: 18–22 °C");
  // Separate line and area segments, with no line across the missing period.
  expect(html.match(/<g>/g)).toHaveLength(2);
  expect(html.match(/fill="none" stroke="currentColor"/g)).toHaveLength(2);
  expect(html).not.toContain("NaN");
});

it("renders a single reading honestly and refuses nonfinite or dateless values", () => {
  const single = renderToStaticMarkup(
    <HarmonyTrend
      label="Power"
      unit="W"
      lang="en"
      points={[{ time: "2026-10-30T08:00:00Z", value: 0 }]}
    />,
  );
  expect(single).toContain("Recorded range: 0–0 W");
  expect(single).toContain("<circle");
  expect(single).not.toContain("NaN");
  const empty = renderToStaticMarkup(
    <HarmonyTrend
      label="Power"
      unit="W"
      lang="en"
      points={[
        { time: "invalid", value: 2 },
        { time: "2026-10-30T08:00:00Z", value: Infinity },
        { time: "2026-10-30T09:00:00Z", value: null },
      ]}
    />,
  );
  expect(empty).toBe("");
});

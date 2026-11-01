import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HistoryChart, type HistoryData } from "./ControlHistory";
import type { Control } from "./types";

const control: Control = {
  id: "sensor.reading",
  entity_id: "sensor.reading",
  domain: "sensor",
  name: "Reading",
  state: "2",
  attributes: {},
  capabilities: [],
  device_id: null,
  area_id: null,
  availability: "available",
  updated_at: null,
  integration: null,
  diagnostic: false,
};
const data: HistoryData = {
  start: "2026-11-01T00:00:00Z",
  end: "2026-11-01T02:00:00Z",
  samples: 3,
  minimum: 0,
  maximum: 2,
  unit: "°C",
  points: [0, null, 2].map((value, i) => ({
    time: `2026-11-01T0${i}:00:00Z`,
    state: value === null ? "unavailable" : String(value),
    value,
  })),
};

it.each(["sensor", "binary_sensor"])(
  "keeps nonnumeric %s history as an inspectable state timeline",
  (domain) => {
    const html = renderToStaticMarkup(
      <HistoryChart
        data={{
          ...data,
          points: data.points.map((p, i) => ({
            ...p,
            value: null,
            state: i === 0 ? "on" : "off",
          })),
        }}
        control={{ ...control, domain }}
        lang="en"
      />,
    );
    expect(html).toContain('class="control-history-legend"');
    expect(html).toContain('tabindex="0"');
    expect(html.match(/<rect /g)).toHaveLength(3);
    expect(html).not.toContain("measured-chart");
    expect(html).not.toContain("NaN");
  },
);

it("uses the new numeric history renderer for a real zero while preserving the missing sample", () => {
  const html = renderToStaticMarkup(
    <HistoryChart data={data} control={control} lang="en" />,
  );
  expect(html).toContain("Recorded range: 0–2 °C");
  expect(html.match(/class="measured-chart-line"/g)).toHaveLength(2);
  expect(html).not.toContain("control-history-legend");
  expect(html).not.toContain("NaN");
});

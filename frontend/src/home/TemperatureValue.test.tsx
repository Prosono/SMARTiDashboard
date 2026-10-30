import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TemperatureValue } from "./TemperatureValue";

it("formats real temperatures with a separate unit and localized decimal", () => {
  const html = renderToStaticMarkup(
    <TemperatureValue value={-3.5} unit="°C" lang="nb" />,
  );
  expect(html).toContain('aria-label="−3,5 °C"');
  expect(html).toContain('data-temperature-tone="cool"');
  expect(html).toContain('class="temperature-fraction"');
  expect(html).toContain('class="temperature-unit"');
  expect(
    renderToStaticMarkup(<TemperatureValue value={0} unit="°F" lang="en" />),
  ).toContain('aria-label="0 °F"');
});
it("never presents a missing or nonfinite value as a current temperature", () => {
  for (const value of [null, NaN, Infinity]) {
    const html = renderToStaticMarkup(
      <TemperatureValue value={value} lang="nb" />,
    );
    expect(html).toContain('aria-label="Ingen temperaturmåling"');
    expect(html).not.toContain('class="temperature-unit"');
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("Infinity");
  }
});

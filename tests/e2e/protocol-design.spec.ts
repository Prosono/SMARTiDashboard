import { test, expect } from "../../frontend/node_modules/@playwright/test";
test("radio overview counts real states, searches manufacturers and sorts devices", async ({
  page,
}) => {
  const devices = [
    {
      id: "z",
      name: "Stuelampe",
      manufacturer: "IKEA",
      model: "TRÅDFRI",
      status: "online",
      removable: true,
      lqi: 185,
    },
    {
      id: "c",
      name: "Koordinator",
      manufacturer: "SMLIGHT",
      model: "SLZB",
      status: "online",
      controller: true,
      removable: false,
    },
    {
      id: "b",
      name: "Dørsensor",
      manufacturer: "Aqara",
      model: "Contact",
      status: "unknown",
      removable: true,
    },
    {
      id: "a",
      name: "Bevegelse",
      manufacturer: "Fibaro",
      model: "Motion",
      status: "asleep",
      removable: true,
    },
  ];
  await page.route("**/api/devices/zigbee2mqtt", (r) =>
    r.fulfill({ json: { status: "ready", devices } }),
  );
  await page.route("**/api/devices/zwave_js", (r) =>
    r.fulfill({ json: { status: "ready", devices } }),
  );
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Enheter", exact: true })
    .click();
  await page.getByRole("button", { name: "Zigbee", exact: true }).click();
  await expect(page.locator(".protocol-stats dd")).toHaveText([
    "2",
    "0",
    "1",
    "1",
  ]);
  await expect(page.locator(".protocol-row").first()).toContainText(
    "Bevegelse",
  );
  await page.getByRole("textbox", { name: "Søk i nettverket" }).fill("aqara");
  await expect(page.locator(".protocol-row")).toHaveCount(1);
  await expect(page.locator(".protocol-row")).toContainText("Dørsensor");
  await expect(page.locator(".protocol-stats dd")).toHaveText([
    "2",
    "0",
    "1",
    "1",
  ]);
  await page.getByRole("textbox", { name: "Søk i nettverket" }).fill("");
  await page
    .getByRole("combobox", { name: "Sorter enheter" })
    .selectOption("manufacturer");
  await expect(page.locator(".protocol-row").first()).toContainText(
    "Dørsensor",
  );
  await page.screenshot({
    path: `test-results/protocol-design-${test.info().project.name}.png`,
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Z-Wave", exact: true }).click();
  await expect(page.locator(".protocol-devices")).toHaveAttribute(
    "data-protocol",
    "zwave_js",
  );
  await page.evaluate(() =>
    document.documentElement.setAttribute("data-theme", "dark"),
  );
  await page.screenshot({
    path: `test-results/protocol-design-dark-${test.info().project.name}.png`,
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

import { test, expect } from "../../frontend/node_modules/@playwright/test";
test("climate overview filters and opens real room controls", async ({
  page,
}) => {
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
  await page.locator(".device-toolbar select").selectOption("climate");
  const climate = page.locator(".climate-overview");
  await expect(
    climate.getByRole("heading", { name: "Klima", exact: true }),
  ).toBeVisible();
  await expect(climate.locator(".climate-room-card").first()).toBeVisible();
  await climate.getByLabel("Søk i klima").fill("finnesikke");
  await expect(climate.locator(".climate-room-card")).toHaveCount(0);
  await climate.getByLabel("Søk i klima").fill("");
  await climate.getByRole("button", { name: "Liste", exact: true }).click();
  await expect(climate.locator(".climate-room-grid")).toHaveClass(/is-list/);
  await climate.getByRole("button", { name: "Kort", exact: true }).click();
  const adjust = climate.locator(".climate-quick-temperature").first();
  const before = Number(
    (await adjust.locator("strong").innerText())
      .replace(",", ".")
      .replace(/[^0-9.]/g, ""),
  );
  const request = page.waitForRequest(
    (r) => r.method() === "POST" && r.url().includes("climate.living/commands"),
  );
  await climate
    .getByRole("button", { name: "Øk temperatur Gulvvarme", exact: true })
    .click();
  expect((await request).postDataJSON()).toEqual({
    action: "set_temperature",
    value: before + 0.5,
  });
  await expect(adjust.locator("strong")).not.toHaveText(`${before} °C`);
  await climate
    .getByRole("button", { name: "Åpne klima for Stue", exact: true })
    .click();
  await expect(page.getByRole("dialog").locator(".thermostat")).toBeVisible();
  await page
    .getByRole("button", { name: "Lukk innstillinger", exact: true })
    .click();
  await climate
    .getByRole("button", { name: "Ventilasjon", exact: true })
    .click();
  await expect(climate.locator(".climate-empty")).toBeVisible();
  await climate.getByRole("button", { name: "Oversikt", exact: true }).click();
  expect(
    await climate.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBeTruthy();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Rom", exact: true })
    .click();
  const rooms = page.locator(".rooms-overview");
  await expect(rooms.locator(".room-summary-card")).toHaveCount(4);
  await rooms.getByLabel("Søk etter rom", { exact: true }).fill("Stue");
  await expect(rooms.locator(".room-summary-card")).toHaveCount(1);
  await rooms.getByLabel("Søk etter rom", { exact: true }).fill("");
  await page.screenshot({
    path: `../artifacts/rooms-${test.info().project.name}.png`,
    fullPage: true,
  });
  await rooms.locator(".room-summary-card").filter({ hasText: "Stue" }).click();
  await expect(page.locator(".room-detail")).toBeVisible();
  await page
    .locator(".room-switcher")
    .getByRole("button", { name: "Alle rom", exact: true })
    .click();
  await expect(rooms).toBeVisible();
  expect(
    await rooms.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBeTruthy();
  await page.screenshot({
    path: `../artifacts/climate-${test.info().project.name}.png`,
    fullPage: true,
  });
});

for (const step of [0.1, 0.5, 1]) {
  test(`temperature controls preserve device step ${step}`, async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
    await page.getByLabel("Passord", { exact: true }).fill("test-password-not-for-live");
    await page.getByRole("button", { name: "Logg inn", exact: true }).click();
    await expect(page.locator(".home-welcome")).toBeVisible();
    await page.route("**/api/home", async (route) => {
      const response = await route.fetch();
      const home = await response.json();
      for (const control of home.controls) {
        if (control.entity_id !== "climate.living") continue;
        control.attributes.temperature = 21;
        control.attributes.target_temp_step = step;
        control.attributes.current_temperature = 20.1;
        for (const capability of control.capabilities) {
          if (capability.actions.includes("set_temperature")) capability.step = step;
        }
      }
      await route.fulfill({ json: home });
    });
    const values: number[] = [];
    await page.route("**/controls/climate.living/commands", async (route) => {
      values.push(route.request().postDataJSON().value);
      await route.fulfill({ json: { status: "accepted_unconfirmed" } });
    });
    await page.reload();
    await page.getByRole("navigation").getByRole("button", { name: "Enheter", exact: true }).click();
    await page.locator(".device-toolbar select").selectOption("climate");
    const climate = page.locator(".climate-overview");
    await climate.getByRole("button", { name: "Øk temperatur Gulvvarme", exact: true }).click();
    await expect.poll(() => values).toEqual([21 + step]);
    await climate.getByRole("button", { name: "Åpne klima for Stue", exact: true }).click();
    const thermostat = page.getByRole("dialog").locator(".thermostat");
    await thermostat.getByRole("button", { name: "Gulvvarme: Ønsket temperatur −", exact: true }).click();
    await expect.poll(() => values).toEqual([21 + step, 21 - step]);
  });
}

test("thermostat modes use device options and send the selected mode", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page.getByLabel("Passord", { exact: true }).fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await page.getByRole("navigation").getByRole("button", { name: "Enheter", exact: true }).click();
  await page.locator(".device-toolbar select").selectOption("climate");
  await page.getByRole("button", { name: "Åpne klima for Stue", exact: true }).click();
  const select = page.getByRole("dialog").getByRole("combobox", { name: "Gulvvarme: Modus" });
  await expect(select.locator("option")).toHaveText(["Av", "Varme", "Auto"]);
  const request = page.waitForRequest(r => r.method() === "POST" && r.url().includes("climate.living/commands"));
  await select.selectOption("auto");
  expect((await request).postDataJSON()).toEqual({ action: "set_hvac_mode", hvac_mode: "auto", confirmed: false });
  await expect(select).toHaveValue("auto");
  await page.getByRole("dialog").screenshot({ path: `/tmp/smarti-thermostat-mode-${test.info().project.name}.png` });
});

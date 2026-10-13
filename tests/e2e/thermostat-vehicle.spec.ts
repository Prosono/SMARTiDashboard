import { test, expect } from "../../frontend/node_modules/@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await expect(page.locator(".home-welcome")).toBeVisible();
});
test("thermostat arc adjusts actual setpoint and respects offline state", async ({
  page,
}) => {
  const card = page.locator("article").filter({
    has: page.getByRole("heading", { name: "Gulvvarme", exact: true }),
  });
  await expect(card.locator(".thermostat")).toHaveAttribute(
    "data-tone",
    "heat",
  );
  await card
    .getByRole("button", {
      name: "Gulvvarme: Ønsket temperatur +",
      exact: true,
    })
    .click();
  await expect(card.locator(".thermostat-target strong")).toContainText("22,5");
  await card
    .getByRole("button", {
      name: "Gulvvarme: Ønsket temperatur −",
      exact: true,
    })
    .click();
  await expect(card.locator(".thermostat-target strong")).toHaveText("22°C");
  await card.screenshot({
    path: `../artifacts/${test.info().project.name}-thermostat.png`,
  });
  const home = await (await page.request.get("/api/home")).json();
  for (const state of ["cool", "off"]) {
    await page.route("**/api/home", (r) =>
      r.fulfill({
        json: {
          ...home,
          controls: home.controls.map((c: any) =>
            c.domain === "climate"
              ? {
                  ...c,
                  state,
                  attributes: {
                    ...c.attributes,
                    hvac_action: state === "cool" ? "cooling" : "off",
                    temperature: 30,
                  },
                }
              : c,
          ),
        },
      }),
    );
    await page.reload();
    await expect(card.locator(".thermostat")).toHaveAttribute(
      "data-tone",
      state,
    );
    await expect(
      card.getByRole("button", {
        name: "Gulvvarme: Ønsket temperatur +",
        exact: true,
      }),
    ).toBeDisabled();
  }
  await page.route("**/api/home", (r) =>
    r.fulfill({ json: { ...home, connected: false } }),
  );
  await page.reload();
  await expect(
    card.getByRole("button", {
      name: "Gulvvarme: Ønsket temperatur −",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(card.locator(".thermostat")).toHaveAttribute("data-tone", "off");
});
test("EV setup displays explicit readings and confirms charging commands", async ({
  page,
}) => {
  const home = await (await page.request.get("/api/home")).json();
  const c = (
    id: string,
    name: string,
    state: string,
    unit: string,
    domain = "sensor",
  ) => ({
    id,
    entity_id: id,
    name,
    state,
    domain,
    device_id: "ev",
    area_id: null,
    diagnostic: false,
    availability: "available",
    attributes: { unit_of_measurement: unit },
    capabilities:
      domain === "switch"
        ? [{ kind: "power", actions: ["turn_on", "turn_off"] }]
        : [],
  });
  const controls = [
    c("sensor.ev_battery", "Bilbatteri", "74", "%"),
    c("sensor.ev_range", "Rekkevidde bil", "280", "km"),
    c("sensor.ev_power", "Ladeeffekt bil", "7.4", "kW"),
    c("switch.charger", "Ladebryter", "off", "", "switch"),
  ];
  await page.route("**/api/home", (r) =>
    r.fulfill({ json: { ...home, controls: [...home.controls, ...controls] } }),
  );
  let pref: any = {
    name: "Elbil & lader",
    battery: null,
    range: null,
    power: null,
    energy: null,
    status: null,
    switch: null,
  };
  await page.route("**/api/home/vehicle", (r) => {
    if (r.request().method() === "PUT") pref = r.request().postDataJSON();
    return r.fulfill({ json: pref });
  });
  let commands = 0;
  await page.route("**/api/controls/switch.charger/commands", (r) => {
    commands++;
    expect(r.request().postDataJSON().action).toBe("turn_on");
    return r.fulfill({ json: { status: "accepted_unconfirmed" } });
  });
  await page.reload();
  await page.getByRole("tab", { name: "Energi", exact: true }).click();
  const ev = page.getByRole("region", { name: "Elbil og lader" });
  await expect(ev).toContainText("Bilen får sin egen plass");
  await ev.getByRole("button", { name: "Velg målepunkter" }).click();
  for (const [label, value] of [
    ["Batterinivå", "sensor.ev_battery"],
    ["Rekkevidde", "sensor.ev_range"],
    ["Ladeeffekt", "sensor.ev_power"],
    ["Bryter for lading", "switch.charger"],
  ]) {
    await ev.getByLabel(label, { exact: true }).selectOption(value);
  }
  await ev.getByRole("button", { name: "Lagre", exact: true }).click();
  await expect(ev.locator(".vehicle-battery")).toContainText("74");
  await expect(ev).toContainText("280");
  await expect(ev).toContainText("7,4");
  expect(commands).toBe(0);
  page.once("dialog", (d) => d.dismiss());
  await ev.getByRole("button", { name: "Slå på ladebryter" }).click();
  expect(commands).toBe(0);
  page.once("dialog", (d) => d.accept());
  await ev.getByRole("button", { name: "Slå på ladebryter" }).click();
  await expect(ev.getByRole("status")).toContainText(
    "Venter på bekreftet status",
  );
  expect(commands).toBe(1);
  await ev.screenshot({
    path: `../artifacts/${test.info().project.name}-vehicle.png`,
  });
  await page.reload();
  await page.getByRole("tab", { name: "Energi", exact: true }).click();
  await expect(ev.locator(".vehicle-battery")).toContainText("74");
});

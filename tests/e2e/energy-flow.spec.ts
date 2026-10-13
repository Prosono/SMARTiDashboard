import { test, expect } from "../../frontend/node_modules/@playwright/test";
test("3D flow configuration, live directions, offline state and persistence", async ({
  page,
}) => {
  let pref: any = {
    solar: {
      visible: true,
      source: null,
      return_source: null,
      positive: "supply",
    },
    home: {
      visible: true,
      source: null,
      return_source: null,
      positive: "supply",
    },
    ev: {
      visible: true,
      source: null,
      return_source: null,
      positive: "supply",
    },
    battery: {
      visible: true,
      source: null,
      return_source: null,
      positive: "consume",
    },
    grid: {
      visible: true,
      source: null,
      return_source: null,
      positive: "supply",
    },
    battery_level: null,
    max_age: 300,
    animation: true,
  };
  let online = true;
  await page.route("**/api/home/energy-flow/preferences", (r) => {
    if (r.request().method() === "PUT") pref = r.request().postDataJSON();
    return r.fulfill({ json: pref });
  });
  await page.route("**/api/home/energy-flow/live", (r) =>
    r.fulfill({
      json: {
        connected: online,
        sampled_at: new Date().toISOString(),
        battery_level: 74,
        flows: Object.fromEntries(
          ["solar", "home", "ev", "battery", "grid"].map((role) => [
            role,
            {
              watts: !online
                ? null
                : pref[role].source
                  ? (
                      {
                        solar: 4300,
                        home: 1700,
                        ev: 3200,
                        battery: -900,
                        grid: -500,
                      } as any
                    )[role]
                  : null,
              status: !online
                ? "unavailable"
                : pref[role].source
                  ? "ok"
                  : "unconfigured",
              visible: pref[role].visible,
              measured_at: new Date().toISOString(),
            },
          ]),
        ),
      },
    }),
  );
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await expect(page.locator(".home-welcome")).toBeVisible();
  const base = await (await page.request.get("/api/home")).json();
  const sensor = {
    ...base.controls.find((c: any) => c.domain === "sensor"),
    id: "sensor.test_power",
    entity_id: "sensor.test_power",
    name: "Effektmåler",
    state: "4300",
    domain: "sensor",
    attributes: { unit_of_measurement: "W", device_class: "power" },
    availability: "available",
  };
  await page.route("**/api/home", (r) =>
    r.fulfill({ json: { ...base, controls: [...base.controls, sensor] } }),
  );
  await page.reload();
  await page.getByRole("tab", { name: "Energi", exact: true }).click();
  const flow = page.getByRole("region", { name: "Energiflyt", exact: true });
  await expect(flow).toContainText("Gjør huset til ditt");
  await flow
    .getByRole("button", { name: "Konfigurer energiflyt", exact: true })
    .click();
  for (const label of ["Solceller", "Hjemmet", "Elbil", "Batteri", "Strømnett"])
    await flow
      .getByLabel("Effektmåler · " + label, { exact: true })
      .selectOption("sensor.test_power");
  await flow
    .getByRole("button", { name: "Lagre energiflyt", exact: true })
    .click();
  await expect(flow.locator('[data-role="grid"]')).toContainText("Til nettet");
  await expect(flow.locator('[data-role="battery"]')).toContainText(
    "Lader batteriet",
  );
  await expect(flow.locator('[data-role="solar"]')).toContainText("4,3 kW");
  await expect(flow.locator("canvas")).toBeVisible();
  // Native WebGL renderer must have allocated a non-empty drawing buffer.
  await expect
    .poll(() =>
      flow
        .locator("canvas")
        .evaluate((c: HTMLCanvasElement) => c.width * c.height),
    )
    .toBeGreaterThan(10000);
  await flow.locator("canvas").scrollIntoViewIfNeeded();
  const moving = await flow.locator("canvas").screenshot();
  await expect
    .poll(async () =>
      (await flow.locator("canvas").screenshot()).equals(moving),
    )
    .toBe(false);
  await flow.getByRole("button", { name: "Pause", exact: true }).click();
  await flow
    .getByRole("button", { name: "Drei huset mot høyre", exact: true })
    .click();
  await flow.screenshot({
    animations: "disabled",
    path: `../artifacts/${test.info().project.name}-energy-flow.png`,
  });
  await page.getByRole("button", { name: "Mørkt", exact: true }).click();
  await flow.screenshot({
    animations: "disabled",
    path: `../artifacts/${test.info().project.name}-energy-flow-dark.png`,
  });
  await flow.locator('[data-role="solar"]').click();
  await expect(flow.locator(".flow-reading-detail")).toContainText("Sist målt");
  await flow
    .getByRole("button", { name: "Konfigurer energiflyt", exact: true })
    .click();
  await flow.getByRole("checkbox", { name: "Elbil", exact: true }).uncheck();
  await flow
    .getByRole("button", { name: "Lagre energiflyt", exact: true })
    .click();
  await expect(flow.locator('[data-role="ev"]')).toHaveCount(0);
  await page.reload();
  await page.getByRole("tab", { name: "Energi", exact: true }).click();
  await expect(flow.locator('[data-role="ev"]')).toHaveCount(0);
  online = false;
  await expect(flow.locator('[data-role="grid"]')).toContainText(
    "Utilgjengelig",
    { timeout: 10000 },
  );
  await expect(flow.locator('[data-role="grid"] strong')).toHaveText("—");
});
test("3D renderer failure preserves live UI and configuration", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      type: any,
      ...args: any[]
    ) {
      if (String(type).startsWith("webgl")) return null;
      return (original as any).call(this, type, ...args);
    } as any;
  });
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await page.getByRole("tab", { name: "Energi", exact: true }).click();
  const flow = page.getByRole("region", { name: "Energiflyt", exact: true });
  await expect(flow).toContainText("3D-visningen er ikke tilgjengelig");
  await flow
    .getByRole("button", { name: "Konfigurer energiflyt", exact: true })
    .click();
  await expect(
    flow.getByRole("button", { name: "Lagre energiflyt", exact: true }),
  ).toBeVisible();
});

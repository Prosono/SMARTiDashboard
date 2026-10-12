import { test, expect } from "../../frontend/node_modules/@playwright/test";

test("protocol inventory, confirmed removal and add wizard", async ({
  page,
}) => {
  let session: any = null;
  let removed = false;
  let calls = 0;
  let diagnosticsCalls = 0;
  await page.route("**/api/setup/zigbee", (r) => {
    diagnosticsCalls++;
    return r.fulfill({ json: { transport: "frontend", online: true, info_received: true, devices_received: true, device_count: 1, error: "" } });
  });
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { name: "tester", role: "admin", csrf: "fixture" } }),
  );
  await page.route("**/api/home", (r) =>
    r.fulfill({
      json: {
        home_name: "Test",
        mode: "live",
        connected: true,
        areas: [],
        devices: [],
        controls: [],
        favorites: [],
        revision: 1,
      },
    }),
  );
  await page.route("**/api/events", (r) =>
    r.fulfill({
      contentType: "text/event-stream",
      body: 'data: {"revision":1}\n\n',
    }),
  );
  await page.route("**/api/setup/session", (r) =>
    r.fulfill({
      contentType: "application/json",
      body: JSON.stringify(session),
    }),
  );
  await page.route("**/api/devices/zigbee2mqtt", (r) =>
    r.fulfill({
      json: {
        status: "ready",
        devices: removed
          ? []
          : [
              {
                id: "lamp",
                name: "Stuelampe",
                model: "Dimbar lampe",
                status: "online",
                lqi: 185,
                sample_at: null,
                removable: true,
              },
            ],
      },
    }),
  );
  await page.route("**/api/devices/zwave_js", (r) =>
    r.fulfill({
      json: {
        status: "ready",
        devices: [
          {
            id: "zwave:2",
            name: "Dørsensor",
            status: "asleep",
            removable: true,
          },
          {
            id: "zwave:1",
            name: "Kontroller",
            status: "online",
            controller: true,
          },
        ],
      },
    }),
  );
  await page.route("**/api/devices/remove", (r) => {
    calls++;
    const body = r.request().postDataJSON();
    if (body.provider === "zigbee2mqtt") {
      removed = true;
      return r.fulfill({
        json: { status: "removed", device_name: "Stuelampe" },
      });
    }
    session = {
      id: "remove",
      operation: "remove",
      provider: "zwave_js",
      status: "searching",
      radio_open: true,
      device_name: "Dørsensor",
      expires_at: Date.now() / 1000 + 120,
    };
    return r.fulfill({ json: session });
  });
  await page.route("**/api/setup/sessions/remove/stop", (r) => {
    session = { ...session, status: "stopped", radio_open: false };
    return r.fulfill({ json: session });
  });
  await page.route("**/api/setup/providers", (r) =>
    r.fulfill({
      json: [
        { id: "zigbee2mqtt", status: "ready", entries: [] },
        {
          id: "zwave_js",
          status: "ready",
          entries: [{ id: "zwave", name: "Home" }],
        },
      ],
    }),
  );
  let power = "off";
  await page.route("**/api/devices/zigbee2mqtt/detail?*", (r) =>
    r.fulfill({
      json: {
        id: "lamp",
        name: "Stuelampe",
        model: "Dimbar lampe",
        manufacturer: "Fixture",
        status: "online",
        network_status: "ready",
        removable: true,
        firmware: "1.2.3",
        controls: [
          {
            entity_id: "light.fixture",
            name: "Lys",
            state: power,
            availability: "available",
            domain: "light",
            attributes: {},
            capabilities: [{ kind: "power", actions: ["turn_on", "turn_off"] }],
          },
        ],
      },
    }),
  );
  await page.route("**/api/controls/light.fixture/commands", (r) => {
    power = r.request().postDataJSON().action === "turn_on" ? "on" : "off";
    return r.fulfill({ json: { status: "state_updated" } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Enheter", exact: true }).click();
  await page.getByRole("button", { name: "Zigbee", exact: true }).click();
  await expect(page.getByText("LQI 185/255", { exact: false })).toBeVisible();
  await page.getByText("Zigbee-forbindelse · Tilkoblet", { exact: true }).click();
  await expect(page.getByText("Direkte til Zigbee2MQTT-serveren", { exact: true })).toBeVisible();
  const beforeCheck = diagnosticsCalls;
  await page.getByRole("button", { name: "Sjekk forbindelse" }).click();
  await expect.poll(() => diagnosticsCalls).toBeGreaterThan(beforeCheck);
  expect(calls).toBe(0);
  expect(session).toBeNull();

  await expect(page.getByText("Tilkoblet", { exact: true })).toBeVisible();
  await page.screenshot({
    path: `../artifacts/${test.info().project.name}-protocol-devices.png`,
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Stuelampe Se detaljer" }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Om enheten" }),
  ).toBeVisible();
  await expect(dialog.getByText("1.2.3")).toBeVisible();
  await dialog.getByRole("button", { name: "Slå på", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "Slå av", exact: true }),
  ).toBeEnabled();
  await page.screenshot({
    path: `../artifacts/${test.info().project.name}-device-dialog.png`,
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "Slett Stuelampe" }).click();
  expect(calls).toBe(0);
  await page.getByRole("button", { name: "Avbryt", exact: true }).click();
  expect(calls).toBe(0);
  await page.getByRole("button", { name: "Slett Stuelampe" }).click();
  await page
    .getByRole("button", { name: "Fjern enheten", exact: true })
    .click();
  await expect(
    page.getByText("Enheten er fjernet fra nettverket."),
  ).toBeVisible();
  expect(calls).toBe(1);
  await page.getByRole("button", { name: "Z-Wave", exact: true }).click();
  await expect(
    page.getByText("Sover · normalt for batterienheter"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Slett Kontroller" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Slett Dørsensor" }).click();
  await page.getByRole("button", { name: "Start utmelding" }).click();
  await expect(
    page.getByText("Aktiver utmeldingsmodus", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Stopp utmelding" }).click();
  await expect(page.getByText("Utmeldingen er stoppet.")).toBeVisible();
  await page.getByRole("button", { name: "Legg til ny enhet" }).click();
  await expect(
    page.getByRole("heading", { name: "Koble noe nytt til hjemmet." }),
  ).toBeVisible();
});

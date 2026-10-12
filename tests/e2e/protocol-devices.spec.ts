import { test, expect } from "../../frontend/node_modules/@playwright/test";

test("protocol inventory, confirmed removal and add wizard", async ({
  page,
}) => {
  let session: any = null;
  let removed = false;
  let calls = 0;
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
  await page.goto("/");
  await page.getByRole("button", { name: "Enheter", exact: true }).click();
  await page.getByRole("button", { name: "Zigbee", exact: true }).click();
  await expect(page.getByText("LQI 185/255", { exact: false })).toBeVisible();
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

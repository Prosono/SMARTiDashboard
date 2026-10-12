import { test, expect } from "../../frontend/node_modules/@playwright/test";

test("pairing wizard handles security, PIN and stop on mobile and desktop", async ({
  page,
}) => {
  let session: any = null;
  const answers: any[] = [];
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
  await page.route("**/api/setup/session", (r) =>
    r.fulfill({
      body: JSON.stringify(session),
      contentType: "application/json",
    }),
  );
  await page.route("**/api/setup/sessions", (r) => {
    const body = r.request().postDataJSON();
    session = {
      id: "pairing",
      provider: body.provider,
      status: "security",
      grant: { securityClasses: [1] },
      expires_at: Date.now() / 1000 + 120,
      radio_open: true,
    };
    return r.fulfill({ json: session });
  });
  await page.route("**/api/setup/sessions/pairing/answer", (r) => {
    const body = r.request().postDataJSON();
    answers.push(body);
    session = {
      ...session,
      status: body.action === "grant" ? "pin" : "interviewing",
      dsk: "xxxxx-12345-12345",
    };
    return r.fulfill({ json: session });
  });
  await page.route("**/api/setup/sessions/pairing/stop", (r) => {
    session = { ...session, status: "stopped", radio_open: false };
    return r.fulfill({ json: session });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Legg til enhet", exact: true })
    .first()
    .click();
  const zwave = page.locator("article").filter({
    has: page.getByRole("heading", { name: "Z-Wave JS", exact: true }),
  });
  await zwave.getByRole("button", { name: "Start paring" }).click();
  await expect(
    page.getByRole("heading", { name: "Bekreft sikkerheten" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Godkjenn sikkerhet" }).click();
  await page.getByLabel("De fem første sifrene i DSK-koden").fill("12345");
  await page.getByRole("button", { name: "Bekreft", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Leser inn enheten …" }),
  ).toBeVisible();
  expect(answers).toEqual([
    { action: "grant" },
    { action: "pin", pin: "12345" },
  ]);
  await page.screenshot({
    path: `../artifacts/${test.info().project.name}-pairing.png`,
    fullPage: true,
  });
  await expect(page.locator("body")).toHaveJSProperty(
    "scrollWidth",
    await page.locator("body").evaluate((e) => e.clientWidth),
  );
  await page.getByRole("button", { name: "Stopp paring" }).click();
  await expect(
    page.getByRole("heading", { name: "Paringen er stoppet" }),
  ).toBeVisible();
  await expect(
    zwave.getByRole("button", { name: "Start paring" }),
  ).toBeEnabled();
  await zwave.getByRole("button", { name: "Start paring" }).click();
  await expect(
    page.getByRole("heading", { name: "Bekreft sikkerheten" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Stopp paring" }).click();
  await expect(
    page.getByRole("heading", { name: "Paringen er stoppet" }),
  ).toBeVisible();
});

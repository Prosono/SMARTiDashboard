import { test, expect } from "../../frontend/node_modules/@playwright/test";
test("robot controls follow capabilities, update status and expose only mapped rooms", async ({
  page,
}) => {
  let state = "docked",
    speed = "Quiet";
  const commands: any[] = [];
  await page.route("**/api/home", async (route) => {
    const response = await route.fetch(),
      data = await response.json();
    const robot = {
      id: "robot",
      entity_id: "vacuum.robot",
      name: "Robot i første etasje",
      domain: "vacuum",
      area_id: "living",
      device_id: null,
      state,
      availability: "available",
      diagnostic: false,
      updated_at: null,
      attributes: {
        battery_level: 82,
        fan_speed: speed,
        fan_speed_list: ["Quiet", "Turbo"],
        smarti_cleaning_areas: ["kitchen"],
      },
      capabilities: [
        {
          kind: "vacuum",
          actions: [
            "start",
            "pause",
            "return_to_base",
            "set_fan_speed",
            "clean_area",
          ],
        },
      ],
    };
    await route.fulfill({
      json: {
        ...data,
        controls: [
          ...data.controls,
          robot,
          {
            ...robot,
            id: "blind",
            entity_id: "cover.blind",
            name: "Persienne på kontoret",
            domain: "cover",
            state: "open",
            attributes: { device_class: "blind", current_position: 70 },
            capabilities: [
              {
                kind: "cover",
                actions: ["open_cover", "close_cover", "stop_cover"],
              },
            ],
          },
          {
            ...robot,
            id: "offline",
            entity_id: "vacuum.offline",
            name: "Robot uten kontakt",
            state: "unavailable",
            availability: "unavailable",
          },
        ],
      },
    });
  });
  await page.route("**/api/controls/vacuum.robot/commands", async (route) => {
    const body = route.request().postDataJSON();
    commands.push(body);
    if (body.action === "start") state = "cleaning";
    if (body.action === "pause") state = "paused";
    if (body.action === "set_fan_speed") speed = body.fan_speed;
    await route.fulfill({ json: { status: "accepted_unconfirmed" } });
  });
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await page.getByRole("tab", { name: "Diverse", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Persienner, gardiner og markiser" }),
  ).toContainText("Persienne på kontoret");
  const coverCommands: string[] = [];
  await page.route("**/api/controls/cover.blind/commands", async (route) => {
    coverCommands.push(route.request().postDataJSON().action);
    await route.fulfill({ json: { status: "accepted_unconfirmed" } });
  });
  await page
    .getByRole("region", { name: "Persienner, gardiner og markiser" })
    .getByRole("button", { name: "Lukk", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Bekreft", exact: true })
    .click();
  await expect.poll(() => coverCommands).toEqual(["close_cover"]);
  const sockets = page.getByRole("region", {
    name: "Brytere og stikkontakter",
  });
  const socketButton = sockets.getByRole("button", {
    name: /Slå (på|av): Stikkontakt/,
  });
  const wasOn = (await socketButton.getAttribute("aria-label"))?.includes(
    "Slå av",
  );
  await socketButton.click();
  await expect(socketButton).toHaveAttribute(
    "aria-label",
    wasOn ? "Slå på: Stikkontakt" : "Slå av: Stikkontakt",
  );
  const card = page.locator(".vacuum-card").filter({
    has: page.getByRole("heading", {
      name: "Robot i første etasje",
      exact: true,
    }),
  });
  const offline = page.locator(".vacuum-card").filter({
    has: page.getByRole("heading", {
      name: "Robot uten kontakt",
      exact: true,
    }),
  });
  await expect(
    offline.getByRole("button", { name: "Start rengjøring", exact: true }),
  ).toBeDisabled();
  await card
    .getByRole("button", { name: "Start rengjøring", exact: true })
    .click();
  await expect(
    card.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  expect(commands[0]).toEqual({ action: "start" });
  await card
    .getByRole("button", { name: "Detaljer og valg", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Sugestyrke", { exact: true }).selectOption("Turbo");
  await expect(dialog.getByLabel("Sugestyrke", { exact: true })).toHaveValue(
    "Turbo",
  );
  await expect(
    dialog.getByRole("button", { name: "Finn roboten", exact: true }),
  ).toHaveCount(0);
  await expect(dialog.getByRole("checkbox")).toHaveCount(1);
  await dialog.getByRole("checkbox", { name: "Kjøkken", exact: true }).check();
  await dialog
    .getByRole("button", { name: "Rengjør rom", exact: true })
    .click();
  await expect
    .poll(() =>
      commands.some(
        (c) => c.action === "clean_area" && c.area_ids[0] === "kitchen",
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: `../artifacts/cleaning-dialog-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.screenshot({
    path: `../artifacts/cleaning-${test.info().project.name}.png`,
    fullPage: true,
  });
  expect(
    await page.locator("body").evaluate((e) => e.scrollWidth <= e.clientWidth),
  ).toBe(true);
});

import { test, expect } from "../../frontend/node_modules/@playwright/test";
test("nested flows edit one field, preserve HA logic, validate and discard drafts", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await expect(
    page.getByRole("navigation", { name: "Hovedmeny" }),
  ).toBeVisible();
  const session = await (await page.request.get("/api/session")).json();
  const config = {
    alias: `Trygg kveldsrutine ${test.info().project.name}`,
    description: "Tester ekte HA-struktur uten å kjøre enheter.",
    mode: "queued",
    max: 3,
    trace: { stored_traces: 7 },
    variables: { level: "{{ 55 }}" },
    triggers: [
      {
        trigger: "state",
        entity_id: "binary_sensor.front_door",
        from: "off",
        to: "on",
        for: { seconds: 10 },
        id: "door_open",
      },
      { trigger: "sun", event: "sunset", offset: "-00:15:00" },
    ],
    conditions: [
      {
        condition: "or",
        conditions: [
          { condition: "time", after: "18:00:00", weekday: ["mon", "tue"] },
          {
            condition: "template",
            value_template: '{{ is_state("person.fixture", "home") }}',
          },
        ],
      },
    ],
    actions: [
      {
        choose: [
          {
            alias: "Når noen er hjemme",
            conditions: [
              {
                condition: "state",
                entity_id: "person.fixture",
                state: "home",
              },
            ],
            sequence: [
              {
                alias: "Demp pendellampen",
                action: "light.turn_on",
                target: { entity_id: "light.living_pendant" },
                data: { brightness_pct: 45, transition: 2 },
                continue_on_error: true,
              },
              { repeat: { count: 2, sequence: [{ delay: { seconds: 5 } }] } },
            ],
          },
        ],
        default: [{ stop: "Ingen er hjemme" }],
      },
      {
        parallel: [
          {
            sequence: [
              {
                action: "switch.turn_on",
                target: { entity_id: "switch.socket" },
              },
            ],
          },
          { sequence: [{ delay: "00:00:30" }] },
        ],
      },
    ],
  };
  const response = await page.request.post("/api/manage/automations", {
    headers: {
      "X-CSRF-Token": session.csrf,
      Origin: new URL(page.url()).origin,
    },
    data: { config },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const saved = await response.json();
  const nav = page.getByRole("navigation", { name: "Hovedmeny" });
  await nav.getByRole("button", { name: "Innstillinger", exact: true }).click();
  await page
    .locator(".experience-picker")
    .getByRole("button", { name: /^Avansert/ })
    .click();
  await nav.getByRole("button", { name: "Automasjoner", exact: true }).click();
  await page
    .locator(".automation-item")
    .filter({ hasText: config.alias })
    .getByRole("button", { name: "Rediger", exact: true })
    .click();
  const flow = page.locator(".flow-designer").first();
  await expect(
    flow.getByRole("button", { name: "Steg for steg", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(flow).not.toContainText("Avansert blokk");
  await expect(flow).toContainText("Når noen er hjemme");
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: `../artifacts/${test.info().project.name}-flow-redesign.png`,
    fullPage: true,
  });
  await flow
    .getByRole("button", {
      name: "Rediger steg: Demp pendellampen",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("button", { name: "Enhetene som skal styres", exact: true })
    .click();
  const picker = page.getByRole("dialog", {
    name: "Enhetene som skal styres",
    exact: true,
  });
  await expect(picker).toBeVisible();
  await picker.getByRole("textbox").fill("Pendellampe");
  await expect(
    picker.getByRole("button", { name: /Pendellampe/ }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(picker).not.toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Tilpass steget", exact: true }),
  ).toBeVisible();
  const brightness = dialog.getByLabel(/Lysstyrke/).first();
  await brightness.fill("");
  await expect(
    dialog.getByRole("button", { name: "Ferdig med steget", exact: true }),
  ).toBeDisabled();
  await brightness.fill("65");
  await expect(
    dialog.getByRole("button", { name: "Ferdig med steget", exact: true }),
  ).toBeEnabled();
  await page.screenshot({
    path: `../artifacts/${test.info().project.name}-flow-inspector.png`,
    fullPage: true,
  });
  await dialog
    .getByRole("button", { name: "Ferdig med steget", exact: true })
    .click();
  await flow
    .getByRole("button", { name: "Legg til hendelse", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Noe endrer seg/ })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Ferdig med steget", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Forkast endringer i steget", exact: true })
    .click();
  const saveResponse = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/api/manage/automations/${saved.id}`) &&
      r.request().method() === "PUT",
  );
  await page
    .getByRole("button", { name: "Lagre automasjon", exact: true })
    .click();
  expect((await saveResponse).ok()).toBeTruthy();
  const actual = (
    await (await page.request.get(`/api/manage/automations/${saved.id}`)).json()
  ).config;
  const expected = structuredClone(config);
  expected.actions[0].choose![0].sequence[0].data!.brightness_pct = 65;
  expect(actual).toEqual({ ...expected, id: saved.id });
  await flow
    .getByRole("button", { name: "Fri arbeidsflate", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Arbeidsflate for automasjon" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Vis hele flyten", exact: true })
    .click();
  const zoom = await page.locator(".canvas-tools output").innerText();
  expect(parseInt(zoom)).toBeGreaterThanOrEqual(20);
  expect(parseInt(zoom)).toBeLessThanOrEqual(100);
  await expect(page.locator(".canvas-node").first()).toBeVisible();
  await page.locator(".flow-workspace").screenshot({
    path: `../artifacts/${test.info().project.name}-flow-canvas.png`,
    animations: "disabled",
  });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
  });
  await page.locator(".flow-workspace").screenshot({
    path: `../artifacts/${test.info().project.name}-flow-canvas-dark.png`,
    animations: "disabled",
  });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
  });
  await page.locator(".canvas-actions .canvas-node-content").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", {
      name: "Rediger steg: Demp pendellampen",
      exact: true,
    })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByLabel(/Lysstyrke/)
      .first(),
  ).toHaveValue("65");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Tilbake til forrige steg", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Stegene inni");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Ferdig med steget", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Arbeidsflate for automasjon" }),
  ).toBeVisible();
});

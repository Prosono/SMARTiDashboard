import {
  test,
  expect,
  type Page,
} from "../../frontend/node_modules/@playwright/test";
async function openTest(page: Page, config: any) {
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  const navigation = page.getByRole("navigation", { name: "Hovedmeny" });
  await expect(navigation).toBeVisible();
  const session = await (await page.request.get("/api/session")).json();
  config = { ...config, alias: `Virtual test ${Date.now()}` };
  const response = await page.request.post("/api/manage/automations", {
    headers: {
      "X-CSRF-Token": session.csrf,
      Origin: new URL(page.url()).origin,
    },
    data: { config },
  });
  expect(response.ok()).toBe(true);
  const saved = await response.json();
  await navigation
    .getByRole("button", { name: "Automasjoner", exact: true })
    .click();
  await page
    .locator(".automation-item")
    .filter({ hasText: config.alias })
    .getByRole("button", { name: "Rediger", exact: true })
    .click();
  await page.getByRole("button", { name: "Testmodus", exact: true }).click();
  const panel = page.getByRole("complementary", {
    name: "Virtuell test",
    exact: true,
  });
  await expect(panel).toBeVisible();
  const writes: string[] = [];
  page.on("request", (r) => {
    if (!["GET", "HEAD"].includes(r.method()))
      writes.push(`${r.method()} ${r.url()}`);
  });
  return { panel, config, saved, writes };
}
async function value(
  page: Page,
  id: string,
  side: "before" | "after",
  v: string,
) {
  const device = page
    .locator(".test-virtual-device")
    .filter({ has: page.locator("header small", { hasText: id }) });
  const field = device
    .locator(".test-field-pair")
    .first()
    .locator("input, select")
    .nth(side === "before" ? 0 : 1);
  if (await field.evaluate((el) => el.tagName === "SELECT"))
    await field.selectOption(v);
  else await field.fill(v);
}
const actions = [
  {
    action: "light.turn_on",
    target: { entity_id: "light.living_pendant" },
    data: { brightness_pct: 40 },
  },
  { delay: 300 },
  { action: "light.turn_off", target: { entity_id: "light.living_pendant" } },
];
test("virtual values, playback, animated wires and reset never write to the home or saved draft", async ({
  page,
}, info) => {
  if (info.project.name === "desktop")
    await page.setViewportSize({ width: 1600, height: 1080 });
  const { panel, config, saved, writes } = await openTest(page, {
    mode: "single",
    triggers: [
      {
        trigger: "numeric_state",
        entity_id: "sensor.bedroom_temperature",
        above: 25,
        for: { seconds: 10 },
      },
    ],
    conditions: [
      { condition: "state", entity_id: "light.living_pendant", state: "off" },
    ],
    actions,
  });
  await value(page, "sensor.bedroom_temperature", "before", "18");
  await value(page, "sensor.bedroom_temperature", "after", "28");
  await value(page, "light.living_pendant", "after", "off");
  await expect(
    page.getByRole("button", { name: "Lagre automasjon", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".canvas-delete")).toHaveCount(0);
  await expect(page.locator(".canvas-port").first()).toBeDisabled();
  await panel.locator(".test-panel-body").evaluate((el) => (el.scrollTop = 0));
  await page.locator(".flow-studio").screenshot({
    path: info.outputPath("scenario-inputs.png"),
    animations: "disabled",
  });
  const next = panel.getByRole("button", {
    name: "Neste teststeg",
    exact: true,
  });
  await next.click();
  await next.click();
  await next.click();
  await expect(
    page.locator('.canvas-route[data-sim-status="running"]'),
  ).toHaveCount(1);
  await panel.getByRole("button", { name: "Fortsett", exact: true }).click();
  const moving = page.locator(
    '.canvas-route[data-sim-status="running"] .canvas-wire-line',
  );
  await expect(moving).toHaveCSS("animation-name", "flow-test-travel");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(moving).toHaveCSS("animation-name", "none");
  await panel.getByRole("button", { name: "Pause", exact: true }).click();
  const paused = await panel.locator(".test-clock").innerText();
  await page.waitForTimeout(600);
  expect(await panel.locator(".test-clock").innerText()).toBe(paused);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await panel
    .getByRole("button", { name: "Vis hele testresultatet", exact: true })
    .click();
  await expect(panel.locator(".test-current")).toContainText(
    "Virtuell kjøring fullført",
  );
  await expect(panel.locator(".test-clock")).toContainText("+00:05:10");
  await expect
    .poll(() =>
      page.locator(".canvas-viewport").evaluate((el) => {
        const node = Array.from(
          el.querySelectorAll<HTMLElement>(".canvas-actions"),
        ).at(-1)!;
        const viewport = el.getBoundingClientRect(),
          box = node.getBoundingClientRect();
        return box.left >= viewport.left - 2 && box.right <= viewport.right + 2;
      }),
    )
    .toBe(true);
  await panel.getByRole("button", { name: "Kjørelogg", exact: false }).click();
  await expect(panel.locator(".test-state-results")).toContainText(
    "brightness: 102",
  );
  await page
    .locator("form")
    .filter({ has: page.locator(".flow-designer") })
    .evaluate((form) => (form as HTMLFormElement).requestSubmit());
  expect(writes).toEqual([]);
  expect(
    (
      await (
        await page.request.get(`/api/manage/automations/${saved.id}`)
      ).json()
    ).config,
  ).toEqual({ ...config, id: saved.id });
  const studio = page.locator(".flow-studio");
  await studio
    .getByRole("button", { name: "Vis hele flyten", exact: true })
    .click();
  await panel.locator(".test-panel-body").evaluate((el) => (el.scrollTop = 0));
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (v) => (document.documentElement.dataset.theme = v),
      theme,
    );
    await page.waitForTimeout(250);
    await studio.screenshot({
      path: info.outputPath(`virtual-test-${theme}.png`),
      animations: "disabled",
    });
  }
  await page.getByRole("button", { name: "Avslutt test", exact: true }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.locator(".canvas-node[data-sim-status]")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Lagre automasjon", exact: true }),
  ).toBeEnabled();
  expect(writes).toEqual([]);
});
test("a virtual event must match and a failed condition stops downstream animation", async ({
  page,
}) => {
  const { panel, writes } = await openTest(page, {
    mode: "single",
    triggers: [
      {
        trigger: "state",
        entity_id: "binary_sensor.front_door",
        from: "off",
        to: "on",
      },
    ],
    conditions: [{ condition: "time", after: "22:00:00" }],
    actions,
  });
  await value(page, "binary_sensor.front_door", "before", "off");
  await value(page, "binary_sensor.front_door", "after", "off");
  await panel.locator('input[type="datetime-local"]').fill("2026-11-08T12:00");
  await panel
    .getByRole("button", { name: "Vis hele testresultatet", exact: true })
    .click();
  await expect(panel.locator(".test-current")).toContainText(
    "Hendelsen ble ikke utløst",
  );
  await expect(
    page.locator('.canvas-actions[data-sim-status="pending"]'),
  ).toHaveCount(3);
  await value(page, "binary_sensor.front_door", "after", "on");
  await panel
    .getByRole("button", { name: "Vis hele testresultatet", exact: true })
    .click();
  await expect(panel.locator(".test-current")).toContainText("Flyten stoppet");
  await expect(
    page.locator('.canvas-conditions[data-sim-status="failed"]'),
  ).toHaveCount(1);
  await expect(
    page.locator('.canvas-actions[data-sim-status="pending"]'),
  ).toHaveCount(3);
  expect(writes).toEqual([]);
});
test("unsupported templates ask for an explicit test assumption and never imply actual execution", async ({
  page,
}) => {
  const { panel, writes } = await openTest(page, {
    mode: "single",
    triggers: [{ trigger: "sun", event: "sunset" }],
    conditions: [
      {
        condition: "template",
        value_template: "{{ is_state('light.living_pendant','off') }}",
      },
    ],
    actions: [actions[0]],
  });
  await panel
    .getByRole("button", { name: "Vis hele testresultatet", exact: true })
    .click();
  await expect(panel.locator(".test-current")).toContainText(
    "manuelt testresultat",
  );
  await expect(
    page.locator('.canvas-actions[data-sim-status="pending"]'),
  ).toHaveCount(1);
  await panel
    .getByRole("button", { name: "Anta ikke oppfylt", exact: true })
    .click();
  await expect(panel.locator(".test-current")).toContainText("Flyten stoppet");
  await panel
    .getByRole("button", { name: "Fjern antakelser", exact: true })
    .click();
  await panel
    .getByRole("button", { name: "Vis hele testresultatet", exact: true })
    .click();
  await panel
    .getByRole("button", { name: "Anta oppfylt", exact: true })
    .click();
  await panel
    .getByRole("button", { name: "Vis hele testresultatet", exact: true })
    .click();
  await expect(panel.locator(".test-current")).toContainText(
    "Virtuell kjøring fullført",
  );
  await expect(panel.locator(".test-assumption-summary")).toContainText(
    "1 manuelle",
  );
  expect(writes).toEqual([]);
});

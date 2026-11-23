import { test, expect } from "../../frontend/node_modules/@playwright/test";
import { openDeviceControl } from "./deviceNavigation";
test("device dialog uses full width and exposes interactive state history", async ({ page }, info) => {
  const end = new Date().toISOString();
  const start = new Date(Date.now() - 86400000).toISOString();
  const middle = new Date(Date.now() - 43200000).toISOString();
  await page.route("**/api/controls/*/history?*", route => route.fulfill({ json: route.request().url().includes("sensor.") && !route.request().url().includes("binary_sensor.") ? {
    start, end, samples: 3, unit: "%", minimum: 70, maximum: 90,
    points: [{ time: start, state: "90", value: 90 }, { time: middle, state: "80", value: 80 }, { time: end, state: "70", value: 70 }]
  } : {
    start, end, samples: 3, minimum: null, maximum: null,
    points: [{ time: start, state: "off", value: null }, { time: middle, state: "on", value: null }, { time: end, state: "off", value: null }]
  } }));
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page.getByLabel("Passord", { exact: true }).fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await page.getByRole("tab", { name: "Sikkerhet", exact: true }).click();
  await page.getByRole("tabpanel", { name: "Sikkerhet" }).getByRole("button", { name: /^(?:Åpne Ytterdør|Ytterdør: .*Se detaljer)$/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".control-detail")).toBeVisible();
  await expect(dialog.locator(".device-detail-portrait [data-artwork-entity]")).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Ytterdør", exact: true })).toHaveCount(1);
  await expect(dialog.getByRole("button", { name: "Skjul enhet" })).not.toBeVisible();
  await expect(dialog.getByText("Enhetsinnstillinger", { exact: true })).toBeVisible();
  if (info.project.name === "mobile") {
    const bounds = await dialog.boundingBox();
    expect(bounds!.y + bounds!.height).toBeCloseTo(page.viewportSize()!.height, 0);
  }
  await dialog.screenshot({ path: `test-results/control-detail-initial-${info.project.name}.png` });
  const width = await dialog.locator(".control-detail").evaluate(el => {
    const frame = el.parentElement!;
    const style = getComputedStyle(frame);
    const available = frame.clientWidth - parseFloat(style.paddingInlineStart) - parseFloat(style.paddingInlineEnd);
    return el.getBoundingClientRect().width / available;
  });
  expect(width).toBeGreaterThan(0.95);
  const history = dialog.getByRole("button", { name: "Historikk", exact: true });
  if (await history.getAttribute("aria-expanded") === "false") await history.click();
  const chart = dialog.getByRole("img", { name: /Historikkgraf/ });
  await expect(chart).toBeVisible();
  await chart.focus();
  await page.keyboard.press("Home");
  await expect(dialog.locator(".control-history-reading strong")).toHaveText("Lukket");
  await page.keyboard.press("ArrowRight");
  await expect(dialog.locator(".control-history-reading strong")).toHaveText("Åpen");
  await dialog.getByLabel("Tidsrom", { exact: true }).selectOption("168");
  await expect(chart).toBeVisible();
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBeTruthy();
  await dialog.getByRole("combobox", { name: "Måling / status", exact: true }).selectOption({ label: "Batteri" });
  await expect(dialog.locator(".control-history-reading strong")).toHaveText("70 %");
  const batteryChart = dialog.getByRole("img", { name: /^Batteri\. Målt spenn/ });
  await batteryChart.focus();
  await page.keyboard.press("Home");
  await expect(dialog.locator(".control-history-reading strong")).toHaveText("90 %");
  const bounds = await batteryChart.boundingBox();
  await page.mouse.move(bounds!.x + bounds!.width * 0.51, bounds!.y + 40);
  await expect(dialog.locator(".control-history-reading strong")).toHaveText("80 %");
  await dialog.screenshot({ path: `test-results/control-detail-${info.project.name}.png` });
});

test("light tiles open full device controls and history", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page.getByLabel("Passord", { exact: true }).fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await page.getByRole("tab", { name: "Lys", exact: true }).click();
  await page.getByRole("tabpanel", { name: "Lys" }).getByRole("button", { name: /^(?:Åpne |Detaljer: )Pendellampe$/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".light-detail .device-detail-portrait [data-artwork-entity]")).toBeVisible();
  await expect(dialog.getByRole("switch")).toBeVisible();
  await expect(dialog.locator('input[type="range"]').first()).toBeVisible();
  await dialog.getByRole("button", { name: "Historikk", exact: true }).click();
  await expect(dialog).toContainText("Ingen lagret historikk");
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("lock commands ask for confirmation in the device window", async ({ page }) => {
  await page.route("**/api/home", async (route) => {
    const response = await route.fetch();
    const home = await response.json();
    const door = home.controls.find((control: { entity_id: string }) =>
      control.entity_id === "binary_sensor.front_door",
    );
    home.controls.push({
      ...door,
      id: "lock.demo_door",
      name: "Testlås",
      entity_id: "lock.demo_door",
      domain: "lock",
      device_id: null,
      state: "locked",
      attributes: {},
      capabilities: [{ kind: "lock", actions: ["lock", "unlock"] }],
    });
    await route.fulfill({ response, json: home });
  });
  const commands: unknown[] = [];
  await page.route("**/api/controls/lock.demo_door/commands", async (route) => {
    commands.push(route.request().postDataJSON());
    await route.fulfill({ json: { status: "accepted_unconfirmed" } });
  });
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page.getByLabel("Passord", { exact: true }).fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await page.getByRole("navigation").getByRole("button", { name: "Enheter", exact: true }).click();
  const device = await openDeviceControl(page, "Testlås");
  await device.getByRole("button", { name: "Lås opp", exact: true }).click();
  await expect(device.getByRole("button", { name: "Bekreft", exact: true })).toBeVisible();
  expect(commands).toEqual([]);
  await device.getByRole("button", { name: "Avbryt", exact: true }).click();
  await device.getByRole("button", { name: "Lås opp", exact: true }).click();
  await device.getByRole("button", { name: "Bekreft", exact: true }).click();
  await expect.poll(() => commands).toEqual([{ action: "unlock", confirmed: true }]);
});

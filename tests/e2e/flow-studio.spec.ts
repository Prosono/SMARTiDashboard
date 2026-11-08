import { test, expect } from "../../frontend/node_modules/@playwright/test";

test("flow studio keeps the canvas clear, anchors zoom and reveals tools without changing execution", async ({
  page,
}, info) => {
  if (info.project.name === "desktop")
    await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  const navigation = page.getByRole("navigation", { name: "Hovedmeny" });
  await expect(navigation).toBeVisible();
  const session = await (await page.request.get("/api/session")).json();
  const config = {
    alias: `Kveldslys studio ${info.project.name} ${Date.now()}`,
    mode: "single",
    triggers: [
      { trigger: "state", entity_id: "binary_sensor.front_door", to: "on" },
      { trigger: "sun", event: "sunset" },
    ],
    conditions: [{ condition: "time", after: "18:00:00" }],
    actions: [
      {
        action: "light.turn_on",
        target: { entity_id: "light.living_pendant" },
        data: { brightness_pct: 45 },
      },
      { delay: { seconds: "{{ 15 }}" } },
      {
        action: "light.turn_off",
        target: { entity_id: "light.living_pendant" },
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
  await page
    .getByRole("button", { name: "Fri arbeidsflate", exact: true })
    .click();
  const studio = page.getByRole("region", {
    name: "Arbeidsflate for automasjon",
  });
  const writes: string[] = [];
  page.on("request", (r) => {
    if (!["GET", "HEAD"].includes(r.method())) writes.push(r.url());
  });
  await expect(studio.locator(".canvas-add")).toBeHidden();
  await expect(studio.locator(".canvas-connection-tools")).toBeHidden();
  await expect(studio.locator(".canvas-node")).toHaveCount(6);
  if (info.project.name === "desktop") {
    const name = page.getByRole("textbox", {
      name: "Navn på flyten",
      exact: true,
    });
    await name.fill(config.alias + " · utkast");
    await expect(name).toHaveValue(config.alias + " · utkast");
    await name.fill(config.alias);
  }

  const options = studio.getByRole("button", {
    name: "Visningsvalg",
    exact: true,
  });
  await options.click();
  await studio.getByRole("button", { name: "Rutenett", exact: true }).click();
  await expect(studio.locator(".canvas-viewport")).toHaveClass(/no-grid/);
  await studio.getByRole("button", { name: "Linjer", exact: true }).click();
  await expect(studio.locator(".canvas-route")).toHaveCount(0);
  await studio.getByRole("button", { name: "Linjer", exact: true }).click();
  await studio.getByRole("button", { name: "Rutenett", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(options).toBeFocused();
  await expect(studio.locator(".studio-options-panel")).toHaveCount(0);

  const viewport = studio.locator(".canvas-viewport");
  await viewport.evaluate((el) => {
    el.scrollLeft = 160;
    el.scrollTop = 100;
  });
  const center = () =>
    viewport.evaluate((el) => {
      const scale = new DOMMatrix(
        getComputedStyle(el.querySelector(".canvas-plane")!).transform,
      ).a;
      return {
        x: (el.scrollLeft + el.clientWidth / 2) / scale,
        y: (el.scrollTop + el.clientHeight / 2) / scale,
      };
    });
  const before = await center();
  await studio.getByRole("button", { name: "Zoom inn", exact: true }).click();
  const after = await center();
  expect(Math.abs(before.x - after.x)).toBeLessThan(2);
  expect(Math.abs(before.y - after.y)).toBeLessThan(2);
  await studio
    .getByRole("button", { name: "Tilbakestill zoom til 100 %", exact: true })
    .click();
  await expect(studio.locator(".canvas-tools output")).toHaveText("100%");
  await studio
    .getByRole("button", { name: "Vis hele flyten", exact: true })
    .click();

  const source = studio
    .locator(".canvas-actions")
    .first()
    .locator(".canvas-port.out");
  const target = studio
    .locator(".canvas-actions")
    .last()
    .locator(".canvas-port.in");
  await source.click();
  await expect(studio.locator(".canvas-connection-tools")).toBeVisible();
  await target.click();
  await expect(
    studio.getByRole("button", { name: "Bekreft kobling", exact: true }),
  ).toBeEnabled();
  await studio.getByRole("button", { name: "Samtidig", exact: true }).click();
  await target.click();
  await expect(
    studio.getByRole("button", { name: "Bekreft kobling", exact: true }),
  ).toHaveCount(0);
  await expect(studio.locator(".canvas-connection-status")).toContainText(
    "Behold rekkefølgen",
  );
  await studio
    .getByRole("button", { name: "Avbryt kobling", exact: true })
    .click();
  await expect(studio.locator(".canvas-connection-tools")).toBeHidden();

  await studio
    .getByRole("button", { name: "Legg til kort", exact: true })
    .click();
  await expect(studio.locator(".canvas-add")).toBeVisible();
  await studio
    .getByRole("textbox", { name: "Søk i byggesteiner", exact: true })
    .fill("bevegelse");
  await expect(
    studio.locator(".canvas-library-list .is-preset").first(),
  ).toBeVisible();
  await studio
    .getByRole("button", { name: "Lukk kortbibliotek", exact: true })
    .click();
  await expect(
    studio.getByRole("button", { name: "Legg til kort", exact: true }),
  ).toBeFocused();
  await expect(studio.locator(".canvas-add")).toBeHidden();

  await studio.locator(".canvas-actions .canvas-node-content").first().click();
  await expect(
    studio.locator('.canvas-actions[data-selected="true"]'),
  ).toHaveCount(1);
  await expect(
    page.getByRole("dialog", { name: "Tilpass steget", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Ferdig med steget", exact: true })
    .click();
  const output = (
    await (await page.request.get(`/api/manage/automations/${saved.id}`)).json()
  ).config;
  expect(output).toEqual({ ...config, id: saved.id });
  expect(writes).toHaveLength(0);

  for (const width of info.project.name === "desktop"
    ? [1440, 820]
    : [390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (theme) => (document.documentElement.dataset.theme = theme),
        theme,
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      await studio.screenshot({
        path: info.outputPath(`studio-${width}-${theme}.png`),
        animations: "disabled",
      });
    }
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(studio.locator(".canvas-node").first()).toHaveCSS(
    "transition-duration",
    "0s",
  );
});

test("an empty canvas offers one clear starting point and opens the event guide", async ({
  page,
}, info) => {
  const id = "studio_empty";
  const alias = "Ny flyt i studio";
  await page.route("**/api/manage/automations", (route) =>
    route.fulfill({
      json: [
        {
          id,
          entity_id: "automation.studio_empty",
          name: alias,
          state: "off",
          last_triggered: null,
        },
      ],
    }),
  );
  await page.route(`**/api/manage/automations/${id}`, (route) =>
    route.fulfill({
      json: {
        id,
        revision: "empty",
        config: {
          id,
          alias,
          mode: "single",
          triggers: [],
          conditions: [],
          actions: [],
        },
      },
    }),
  );
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Hovedmeny" })
    .getByRole("button", { name: "Automasjoner", exact: true })
    .click();
  await page
    .locator(".automation-item")
    .filter({ hasText: alias })
    .getByRole("button", { name: "Rediger", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Fri arbeidsflate", exact: true })
    .click();
  const studio = page.getByRole("region", {
    name: "Arbeidsflate for automasjon",
  });
  await expect(
    studio.getByRole("heading", {
      name: "Hva skal starte flyten?",
      exact: true,
    }),
  ).toBeVisible();
  const writes: string[] = [];
  page.on("request", (r) => {
    if (!["GET", "HEAD"].includes(r.method())) writes.push(r.url());
  });
  await studio.screenshot({
    path: info.outputPath("empty-studio.png"),
    animations: "disabled",
  });
  await studio
    .getByRole("button", { name: "Legg til hendelse", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Hva vil du legge til?", exact: true }),
  ).toBeVisible();
  expect(writes).toHaveLength(0);
});

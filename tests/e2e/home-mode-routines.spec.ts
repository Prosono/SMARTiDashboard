import {
  test,
  expect,
  type Page,
} from "../../frontend/node_modules/@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });
test.afterEach(async ({ page }) => page.unrouteAll({ behavior: "wait" }));

async function setup(page: Page, mode = "night", style = "harmony") {
  await page.addInitScript(
    (style) => localStorage.setItem("smarti-home-style", style),
    style,
  );
  if (test.info().project.name === "desktop")
    await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "Oversikt", exact: true }),
  ).toBeVisible();
  const session = await (await page.request.get("/api/session")).json();
  const headers = {
    "X-CSRF-Token": session.csrf,
    Origin: new URL(page.url()).origin,
  };
  const cleared = await page.request.put(`/api/home/modes/${mode}`, {
    headers,
    data: { control_id: null },
  });
  expect(cleared.ok()).toBe(true);
  await page.reload();
  return { headers, home: await (await page.request.get("/api/home")).json() };
}

async function modeButton(page: Page, label: string) {
  const nav = page.getByRole("navigation", {
    name: "Hjemmemoduser",
    exact: true,
  });
  const card = page.locator('.home-canvas-cell[data-card="routines"]');
  const tile = card.locator(".mobile-card-tile");
  const expand = card.getByRole("button", {
    name: "Vis hele kortet: Rutiner",
    exact: true,
  });
  await expect
    .poll(
      async () =>
        (await nav.isVisible()) ||
        (await tile.isVisible()) ||
        (await expand.isVisible()),
    )
    .toBe(true);
  if (!(await nav.isVisible())) {
    if (await tile.isVisible()) await tile.click();
    else await expand.click();
  }
  return nav.getByRole("button", { name: new RegExp(`^${label}(?:\\s|:|$)`) });
}

async function createGuide(page: Page, label: string) {
  await (await modeButton(page, label)).click();
  const choice = page.getByRole("dialog", {
    name: `Rutine for ${label}`,
    exact: true,
  });
  await expect(choice).toBeVisible();
  await choice.getByRole("button", { name: /Lag ny rutine/ }).click();
  const guide = page.getByRole("dialog", {
    name: `Hva skal skje i ${label}-modus?`,
    exact: true,
  });
  await expect(guide).toBeVisible();
  return guide;
}

function writes(page: Page) {
  const seen = {
    scenes: 0,
    binds: [] as string[],
    runs: 0,
    commands: 0,
    layouts: 0,
  };
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/api/scenes") && request.method() === "POST")
      seen.scenes++;
    if (/\/modes\/[^/]+$/.test(path) && request.method() === "PUT")
      seen.binds.push(path);
    if (/\/modes\/[^/]+\/run$|\/scenes\/activate\//.test(path)) seen.runs++;
    if (path.endsWith("/commands")) seen.commands++;
    if (path.includes("/home/layout/") && request.method() !== "GET")
      seen.layouts++;
  });
  return seen;
}

test("unconfigured mode creates a reviewed routine, links only that mode and requires explicit activation", async ({
  page,
}) => {
  const { home } = await setup(page);
  const before = await (await page.request.get("/api/home/preferences")).json();
  const seen = writes(page);
  const guide = await createGuide(page, "Natt");
  await expect(guide.locator(".scene-steps li")).toHaveCount(2);
  await expect(
    guide.getByRole("button", { name: "Neste", exact: true }),
  ).toBeDisabled();
  await guide.getByRole("checkbox", { name: /Pendellampe/ }).check();
  await guide.getByLabel("Pendellampe: Lysstyrke", { exact: true }).fill("35");
  await guide.getByRole("checkbox", { name: /Gulvvarme/ }).check();
  await guide.getByLabel("Gulvvarme: Temperatur", { exact: true }).fill("18.5");
  const art = guide.locator(".device-product-art img").first();
  await expect(art).toBeVisible();
  await expect
    .poll(() =>
      art.evaluate(
        (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
      ),
    )
    .toBe(true);
  const initialViewport = page.viewportSize()!;
  for (const width of test.info().project.name === "desktop"
    ? [1440, 820]
    : [390, 320]) {
    await page.setViewportSize({ width, height: initialViewport.height });
    expect(
      await guide.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (theme) => (document.documentElement.dataset.theme = theme),
        theme,
      );
      await guide.screenshot({
        path: `/private/tmp/smarti-123-guide-${theme}-${width}.png`,
      });
    }
  }
  await page.setViewportSize(initialViewport);
  expect(seen.scenes + seen.runs + seen.commands + seen.binds.length).toBe(0);
  await guide.getByRole("button", { name: "Neste", exact: true }).click();
  await expect(guide).toContainText("35%");
  await expect(guide).toContainText("18.5°");
  const response = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/api/scenes" &&
      r.request().method() === "POST",
  );
  await guide
    .getByRole("button", { name: "Lagre rutine", exact: true })
    .click();
  const created = await (await response).json();
  await expect(guide).not.toBeVisible();
  const current = await (await page.request.get("/api/home")).json();
  const scene = current.controls.find(
    (c: any) => c.domain === "scene" && c.attributes.id === created.id,
  );
  expect(scene).toBeTruthy();
  const preferences = await (
    await page.request.get("/api/home/preferences")
  ).json();
  expect(preferences.modes).toEqual({ ...before.modes, night: scene.id });
  const config = await (
    await page.request.get(`/api/scenes/config/${created.id}`)
  ).json();
  expect(config.entities["light.living_pendant"].brightness).toBe(89);
  expect(config.entities["climate.living"].temperature).toBe(18.5);
  for (const entity of ["light.living_pendant", "climate.living"])
    expect(
      current.controls.find((c: any) => c.entity_id === entity).state,
    ).toBe(home.controls.find((c: any) => c.entity_id === entity).state);
  expect(seen.scenes).toBe(1);
  expect(seen.binds).toEqual(["/api/home/modes/night"]);
  expect(seen.runs + seen.commands + seen.layouts).toBe(0);
  await page.reload();
  const run = await modeButton(page, "Natt");
  await expect(run).toHaveClass(/mode-configured/);
  page.once("dialog", (dialog) => dialog.dismiss());
  await run.click();
  expect(seen.runs).toBe(0);
  page.once("dialog", (dialog) => dialog.accept());
  await run.click();
  await expect.poll(() => seen.runs).toBe(1);
  expect(seen.commands).toBe(0);
});

test("existing routine can be selected by name without creating or running another one", async ({
  page,
}) => {
  const { home } = await setup(page, "home");
  const existing = home.controls.find((c: any) => c.domain === "automation");
  const seen = writes(page);
  await (await modeButton(page, "Hjemme")).click();
  const choice = page.getByRole("dialog", {
    name: "Rutine for Hjemme",
    exact: true,
  });
  await choice
    .getByRole("button", { name: /Velg eksisterende rutine/ })
    .click();
  await expect(
    choice.getByRole("button", { name: "Bruk i Hjemme-modus", exact: true }),
  ).toBeDisabled();
  await choice
    .getByRole("button", { name: "Velg rutine", exact: true })
    .click();
  const picker = page.getByRole("dialog", { name: "Velg rutine", exact: true });
  await picker.getByRole("textbox").fill(existing.name);
  await picker.getByRole("button", { name: new RegExp(existing.name) }).click();
  await choice
    .getByRole("button", { name: "Bruk i Hjemme-modus", exact: true })
    .click();
  await expect(choice).not.toBeVisible();
  expect(
    (await (await page.request.get("/api/home/preferences")).json()).modes.home,
  ).toBe(existing.id);
  expect(seen.scenes + seen.runs + seen.commands + seen.layouts).toBe(0);
});

test("binding failure retries the saved routine without creating a duplicate", async ({
  page,
}) => {
  await setup(page, "away");
  const seen = writes(page);
  let attempts = 0;
  await page.route("**/api/home/modes/away", async (route) => {
    if (route.request().method() === "PUT" && ++attempts === 1)
      return route.fulfill({
        status: 503,
        json: { detail: "fixture_unavailable" },
      });
    return route.continue();
  });
  const guide = await createGuide(page, "Borte");
  await guide.getByRole("checkbox", { name: /Pendellampe/ }).check();
  await guide
    .getByLabel("Pendellampe: Tilstand", { exact: true })
    .selectOption("off");
  await guide.getByRole("button", { name: "Neste", exact: true }).click();
  await guide
    .getByRole("button", { name: "Lagre rutine", exact: true })
    .click();
  await expect(guide.getByRole("alert")).toContainText("Rutinen er lagret");
  await expect(
    guide.getByRole("button", { name: "Tilbake", exact: true }),
  ).toBeDisabled();
  await guide
    .getByRole("button", { name: "Koble til Borte", exact: true })
    .click();
  await expect(guide).not.toBeVisible();
  expect(seen.scenes).toBe(1);
  expect(attempts).toBe(2);
  expect(seen.runs + seen.commands + seen.layouts).toBe(0);
});

test("cancel and invalid save retain selections until a successful save", async ({
  page,
}) => {
  await setup(page, "holiday");
  const seen = writes(page);
  let attempts = 0;
  await page.route("**/api/scenes", async (route) => {
    if (route.request().method() === "POST" && ++attempts === 1)
      return route.fulfill({
        status: 422,
        json: { detail: "fixture_invalid" },
      });
    return route.continue();
  });
  const guide = await createGuide(page, "Ferie");
  await guide.getByRole("checkbox", { name: /Pendellampe/ }).check();
  page.once("dialog", (dialog) => dialog.dismiss());
  await guide
    .getByRole("button", { name: "Lukk rutineveileder", exact: true })
    .click();
  await expect(
    guide.getByRole("checkbox", { name: /Pendellampe/ }),
  ).toBeChecked();
  await guide.getByRole("button", { name: "Neste", exact: true }).click();
  await guide
    .getByRole("button", { name: "Lagre rutine", exact: true })
    .click();
  await expect(guide.getByRole("alert")).toContainText(
    "Kontroller de valgte innstillingene",
  );
  expect(seen.binds).toHaveLength(0);
  await guide.getByRole("button", { name: "Tilbake", exact: true }).click();
  await expect(
    guide.getByRole("checkbox", { name: /Pendellampe/ }),
  ).toBeChecked();
  await guide.getByRole("button", { name: "Neste", exact: true }).click();
  await guide
    .getByRole("button", { name: "Lagre rutine", exact: true })
    .click();
  await expect(guide).not.toBeVisible();
  expect(attempts).toBe(2);
  expect(seen.runs + seen.commands + seen.layouts).toBe(0);
});

test("offline homes and non-admins cannot open mode creation", async ({
  page,
}) => {
  await setup(page);
  const seen = writes(page);
  await page.route("**/api/home", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      json: { ...(await response.json()), connected: false },
    });
  });
  await page.reload();
  await expect(await modeButton(page, "Natt")).toBeDisabled();
  await page.unroute("**/api/home");
  await page.route("**/api/session", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ json: { ...(await response.json()), role: "user" } });
  });
  await page.reload();
  await expect(await modeButton(page, "Natt")).toBeDisabled();
  expect(seen.scenes + seen.binds.length + seen.runs + seen.commands).toBe(0);
});

test("regular scene creation keeps its name, device and review steps", async ({
  page,
}) => {
  await setup(page, "night", "classic");
  const seen = writes(page);
  await page.getByRole("button", { name: "Lag scene", exact: true }).click();
  const scene = page.getByRole("dialog", {
    name: "Din nye scene",
    exact: true,
  });
  await expect(scene.locator(".scene-steps li")).toHaveCount(3);
  await scene
    .getByLabel("Hva skal scenen hete?", { exact: true })
    .fill(`Regresjon ${Date.now()}`);
  await scene.getByRole("button", { name: "Neste", exact: true }).click();
  await scene.getByRole("checkbox", { name: /Pendellampe/ }).check();
  await scene.getByRole("button", { name: "Neste", exact: true }).click();
  await scene.getByRole("button", { name: "Lagre scene", exact: true }).click();
  await expect(scene).not.toBeVisible();
  expect(seen.scenes).toBe(1);
  expect(seen.binds.length + seen.runs + seen.commands + seen.layouts).toBe(0);
});

test("scene registration uses its returned ID and registry control, never a matching display name", async ({
  page,
}) => {
  await setup(page);
  const seen = writes(page);
  let createdId = "",
    registeredReads = 0,
    boundId = "";
  const entityId = "scene.natt_med_vennlig_navn",
    registryId = "registry-created-night";
  await page.route("**/api/scenes", async (route) => {
    const response = await route.fetch(),
      data = await response.json();
    if (route.request().method() === "POST") {
      createdId = data.id;
      return route.fulfill({ response, json: data });
    }
    if (!createdId) return route.fulfill({ response, json: data });
    const scenes = data.filter((s: any) => s.id !== createdId);
    // A same-name scene must never be linked while the new scene is registering.
    scenes.push({
      id: "another-config",
      entity_id: "scene.decoy",
      name: "Natt",
      available: true,
    });
    if (++registeredReads >= 2)
      scenes.push({
        id: createdId,
        entity_id: entityId,
        name: "Natt",
        available: true,
      });
    await route.fulfill({ response, json: scenes });
  });
  await page.route("**/api/home", async (route) => {
    const response = await route.fetch(),
      home = await response.json();
    home.controls = home.controls.map((c: any) =>
      c.domain === "scene" && c.attributes.id === createdId
        ? { ...c, id: registryId, entity_id: entityId }
        : c,
    );
    await route.fulfill({ response, json: home });
  });
  await page.route("**/api/home/preferences", async (route) => {
    const response = await route.fetch(),
      preferences = await response.json();
    if (boundId) preferences.modes.night = boundId;
    await route.fulfill({ response, json: preferences });
  });
  await page.route("**/api/home/modes/night", (route) => {
    boundId = route.request().postDataJSON().control_id;
    return route.fulfill({ json: { saved: true } });
  });
  const guide = await createGuide(page, "Natt");
  await guide.getByRole("checkbox", { name: /Pendellampe/ }).check();
  await guide.getByRole("button", { name: "Neste", exact: true }).click();
  await guide
    .getByRole("button", { name: "Lagre rutine", exact: true })
    .click();
  await expect(guide).not.toBeVisible();
  expect(registeredReads).toBeGreaterThanOrEqual(2);
  expect(boundId).toBe(registryId);
  expect(seen.scenes).toBe(1);
  expect(seen.binds).toHaveLength(1);
  expect(seen.runs + seen.commands + seen.layouts).toBe(0);
});

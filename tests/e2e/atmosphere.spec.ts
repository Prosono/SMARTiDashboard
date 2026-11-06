import {
  test,
  expect,
  type Page,
} from "../../frontend/node_modules/@playwright/test";

async function enter(page: Page) {
  await page.goto("/");
  const loginWaves = page.locator(".login > .atmosphere");
  await expect(loginWaves).toBeVisible();
  await expect(loginWaves).toHaveAttribute("aria-hidden", "true");
  await expect(loginWaves).toHaveAttribute("inert", "");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await expect(
    page.getByRole("navigation", { name: "Hovedmeny" }),
  ).toBeVisible();
  if (
    (await (await page.request.get("/api/home/experience")).json()).mode !==
    "advanced"
  ) {
    await navigate(page, "Innstillinger");
    await page
      .locator('.experience-picker button[data-mode="advanced"]')
      .click();
    await navigate(page, "Hjem");
  }
}
async function navigate(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "Hovedmeny" })
    .getByRole("button", { name, exact: true })
    .click();
}
async function appearance(page: Page) {
  await navigate(page, "Innstillinger");
  await page
    .getByRole("button", { name: "Tema og utseende", exact: true })
    .click();
}
const background = (page: Page) => page.locator("#root > .atmosphere");

test("gentle RGB waves persist behind every destination, home style and palette without obstructing the UI", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  await page.addInitScript(() =>
    localStorage.setItem("smarti-home-style", "harmony"),
  );
  const commands: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/commands")) commands.push(request.url());
  });
  await enter(page);
  const backdrop = background(page);
  await expect(backdrop).toBeVisible();
  await expect(backdrop).toHaveCSS("pointer-events", "none");
  const identity = await backdrop.elementHandle();
  const wave = backdrop.locator(".atmosphere-wave").first();
  const first = await wave.evaluate((node) => getComputedStyle(node).transform);
  await expect
    .poll(() => wave.evaluate((node) => getComputedStyle(node).transform))
    .not.toBe(first);
  const waves = backdrop.locator(".atmosphere-wave");
  await expect(waves).toHaveCount(3);
  await expect(backdrop.locator("svg, canvas")).toHaveCount(0);
  expect(
    await backdrop.evaluate((node) =>
      node
        .getAnimations({ subtree: true })
        .map((a) => a.effect!.getTiming().duration)
        .sort((a, b) => Number(a) - Number(b)),
    ),
  ).toEqual([19000, 29000, 37000]);
  for (const layer of await waves.all()) {
    expect(
      await layer.evaluate((node) => node.clientHeight),
    ).toBeLessThanOrEqual(360);
    const mask = await layer.evaluate(
      (node) => getComputedStyle(node).maskImage,
    );
    expect(mask).toContain("atmosphere/ribbon-");
    const asset = mask.match(/url\(["']?(.+?)["']?\)/)![1];
    expect((await page.request.get(asset)).ok()).toBe(true);
    await expect(layer).toHaveCSS("filter", "none");
    const { sizes, cadence } = await layer.evaluate(async (node) => {
      const animation = node.getAnimations()[0],
        original = animation.currentTime;
      animation.pause();
      await animation.ready;
      const { duration, delay } = animation.effect!.getTiming();
      const samples = [0, 0.25, 0.5, 0.75, 0.99].map((fraction) => {
        animation.currentTime =
          Number(delay) + Number(duration) * (2 + fraction);
        const matrix = new DOMMatrix(getComputedStyle(node).transform);
        return {
          x: Math.hypot(matrix.a, matrix.b),
          y: Math.hypot(matrix.c, matrix.d),
        };
      });
      const cadence = [60010, 60020, 60060].map((time) => {
        animation.currentTime = time;
        return getComputedStyle(node).transform;
      });
      animation.currentTime = original;
      animation.play();
      return { sizes: samples, cadence };
    });
    expect(
      Math.max(...sizes.map((s) => s.y)) / Math.min(...sizes.map((s) => s.y)),
    ).toBeGreaterThan(2);
    expect(
      Math.max(...sizes.map((s) => s.x)) / Math.min(...sizes.map((s) => s.x)),
    ).toBeGreaterThan(1.1);
    expect(cadence[0]).toBe(cadence[1]);
    expect(cadence[2]).not.toBe(cadence[0]);
  }
  const independent = await waves.evaluateAll(async (nodes) => {
    const animations = nodes.map((n) => n.getAnimations()[0]),
      originals = animations.map((a) => a.currentTime);
    animations.forEach((a) => a.pause());
    await Promise.all(animations.map((a) => a.ready));
    const sizes = Array.from({ length: 21 }, (_, i) => {
      animations.forEach((a) => {
        a.currentTime = 60000 + i * 2000;
      });
      return nodes.map((n) => new DOMMatrix(getComputedStyle(n).transform).d);
    });
    animations.forEach((a, i) => {
      a.currentTime = originals[i];
      a.play();
    });
    return sizes.some(
      (row, i) =>
        i > 0 &&
        row.some((y, j) => y - sizes[i - 1][j] > 0.03) &&
        row.some((y, j) => y - sizes[i - 1][j] < -0.03),
    );
  });
  expect(independent).toBe(true);
  for (const name of [
    "Hjem",
    "Rom",
    "Enheter",
    "Automasjoner",
    "Utvidelser",
    "Oppdateringer",
    "Historikk",
    "Rapporter og innsikt",
    "Support",
    "Innstillinger",
  ]) {
    await navigate(page, name);
    await expect(backdrop).toBeVisible();
    expect(
      await backdrop.evaluate((node, original) => node === original, identity),
    ).toBe(true);
    if (name === "Utvidelser") {
      await page.getByRole("tab", { name: "Apper", exact: true }).click();
      await expect(backdrop).toBeVisible();
      expect(
        await backdrop.evaluate(
          (node, original) => node === original,
          identity,
        ),
      ).toBe(true);
    }
  }
  await navigate(page, "Hjem");
  for (const name of [
    "Oversikt",
    "Lys",
    "Energi",
    "Sikkerhet",
    "Klima",
    "Multimedia",
    "Diverse",
  ]) {
    await page.getByRole("tab", { name, exact: true }).click();
    if (name === "Energi") {
      const setup = page.getByRole("dialog", {
        name: "Energien i hjemmet ditt",
        exact: true,
      });
      await expect(setup).toBeVisible();
      await setup
        .getByRole("button", { name: "Lukk innstillinger", exact: true })
        .click();
    }
    await expect(backdrop).toBeVisible();
    expect(
      await backdrop.evaluate((node, original) => node === original, identity),
    ).toBe(true);
  }
  await appearance(page);
  for (const style of ["classic", "living", "harmony"]) {
    await page
      .getByRole("combobox", { name: "Stil for Hjem", exact: true })
      .selectOption(style);
    await navigate(page, "Hjem");
    await expect(backdrop).toBeVisible();
    await appearance(page);
  }
  const tones = new Set<string>();
  for (const palette of [
    "SMARTi",
    "SMARTi Sort",
    "Midnatt",
    "Kobber",
    "Grafitt",
    "Fjord",
    "Skog",
    "Sand",
    "Plomme",
  ]) {
    await page
      .getByRole("button", { name: `Palett: ${palette}`, exact: true })
      .click();
    tones.add(await wave.evaluate((node) => getComputedStyle(node).color));
  }
  expect(tones.size).toBe(9);
  await page
    .getByRole("button", { name: "Palett: SMARTi", exact: true })
    .click();
  for (const theme of ["light", "dark"]) {
    await page
      .getByRole("combobox", { name: "Utseende", exact: true })
      .selectOption(theme);
    await navigate(page, "Hjem");
    await page.getByRole("tab", { name: "Oversikt", exact: true }).click();
    await backdrop.evaluate((node) =>
      node
        .getAnimations({ subtree: true })
        .forEach((animation) => animation.pause()),
    );
    await page.screenshot({
      path: `/private/tmp/smarti-atmosphere-${theme}-${info.project.name}.png`,
    });
    const hideUI = await page.addStyleTag({
      content: ".shell { visibility: hidden !important; }",
    });
    await page.screenshot({
      path: `/private/tmp/smarti-atmosphere-only-${theme}-${info.project.name}.png`,
    });
    await hideUI.evaluate((node) => node.remove());
    for (const width of info.project.name === "mobile"
      ? [320, 390]
      : [834, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      const bounds = await backdrop.boundingBox();
      expect(bounds?.width).toBe(width);
    }
    await appearance(page);
  }
  expect(commands).toEqual([]);
});

test("background motion can be paused, persists, stops while hidden and respects reduced motion and forced colors", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("smarti-home-style", "harmony");
    if (localStorage.getItem("smarti-background-motion") === null)
      localStorage.setItem("smarti-background-motion", "still");
  });
  await enter(page);
  const backdrop = background(page),
    waves = backdrop.locator(".atmosphere-wave");
  await expect(backdrop).toHaveAttribute("data-paused", "true");
  await expect(waves.first()).toHaveCSS("animation-play-state", "paused");
  await appearance(page);
  const motion = page.getByRole("combobox", {
    name: "Bakgrunnsbevegelse",
    exact: true,
  });
  await expect(motion).toHaveValue("still");
  await motion.selectOption("flow");
  await expect(backdrop).toHaveAttribute("data-paused", "false");
  await expect(waves.first()).toHaveCSS("animation-play-state", "running");
  expect(
    await waves.evaluateAll((nodes) =>
      nodes.every(
        (node) => getComputedStyle(node).animationPlayState === "running",
      ),
    ),
  ).toBe(true);
  await page.reload();
  await appearance(page);
  await expect(motion).toHaveValue("flow");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(backdrop).toHaveAttribute("data-paused", "true");
  await expect(waves.first()).toHaveCSS("animation-play-state", "paused");
  expect(
    await waves.evaluateAll((nodes) =>
      nodes.every(
        (node) => getComputedStyle(node).animationPlayState === "paused",
      ),
    ),
  ).toBe(true);
  await page.evaluate(() => {
    delete (document as unknown as { hidden?: boolean }).hidden;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(backdrop).toHaveAttribute("data-paused", "false");
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await waves.evaluateAll((nodes) =>
      nodes.every((node) => getComputedStyle(node).animationName === "none"),
    ),
  ).toBe(true);
  expect(
    await backdrop.evaluate(
      (node) => node.getAnimations({ subtree: true }).length,
    ),
  ).toBe(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(waves.first()).toHaveCSS(
    "animation-name",
    "atmosphere-ribbon-a",
  );
  await motion.selectOption("still");
  await page.reload();
  await expect(backdrop).toHaveAttribute("data-paused", "true");
  await page.emulateMedia({ forcedColors: "active" });
  await expect(backdrop).toBeHidden();
  await page.emulateMedia({ forcedColors: "none", media: "print" });
  await expect(backdrop).toBeHidden();
});

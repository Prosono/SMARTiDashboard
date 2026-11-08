import { test, expect } from "../../frontend/node_modules/@playwright/test";

test("a large flow responds to movement without changing the automation", async ({
  page,
}, info) => {
  if (info.project.name !== "desktop") test.skip();
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
    alias: `Movement benchmark ${Date.now()}`,
    mode: "single",
    triggers: Array.from({ length: 6 }, (_, i) => ({
      trigger: "sun",
      event: "sunset",
      alias: `Start ${i + 1}`,
    })),
    conditions: Array.from({ length: 5 }, () => ({
      condition: "time",
      after: "18:00:00",
    })),
    actions: Array.from({ length: 89 }, (_, i) => ({
      delay: { seconds: i + 1 },
    })),
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
  const studio = page.locator(".flow-studio");
  await expect(studio.locator(".canvas-node")).toHaveCount(100);
  const writes: string[] = [];
  page.on("request", (r) => {
    if (!["GET", "HEAD"].includes(r.method())) writes.push(r.url());
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const samples = await studio.evaluate(async (root) => {
    const node = root.querySelector<HTMLElement>(".canvas-node")!;
    const button = node.querySelector<HTMLButtonElement>(".canvas-drag")!;
    const frame = () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const values: number[] = [];
    for (let i = 0; i < 30; i++) {
      await frame();
      const old = node.getAttribute("style");
      const start = performance.now();
      button.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: i % 2 ? "ArrowUp" : "ArrowDown",
          bubbles: true,
        }),
      );
      while (node.getAttribute("style") === old) await frame();
      values.push(performance.now() - start);
    }
    return values.sort((a, b) => a - b);
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  const metrics = {
    cpuSlowdown: 4,
    cards: 100,
    medianMs: samples[15],
    p95Ms: samples[28],
    maxMs: samples[29],
  };
  console.log("CANVAS_MOVEMENT", JSON.stringify(metrics));
  await info.attach("movement-metrics", {
    body: JSON.stringify(metrics),
    contentType: "application/json",
  });
  expect(metrics.p95Ms).toBeLessThan(200);
  expect(writes).toEqual([]);
  expect(
    (
      await (
        await page.request.get(`/api/manage/automations/${saved.id}`)
      ).json()
    ).config,
  ).toEqual({ ...config, id: saved.id });
});

import { test, expect } from "../../frontend/node_modules/@playwright/test";

test("vivid cards and backward connections stay clear and smooth while rearranging", async ({
  page,
}, info) => {
  if (info.project.name !== "desktop") test.skip();
  await page.setViewportSize({ width: 1440, height: 1050 });
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
    alias: `Smooth evening flow ${Date.now()}`,
    mode: "single",
    triggers: [
      { trigger: "sun", event: "sunset" },
      { trigger: "state", entity_id: "binary_sensor.front_door", to: "on" },
      {
        trigger: "numeric_state",
        entity_id: "sensor.living_temperature",
        below: 20,
      },
    ],
    conditions: [
      { condition: "state", entity_id: "light.living_pendant", state: "on" },
      { condition: "time", after: "18:00:00" },
    ],
    actions: [
      { delay: { seconds: 300 } },
      { action: "light.turn_on", target: { entity_id: "light.kitchen" } },
      { delay: { seconds: 30 } },
      {
        action: "climate.set_temperature",
        target: { entity_id: "climate.living" },
        data: { temperature: 21 },
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
  const studio = page.locator(".flow-studio");
  const writes: string[] = [];
  page.on("request", (r) => {
    if (!["GET", "HEAD"].includes(r.method())) writes.push(r.url());
  });
  const positions = [
    [40, 60],
    [40, 270],
    [40, 480],
    [540, 250],
    [900, 260],
    [700, 520],
    [1300, 420],
    [700, 820],
    [1240, 820],
  ];
  const nodes = studio.locator(".canvas-node");
  await expect(nodes).toHaveCount(positions.length);
  for (let i = 0; i < positions.length; i++) {
    const node = nodes.nth(i),
      button = node.locator(".canvas-drag");
    await button.scrollIntoViewIfNeeded();
    const box = await button.boundingBox();
    const logical = await node.evaluate((el) => {
      const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
      return { x: m.m41, y: m.m42 };
    });
    await page.mouse.move(box!.x + 20, box!.y + 10);
    await page.mouse.down();
    await node.dispatchEvent("pointermove", {
      pointerId: 1,
      buttons: 1,
      clientX: box!.x + 20 + positions[i][0] - logical.x,
      clientY: box!.y + 10 + positions[i][1] - logical.y,
    });
    await page.mouse.up();
    await expect
      .poll(() =>
        node.evaluate((el) => {
          const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
          return [m.m41, m.m42];
        }),
      )
      .toEqual(positions[i]);
  }
  await studio
    .getByRole("button", { name: "Vis hele flyten", exact: true })
    .click();
  const wireCheck = await studio.evaluate((root) => {
    const boxes = Array.from(
      root.querySelectorAll<HTMLElement>(".canvas-node"),
    ).map((el) => {
      const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
      return { x: m.m41, y: m.m42, w: el.offsetWidth, h: el.offsetHeight };
    });
    const paths = Array.from(
      root.querySelectorAll<SVGPathElement>(".canvas-wire-line"),
    );
    let collisions = 0;
    for (const path of paths) {
      const length = path.getTotalLength();
      for (let i = 1; i < 500; i++) {
        const p = path.getPointAtLength((length * i) / 500);
        if (
          boxes.some(
            (b) =>
              p.x > b.x + 0.1 &&
              p.x < b.x + b.w - 0.1 &&
              p.y > b.y + 0.1 &&
              p.y < b.y + b.h - 0.1,
          )
        )
          collisions++;
      }
    }
    return {
      count: paths.length,
      collisions,
      paths: paths.map((p) => p.getAttribute("d")),
    };
  });
  expect(wireCheck.count).toBe(8);
  expect(wireCheck.collisions).toBe(0);
  expect(wireCheck.paths.every((d) => d && !/[QL]/.test(d))).toBe(true);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (theme) => (document.documentElement.dataset.theme = theme),
      theme,
    );
    // Let theme transitions finish before checking contrast and taking the image.
    await page.waitForTimeout(250);
    const colors = await studio.evaluate((root) =>
      ["triggers", "conditions", "actions"].map(
        (kind) =>
          getComputedStyle(root.querySelector(`.canvas-${kind} .canvas-drag`)!)
            .backgroundColor,
      ),
    );
    expect(colors).toEqual([
      "rgb(232, 0, 80)",
      "rgb(36, 88, 255)",
      "rgb(0, 229, 138)",
    ]);
    await studio.screenshot({
      path: info.outputPath(`flowing-${theme}.png`),
      animations: "disabled",
    });
  }
  expect(writes).toEqual([]);
  expect(
    (
      await (
        await page.request.get(`/api/manage/automations/${saved.id}`)
      ).json()
    ).config,
  ).toEqual({ ...config, id: saved.id });
});

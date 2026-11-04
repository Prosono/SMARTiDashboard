import {
  test,
  expect,
  type Page,
} from "../../frontend/node_modules/@playwright/test";

async function login(page: Page) {
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await expect(page.locator(".home-overview")).toBeVisible();
}
function gate() {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { wait, release };
}

for (const first of ["home", "preferences"] as const) {
  test(`one stationary loading screen survives session and parallel home/preferences startup when ${first} finishes first`, async ({
    page,
  }, info) => {
    await page.addInitScript(() =>
      localStorage.setItem("smarti-home-style", "harmony"),
    );
    await login(page);
    const session = gate(),
      home = gate(),
      preferences = gate();
    const requested = { home: 0, preferences: 0 },
      settled = { home: false, preferences: false };
    await page.route("**/api/session", async (route) => {
      if (route.request().method() === "GET") await session.wait;
      await route.continue();
    });
    for (const [key, path, delay] of [
      ["home", "home", home],
      ["preferences", "home/experience", preferences],
    ] as const) {
      await page.route(`**/api/${path}`, async (route) => {
        requested[key]++;
        await delay.wait;
        await route.continue();
        settled[key] = true;
      });
    }
    await page.reload();
    const loading = page.locator(".startup-screen");
    await expect(loading).toHaveCount(1);
    await expect(loading).toContainText("Henter hjemmet");
    await expect(loading).toHaveAttribute("role", "status");
    const original = (await loading.elementHandle())!;
    const spinner = (await loading
      .locator(".startup-spinner")
      .elementHandle())!;
    const position = await loading.locator(".startup-symbol").boundingBox();
    expect(requested).toEqual({ home: 0, preferences: 0 });
    session.release();
    await expect.poll(() => requested).toEqual({ home: 1, preferences: 1 });
    (first === "home" ? home : preferences).release();
    await expect.poll(() => settled[first]).toBe(true);
    // Allow React to paint the intermediate state, with the other request held.
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    expect(
      await original.evaluate(
        (node) => node === document.querySelector(".startup-screen"),
      ),
    ).toBe(true);
    expect(
      await spinner.evaluate(
        (node) =>
          node === document.querySelector(".startup-screen .startup-spinner"),
      ),
    ).toBe(true);
    expect(await loading.locator(".startup-symbol").boundingBox()).toEqual(
      position,
    );
    await expect(page.locator(".shell")).toHaveCount(0);
    await expect(page.locator(".login")).toHaveCount(0);
    await page.screenshot({
      path: `/private/tmp/smarti-111-startup-${info.project.name}-${first}.png`,
      animations: "disabled",
    });
    (first === "home" ? preferences : home).release();
    await expect(page.locator(".home-overview")).toBeVisible();
    await expect(loading).toHaveCount(0);
    expect(await original.evaluate((node) => node.isConnected)).toBe(false);
  });
}

test("signed-out startup fetches no home data; a failed initial home load remains retryable", async ({
  page,
}) => {
  let calls = 0,
    failed = true;
  const background = gate();
  await page.addInitScript(() =>
    localStorage.setItem("smarti-home-style", "harmony"),
  );
  await page.route("**/api/home", async (route) => {
    calls++;
    if (calls > 2) await background.wait;
    if (failed)
      await route.fulfill({ status: 503, json: { detail: "unavailable" } });
    else await route.continue();
  });
  await page.goto("/");
  await expect(page.getByLabel("Brukernavn", { exact: true })).toBeVisible();
  expect(calls).toBe(0);
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await expect(page.locator(".empty")).toBeVisible();
  await expect(page.locator(".startup-screen")).toHaveCount(0);
  // A live-connection refresh after a failed initial request must retain the page.
  await expect.poll(() => calls).toBe(3);
  await expect(page.locator(".startup-screen")).toHaveCount(0);
  await expect(page.locator(".empty")).toBeVisible();
  background.release();
  const retry = page.getByRole("button", { name: "Prøv igjen", exact: true });
  await expect(retry).toBeEnabled();
  expect(calls).toBe(4); // Both failed fetches use the existing single retry.
  failed = false;
  await retry.click();
  await expect(page.locator(".home-overview")).toBeVisible();
  await expect(page.locator(".startup-screen")).toHaveCount(0);
});

test("loading has one edge-to-edge background on tablets and wide desktops", async ({
  page,
}, info) => {
  const session = gate();
  await page.route("**/api/session", async (route) => {
    await session.wait;
    await route.continue();
  });
  await page.addInitScript(() =>
    localStorage.setItem("smarti-home-style", "harmony"),
  );
  await page.goto("/");
  const loading = page.locator(".startup-screen");
  await expect(loading).toBeVisible();
  for (const theme of ["light", "dark"]) {
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
    }, theme);
    for (const width of [768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 1080 });
      const surface = await loading.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const corners = [
          [0, 0],
          [innerWidth - 1, 0],
          [0, innerHeight - 1],
          [innerWidth - 1, innerHeight - 1],
        ];
        return {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          coversCorners: corners.every(
            ([x, y]) => document.elementFromPoint(x, y) === element,
          ),
        };
      });
      expect(surface).toEqual({
        left: 0,
        top: 0,
        width,
        height: 1080,
        coversCorners: true,
      });
      await expect(loading.locator(".startup-symbol")).toHaveCSS(
        "background-color",
        "rgba(0, 0, 0, 0)",
      );
      await expect(loading.locator(".startup-symbol img")).toHaveCSS(
        "background-color",
        "rgba(0, 0, 0, 0)",
      );
    }
    await page.screenshot({
      path: `/private/tmp/smarti-113-wide-${info.project.name}-${theme}.png`,
      animations: "disabled",
    });
  }
  session.release();
});

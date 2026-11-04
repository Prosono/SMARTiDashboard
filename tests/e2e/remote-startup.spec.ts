import {
  test,
  expect,
  type Page,
} from "../../frontend/node_modules/@playwright/test";

function gate() {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { wait, release };
}
async function authorize(page: Page, baseURL: string) {
  const response = await page.request.post("/api/login", {
    headers: { origin: new URL(baseURL).origin },
    data: { name: "tester", password: "test-password-not-for-live" },
  });
  expect(response.ok()).toBe(true);
}

for (const theme of ["light", "dark"]) {
  test(`opening from My homes keeps one clean animation through redemption, session and dashboard in ${theme}`, async ({
    page,
    baseURL,
  }, info) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.addInitScript((theme) => {
      localStorage.setItem("smarti-home-style", "harmony");
      localStorage.setItem("smarti-theme", theme);
    }, theme);
    await authorize(page, baseURL!);
    const access = gate(),
      session = gate(),
      home = gate(),
      preferences = gate();
    let redeemed = 0,
      sessions = 0,
      homes = 0,
      prefs = 0,
      documents = 0;
    page.on("request", (request) => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame())
        documents++;
    });
    const ticket = "x".repeat(48);
    await page.route("**/api/customer-access/redeem", async (route) => {
      redeemed++;
      expect(route.request().postDataJSON()).toEqual({ token: ticket });
      await access.wait;
      await route.fulfill({ json: { ready: true } });
    });
    await page.route("**/api/session", async (route) => {
      if (route.request().method() === "GET") {
        sessions++;
        await session.wait;
      }
      await route.continue();
    });
    await page.route("**/api/home", async (route) => {
      homes++;
      await home.wait;
      await route.continue();
    });
    await page.route("**/api/home/experience", async (route) => {
      prefs++;
      await preferences.wait;
      await route.continue();
    });
    await page.goto(`/_account#${ticket}`);
    const loading = page.locator(".startup-screen"),
      spinner = loading.locator(".startup-spinner");
    await expect(loading).toHaveCount(1);
    await expect(loading).toHaveAttribute("aria-busy", "true");
    await expect.poll(() => redeemed).toBe(1);
    expect(new URL(page.url()).hash).toBe("");
    expect(new URL(page.url()).pathname).toBe("/");
    expect([sessions, homes, prefs]).toEqual([0, 0, 0]);
    const original = (await spinner.elementHandle())!;
    const originalScreen = (await loading.elementHandle())!;
    const position = await loading.locator(".startup-symbol").boundingBox();
    await expect(page.locator(".atmosphere-wave").first()).toHaveCSS(
      "animation-play-state",
      "paused",
    );
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.getAnimations().filter((a) => a.playState === "running")
              .length,
        ),
      )
      .toBe(1);
    const startedAt = await spinner.evaluate(
      (el) => el.getAnimations()[0].startTime,
    );
    access.release();
    await expect.poll(() => sessions).toBe(1);
    expect(homes).toBe(0);
    expect(
      await original.evaluate(
        (el) => el === document.querySelector(".startup-spinner"),
      ),
    ).toBe(true);
    session.release();
    await expect.poll(() => homes > 0 && prefs > 0).toBe(true);
    preferences.release();
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    expect(
      await spinner.evaluate((el) => el.getAnimations()[0].startTime),
    ).toBe(startedAt);
    expect(await loading.locator(".startup-symbol").boundingBox()).toEqual(
      position,
    );
    expect(
      await originalScreen.evaluate(
        (el) => el === document.querySelector(".startup-screen"),
      ),
    ).toBe(true);
    await expect(page.locator(".shell, .login")).toHaveCount(0);
    await expect(page.getByText("Velkommen hjem", { exact: true })).toHaveCount(
      0,
    );
    await page.screenshot({
      path: `/private/tmp/smarti-112-loading-${info.project.name}-${theme}.png`,
    });
    home.release();
    await expect(page.locator(".home-overview")).toBeVisible();
    await expect(loading).toHaveCount(0);
    expect(redeemed).toBe(1);
    expect(documents).toBe(1);
    expect(page.url()).toBe(new URL("/", baseURL!).href);
  });
}

test("a failed opening never replays the ticket, loads the dashboard or falls through to an existing login", async ({
  page,
  baseURL,
}) => {
  await authorize(page, baseURL!);
  let redeemed = 0,
    sessions = 0,
    homes = 0;
  await page.route("**/api/customer-access/redeem", (route) => {
    redeemed++;
    return route.fulfill({ status: 401, json: { detail: "expired" } });
  });
  await page.route("**/api/session", (route) => {
    sessions++;
    return route.continue();
  });
  await page.route("**/api/home", (route) => {
    homes++;
    return route.continue();
  });
  await page.goto("/_account#" + "x".repeat(48));
  const status = page.getByRole("status");
  await expect(status).toContainText("Kunne ikke bekrefte tilgangen");
  await expect(status).toHaveAttribute("aria-busy", "false");
  await expect(page.locator(".startup-spinner, .shell, .login")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Tilbake til Mine hjem" }),
  ).toHaveAttribute("href", "https://home.smarti.dev/");
  await page.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("online"));
  });
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(resolve)),
  );
  expect([redeemed, sessions, homes]).toEqual([1, 0, 0]);
  expect(new URL(page.url()).hash).toBe("");
});

test("a missing launch ticket stops cleanly without access or session requests", async ({
  page,
}) => {
  let requested = 0;
  await page.route("**/api/**", (route) => {
    requested++;
    return route.continue();
  });
  await page.goto("/_account");
  await expect(page.getByRole("status")).toContainText(
    "Kunne ikke bekrefte tilgangen",
  );
  expect(requested).toBe(0);
  await expect(page.locator(".startup-spinner, .shell, .login")).toHaveCount(0);
});

test("the single loading animation respects reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const session = gate();
  await page.route("**/api/session", async (route) => {
    await session.wait;
    await route.continue();
  });
  await page.goto("/");
  await expect(page.locator(".startup-spinner")).toHaveCSS(
    "animation-name",
    "none",
  );
  session.release();
  await expect(page.getByLabel("Brukernavn", { exact: true })).toBeVisible();
});

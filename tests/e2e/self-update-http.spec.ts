import {
  test,
  expect,
  type Page,
} from "../../frontend/node_modules/@playwright/test";

async function updatePage(page: Page) {
  const requests: Record<string, unknown>[] = [];
  const errors: string[] = [];
  const state = { result: "accepted", version: "1.36.114" };
  page.on("pageerror", (error) => errors.push(error.message));
  // Non-secure LAN HTTP exposes getRandomValues, but not randomUUID.
  await page.addInitScript(() => {
    Object.defineProperty(Crypto.prototype, "randomUUID", {
      configurable: true,
      value: undefined,
    });
  });
  await page.route("**/api/manage/apps/self-update/check", (route) =>
    route.fulfill({
      json: {
        slug: "abc_smarti",
        version: state.version,
        version_latest: "1.36.115",
        update_available: true,
        checked_at: Date.now() / 1000,
        check_error: false,
      },
    }),
  );
  await page.route("**/api/manage/apps/self-update", (route) => {
    if (route.request().method() === "POST") {
      requests.push(route.request().postDataJSON());
      return route.fulfill({ json: { status: state.result } });
    }
    return route.fulfill({
      json: { slug: "abc_smarti", version: state.version, state: "started" },
    });
  });
  await page.route("**/api/manage/updates", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await page
    .getByRole("button", { name: "Innstillinger", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: /^Normal/ }).click();
  await page
    .getByRole("navigation", { name: "Hovedmeny" })
    .getByRole("button", { name: "Oppdateringer", exact: true })
    .click();
  const update = page.getByRole("button", {
    name: "Oppdater SMARTi",
    exact: true,
  });
  await expect(update).toBeVisible();
  return { requests, errors, state, update };
}

test("local HTTP update confirmation sends one valid request and reaches the updated version", async ({
  page,
}) => {
  const data = await updatePage(page);
  await data.update.click();
  const confirm = page.getByRole("dialog", {
    name: "Oppdater SMARTi?",
    exact: true,
  });
  await expect(confirm).toBeVisible();
  expect(data.requests).toHaveLength(0);
  await confirm
    .getByRole("checkbox", { name: "Ta sikkerhetskopi først", exact: true })
    .uncheck();
  await confirm
    .getByRole("button", { name: "Bekreft oppdatering", exact: true })
    .click();
  await expect.poll(() => data.requests.length).toBe(1);
  expect(data.requests[0]).toEqual({
    request_id: expect.stringMatching(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    ),
    action: "update",
    confirm_slug: "abc_smarti",
    backup: false,
  });
  await expect(confirm).toHaveCount(0);
  const progress = page.getByRole("dialog", {
    name: "Oppdaterer SMARTi",
    exact: true,
  });
  await expect(progress).toBeVisible();
  await expect(
    progress.getByRole("heading", { name: "SMARTi er oppdatert", exact: true }),
  ).toHaveCount(0);
  data.state.version = "1.36.115";
  await expect(
    progress.getByRole("heading", { name: "SMARTi er oppdatert", exact: true }),
  ).toBeVisible({ timeout: 10000 });
  expect(data.requests).toHaveLength(1);
  expect(data.errors).toHaveLength(0);
});

test("a definite rejection can be retried only after a new confirmation", async ({
  page,
}) => {
  const data = await updatePage(page);
  data.state.result = "failed";
  await data.update.click();
  await page
    .getByRole("dialog", { name: "Oppdater SMARTi?", exact: true })
    .getByRole("button", { name: "Bekreft oppdatering", exact: true })
    .click();
  await expect(
    page.getByText(/Home Assistant avviste oppdateringen/),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(data.update).toBeEnabled();
  expect(data.requests).toHaveLength(1);
  data.state.result = "accepted";
  await data.update.click();
  expect(data.requests).toHaveLength(1);
  await page
    .getByRole("dialog", { name: "Oppdater SMARTi?", exact: true })
    .getByRole("button", { name: "Bekreft oppdatering", exact: true })
    .click();
  await expect.poll(() => data.requests.length).toBe(2);
  expect(data.requests[1].request_id).not.toBe(data.requests[0].request_id);
  expect(data.requests[1].backup).toBe(true);
  expect(data.errors).toHaveLength(0);
});

test("an unconfirmed result keeps its request locked and is not resubmitted", async ({
  page,
}) => {
  const data = await updatePage(page);
  data.state.result = "unconfirmed";
  await data.update.click();
  await page
    .getByRole("dialog", { name: "Oppdater SMARTi?", exact: true })
    .getByRole("button", { name: "Bekreft oppdatering", exact: true })
    .click();
  const progress = page.getByRole("dialog", {
    name: "Oppdaterer SMARTi",
    exact: true,
  });
  await expect(progress).toBeVisible();
  await progress
    .getByRole("button", { name: "Lukk visningen", exact: true })
    .click();
  await expect(page.getByText(/Resultatet er ikke bekreftet/)).toBeVisible();
  await expect(data.update).toBeDisabled();
  expect(data.requests).toHaveLength(1);
  expect(data.errors).toHaveLength(0);
});

test("a browser preparation failure exits busy state without sending and allows a fresh attempt", async ({
  page,
}) => {
  const data = await updatePage(page);
  await data.update.click();
  await page.evaluate(() => {
    Object.defineProperty(crypto, "getRandomValues", {
      configurable: true,
      value: () => {
        throw new Error("fixture random source unavailable");
      },
    });
  });
  await page
    .getByRole("dialog", { name: "Oppdater SMARTi?", exact: true })
    .getByRole("button", { name: "Bekreft oppdatering", exact: true })
    .click();
  await expect(page.getByText(/Ingen oppdatering ble sendt/)).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(data.update).toBeEnabled();
  expect(data.requests).toHaveLength(0);
  await page.evaluate(() => {
    Reflect.deleteProperty(crypto, "getRandomValues");
  });
  await data.update.click();
  await page
    .getByRole("dialog", { name: "Oppdater SMARTi?", exact: true })
    .getByRole("button", { name: "Bekreft oppdatering", exact: true })
    .click();
  await expect.poll(() => data.requests.length).toBe(1);
  await expect(
    page.getByRole("dialog", { name: "Oppdaterer SMARTi", exact: true }),
  ).toBeVisible();
  expect(data.errors).toHaveLength(0);
});

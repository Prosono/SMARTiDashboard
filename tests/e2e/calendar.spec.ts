import { test, expect } from "../../frontend/node_modules/@playwright/test";
test("calendar selection, day navigation, details and failure states", async ({
  page,
}) => {
  let selected: string[] = [];
  await page.route("**/api/home/calendar", (r) => {
    if (r.request().method() === "PUT")
      selected = r.request().postDataJSON().calendars;
    return r.fulfill({
      json: {
        sources: [
          { id: "calendar.family", name: "Familie" },
          { id: "calendar.work", name: "Jobb" },
        ],
        calendars: selected,
        today: "2026-10-13",
        timezone: "Europe/Oslo",
      },
    });
  });
  const family = {
    calendar: "calendar.family",
    summary: "Middag hos bestemor",
    start: "2026-10-13T17:00:00+02:00",
    end: "2026-10-13T19:00:00+02:00",
    all_day: false,
    location: "Hos bestemor",
    description: "Ta med dessert.",
  };
  let fail = false;
  await page.route("**/api/home/calendar/events?**", (r) => {
    if (fail)
      return r.fulfill({
        status: 503,
        json: { detail: "calendar_disconnected" },
      });
    const start = new URL(r.request().url()).searchParams.get("start");
    return r.fulfill({
      json: {
        timezone: "Europe/Oslo",
        failed: [],
        truncated: false,
        days:
          start === "2026-10-13"
            ? {
                "2026-10-13": [
                  family,
                  {
                    ...family,
                    summary: "Høstferie",
                    start: "2026-10-13T00:00:00+02:00",
                    end: "2026-10-15T00:00:00+02:00",
                    all_day: true,
                  },
                ],
                "2026-10-14": [
                  { ...family, summary: "Høstferie", all_day: true },
                ],
              }
            : {},
      },
    });
  });
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await page.getByText("Vis hele kalenderen", { exact: true }).click();
  const calendar = page.getByRole("region", { name: "Kalender", exact: true });
  await expect(calendar).toContainText("Samle dagene her");
  await calendar
    .getByRole("button", { name: "Velg kalendere", exact: true })
    .first()
    .click();
  await calendar
    .getByRole("checkbox", { name: "Familie", exact: true })
    .check();
  await calendar
    .getByRole("button", { name: "Lagre valg", exact: true })
    .click();
  await expect(calendar).toContainText("Middag hos bestemor");
  await calendar
    .locator("summary")
    .filter({ hasText: "Middag hos bestemor" })
    .click();
  await expect(calendar).toContainText("Ta med dessert.");
  await expect(calendar).toContainText("17:00");
  await expect(calendar).toContainText("Hele dagen");
  await calendar.scrollIntoViewIfNeeded();
  await calendar.screenshot({
    path: `../artifacts/${test.info().project.name}-calendar.png`,
  });
  await calendar.getByRole("button", { name: /onsdag 14. oktober/ }).click();
  await expect(calendar).not.toContainText("Middag hos bestemor");
  await expect(calendar).toContainText("Høstferie");
  await calendar
    .getByRole("button", { name: "Neste uke", exact: true })
    .click();
  await expect(calendar).toContainText("Luft i kalenderen");
  await calendar.getByRole("button", { name: "I dag", exact: true }).click();
  await expect(calendar).toContainText("Middag hos bestemor");
  await page.reload();
  await page.getByText("Vis hele kalenderen", { exact: true }).click();
  await expect(calendar).toContainText("Middag hos bestemor");
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
  });
  await calendar.scrollIntoViewIfNeeded();
  await calendar.screenshot({
    path: `../artifacts/${test.info().project.name}-calendar-dark.png`,
  });
  fail = true;
  await calendar.getByRole("button", { name: "Oppdater avtaler" }).click();
  await expect(calendar.getByRole("alert")).toContainText(
    "Avtalene kunne ikke hentes",
  );
  await expect(calendar).not.toContainText("Middag hos bestemor");
});

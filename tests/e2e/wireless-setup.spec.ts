import { test, expect } from "../../frontend/node_modules/@playwright/test";

test("Bluetooth discovery and network Matter use separate, honest setup dialogs", async ({
  page,
}) => {
  let session: null | { id: string; status: string } = null;
  let commissioned = 0;
  await page.route("**/api/setup/matter", async (route) => {
    if (route.request().method() === "POST") {
      commissioned++;
      expect(route.request().postDataJSON().code).toBe("1234-567-8901");
      session = { id: "test", status: "paired" };
      return route.fulfill({ json: session });
    }
    return route.fulfill({ json: { ready: true, session } });
  });
  await page.route("**/api/manage/integration-setup/**", async (route) => {
    const url = route.request().url();
    if (url.endsWith("/bluetooth"))
      return route.fulfill({
        json: {
          loaded: true,
          discoveries: [{ id: "ble", domain: "switchbot", name: "Gardinen" }],
        },
      });
    if (url.includes("/catalog")) return route.fulfill({ json: [] });
    return route.fulfill({
      json: {
        type: "form",
        flow_id: "ble",
        domain: "switchbot",
        step_id: "confirm",
        data_schema: [],
        translations: {},
      },
    });
  });
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Enheter", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Legg til ny enhet", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Finn Bluetooth-enheter", exact: true })
    .click();
  await page.getByRole("button", { name: /Gardinen/ }).click();
  await expect(page.getByRole("dialog")).toContainText("Fortsett");
  await page
    .getByRole("button", { name: "Avbryt oppsett", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Bluetooth-enheter");
  await page.getByRole("button", { name: "Lukk innstillinger", exact: true }).click();
  await page
    .getByRole("button", { name: "Legg til Matter-enhet", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Helt ny enhet", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Companion");
  expect(commissioned).toBe(0);
  await page
    .getByRole("button", { name: "Allerede på nettverket", exact: true })
    .click();
  await page.getByLabel("Matter-kode").fill("1234-567-8901");
  await page
    .getByRole("button", { name: "Koble til enheten", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Matter-enheten er koblet til",
  );
  expect(commissioned).toBe(1);
});

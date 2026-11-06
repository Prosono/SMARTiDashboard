import { test, expect } from "../../frontend/node_modules/@playwright/test";

for (const reply of [
  "completed",
  "accepted",
  "unconfirmed",
  "lost",
  "failed",
]) {
  test(`non-SMARTi installation follows actual state after ${reply} reply without a false failure or resend`, async ({
    page,
  }) => {
    let writes = 0;
    const update = {
      entity_id: "update.mqtt_firmware",
      name: "MQTT programvare",
      smarti: false,
      category: "extensions",
      installed_version: "1",
      latest_version: "2",
      state: "on",
      in_progress: false,
      percentage: null as number | null,
      pending: false,
      can_install: true,
      can_backup: true,
      summary: "",
    };
    await page.route("**/api/home/experience", (route) =>
      route.fulfill({ json: { mode: "advanced" } }),
    );
    await page.route("**/api/manage/apps/self-update/check", (route) =>
      route.fulfill({
        json: {
          slug: "abc_smarti",
          version: "1.36.115",
          version_latest: "1.36.115",
          update_available: false,
        },
      }),
    );
    await page.route("**/api/manage/updates", (route) =>
      route.fulfill({ json: [update] }),
    );
    await page.route(
      "**/api/manage/updates/update.mqtt_firmware/install",
      (route) => {
        writes++;
        expect(route.request().postDataJSON()).toEqual({
          version: "2",
          backup: true,
        });
        if (reply === "accepted") {
          update.in_progress = true;
          update.percentage = 35;
        }
        return reply === "lost"
          ? route.fulfill({ status: 503, json: { detail: "lost_reply" } })
          : route.fulfill({ json: { status: reply } });
      },
    );
    await page.goto("/");
    await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
    await page
      .getByLabel("Passord", { exact: true })
      .fill("test-password-not-for-live");
    await page.getByRole("button", { name: "Logg inn", exact: true }).click();
    await page
      .getByRole("navigation", { name: "Hovedmeny" })
      .getByRole("button", { name: "Oppdateringer", exact: true })
      .click();
    await page.getByRole("tab", { name: "Utvidelser", exact: true }).click();
    const row = page
      .locator(".system-row")
      .filter({ hasText: "MQTT programvare" });
    await row.getByRole("button", { name: "Installer", exact: true }).click();
    expect(writes).toBe(0);
    await row
      .getByRole("button", { name: "Bekreft installasjon", exact: true })
      .click();
    const result = page.locator(".update-install-result");
    await expect(result).toBeVisible();
    await expect(
      page.getByText(
        "Handlingen kunne ikke bekreftes. Kontroller status før du prøver igjen.",
        { exact: true },
      ),
    ).toHaveCount(0);
    expect(writes).toBe(1);
    if (reply === "failed") {
      await expect(result).toHaveAttribute("data-status", "failed");
      await expect(result).toContainText("avvist");
      await expect(
        row.getByRole("button", { name: "Installer", exact: true }),
      ).toBeEnabled();
      return;
    }
    await expect(
      row.getByRole("button", { name: "Installer", exact: true }),
    ).toBeDisabled();
    if (reply === "accepted") await expect(result).toContainText("35 %");
    if (reply === "lost" || reply === "unconfirmed") {
      await expect(result).toHaveAttribute("data-status", "unconfirmed");
      await expect(result).toContainText("Venter på bekreftelse");
      await expect(result).not.toContainText("Oppdatert til");
    }
    update.installed_version = "2";
    update.state = "off";
    update.in_progress = false;
    update.percentage = null;
    await expect(result).toHaveAttribute("data-status", "completed", {
      timeout: 7000,
    });
    await expect(result).toContainText("Oppdatert til 2");
    expect(writes).toBe(1);
  });
}

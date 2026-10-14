import { test, expect } from "../../frontend/node_modules/@playwright/test";
for (const provider of ["zigbee2mqtt", "zwave_js"])
  test(`${provider} pairing asks for name and room before opening inventory`, async ({
    page,
  }) => {
    let session: any = null,
      registered = false,
      saved: any = null;
    const id = provider === "zigbee2mqtt" ? "0x123" : "entry:7";
    await page.route("**/api/setup/providers", (r) =>
      r.fulfill({
        json: [
          {
            id: provider,
            status: "ready",
            entries:
              provider === "zwave_js" ? [{ id: "entry", name: "Home" }] : [],
          },
        ],
      }),
    );
    await page.route("**/api/setup/session", (r) =>
      r.fulfill({ json: session }),
    );
    await page.route("**/api/setup/sessions", (r) => {
      session = {
        id: "pair",
        provider,
        status: "searching",
        radio_open: true,
        expires_at: Date.now() / 1000 + 120,
      };
      return r.fulfill({ json: session });
    });
    await page.route(`**/api/devices/${provider}/detail?*`, (r) =>
      r.fulfill({ json: { ha_device_id: registered ? "ha-device" : null } }),
    );
    await page.route("**/api/manage/rooms", (r) =>
      r.fulfill({ json: { areas: [{ area_id: "living", name: "Stue" }] } }),
    );
    await page.route("**/api/setup/sessions/pair/finish", (r) => {
      saved = r.request().postDataJSON();
      session.setup_completed = true;
      return r.fulfill({ json: { id, provider, name: saved.name } });
    });
    await page.route(`**/api/devices/${provider}`, (r) =>
      r.fulfill({
        json: {
          status: "ready",
          devices: saved
            ? [{ id, name: saved.name, status: "online", removable: true }]
            : [],
        },
      }),
    );
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
      .getByRole("button", { name: "Start paring", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Stopp paring", exact: true }),
    ).toBeVisible();
    session = {
      ...session,
      status: "paired",
      device_id: id,
      device_name: "Ny enhet",
      radio_open: false,
    };
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Gi enheten et navn og et rom");
    await dialog.getByLabel("Enhetens navn").fill("Taklys stue");
    await dialog.getByLabel("Rom / område").selectOption("living");
    const save = dialog.getByRole("button", { name: "Lagre og vis enheten" });
    await expect(save).toBeDisabled();
    registered = true;
    await dialog.getByRole("button", { name: "Sjekk igjen" }).click();
    await expect(save).toBeEnabled();
    await save.click();
    await expect(dialog).toHaveCount(0);
    expect(saved).toEqual({ name: "Taklys stue", area_id: "living" });
    await expect(page.locator(".protocol-devices")).toHaveAttribute(
      "data-protocol",
      provider,
    );
    await expect(
      page.getByRole("button", { name: /^Taklys stue/ }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Legg til ny enhet", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

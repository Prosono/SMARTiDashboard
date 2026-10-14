import { test, expect } from "../../frontend/node_modules/@playwright/test";

test("Zigbee pairing opens inventory, waits for device and does not reopen an old result", async ({
  page,
}) => {
  let session: any = null;
  let visible = false;
  await page.route("**/api/setup/providers", (r) =>
    r.fulfill({ json: [{ id: "zigbee2mqtt", status: "ready", entries: [] }] }),
  );
  await page.route("**/api/setup/session", (r) => r.fulfill({ json: session }));
  await page.route("**/api/setup/sessions", (r) => {
    session = {
      id: "new-pair",
      provider: "zigbee2mqtt",
      status: "searching",
      radio_open: true,
      expires_at: Date.now() / 1000 + 120,
    };
    return r.fulfill({ json: session });
  });
  await page.route("**/api/devices/zigbee2mqtt", (r) =>
    r.fulfill({
      json: {
        status: "ready",
        devices: visible
          ? [
              {
                id: "0x123",
                name: "Ny lampe",
                status: "online",
                removable: true,
              },
            ]
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
  await page.getByRole("button", { name: "Start paring", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Stopp paring", exact: true }),
  ).toBeVisible();
  session = {
    ...session,
    status: "paired",
    device_id: "0x123",
    device_name: "Ny lampe",
    radio_open: false,
  };
  await expect(
    page.getByText(
      "Enheten er paret. Venter på at enhetsoversikten oppdateres …",
    ),
  ).toBeVisible();
  visible = true;
  await page.getByRole("button", { name: "Oppdater", exact: true }).click();
  await expect(page.getByText("Nylig lagt til", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Ny lampe/ })).toBeVisible();
  await page
    .getByRole("button", { name: "Legg til ny enhet", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Koble noe nytt til hjemmet." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start paring", exact: true }),
  ).toBeEnabled();
});

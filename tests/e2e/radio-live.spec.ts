import { test, expect } from "../../frontend/node_modules/@playwright/test";
test("radio events refresh visible device status without waiting for the five-second poll", async ({
  page,
}) => {
  await page.addInitScript(() => {
    class FakeEvents {
      onmessage: ((e: { data: string }) => void) | null = null;
      listener = (e: Event) =>
        this.onmessage?.({ data: JSON.stringify((e as CustomEvent).detail) });
      constructor() {
        window.addEventListener("radio-test", this.listener);
      }
      addEventListener() {}
      close() {
        window.removeEventListener("radio-test", this.listener);
      }
    }
    Object.defineProperty(window, "EventSource", { value: FakeEvents });
  });
  let online = false,
    reads = 0;
  await page.route("**/api/devices/zigbee2mqtt", (r) => {
    reads++;
    return r.fulfill({
      json: {
        status: "ready",
        devices: [
          {
            id: "lamp",
            name: "Lampe",
            status: online ? "online" : "offline",
            removable: true,
          },
        ],
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
  await page.getByRole("button", { name: "Zigbee", exact: true }).click();
  await expect(page.locator(".protocol-health")).toContainText("Utilgjengelig");
  const before = reads;
  online = true;
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("radio-test", {
        detail: { revision: 1, radio_revision: 2 },
      }),
    ),
  );
  await expect(page.locator(".protocol-health")).toContainText("Tilkoblet", {
    timeout: 1500,
  });
  expect(reads).toBeGreaterThan(before);
  online = false;
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("radio-test", {
        detail: { revision: 1, radio_revision: 3 },
      }),
    ),
  );
  await expect(page.locator(".protocol-health")).toContainText(
    "Utilgjengelig",
    { timeout: 1500 },
  );
});

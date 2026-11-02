import {
  test,
  expect,
  type Page,
} from "../../frontend/node_modules/@playwright/test";

async function setup(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("smarti-home-style", "harmony");
    localStorage.setItem("smarti-theme", "light");
  });
  let switchState = "on";
  const commands: Record<string, unknown>[] = [];
  const make = (
    id: string,
    name: string,
    state: string,
    device: string,
    attributes = {},
    actions: string[] = [],
  ) => ({
    id,
    entity_id: id,
    domain: id.split(".")[0],
    name,
    state,
    device_id: device,
    area_id: "living",
    attributes,
    availability: state === "unavailable" ? "unavailable" : "available",
    capabilities: actions.length ? [{ kind: "switch", actions }] : [],
    diagnostic: false,
    updated_at: null,
    integration: null,
  });
  const sensor = (
    id: string,
    name: string,
    state: string,
    device: string,
    unit: string,
  ) =>
    make(`sensor.${id}`, name, state, device, {
      device_class: unit.includes("h") ? "energy" : "power",
      unit_of_measurement: unit,
    });
  const controls = () => [
    sensor("led_power", "LED lys Soverom Jakob power", "14.9", "led", "W"),
    sensor(
      "led_energy",
      "LED lys Soverom Jakob energy",
      "0.0246",
      "led",
      "kWh",
    ),
    make("switch.led", "LED lys Soverom Jakob", switchState, "led", {}, [
      "turn_on",
      "turn_off",
    ]),
    sensor(
      "bulb_energy",
      "Lyspære Soverom Jakob 2 Forbruk",
      "0",
      "bulb",
      "kWh",
    ),
    sensor("night_power", "Nattlampe Soverom Jakob power", "0", "night", "W"),
    sensor(
      "night_energy",
      "Nattlampe Soverom Jakob energy",
      "0.000248",
      "night",
      "kWh",
    ),
    sensor(
      "large",
      "Samlet registrert energiforbruk for utstyr på soverommet til Jakob",
      "123456.789",
      "meter",
      "kWh",
    ),
    sensor(
      "unavailable",
      "Utilgjengelig måler",
      "unavailable",
      "unavailable",
      "W",
    ),
    sensor("other_power", "Annen enhet effekt", "81.2", "other", "W"),
    sensor("other_energy", "Annen enhet energi", "1.234", "other", "kWh"),
  ];
  await page.route("**/api/home", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      json: {
        ...(await response.json()),
        controls: controls(),
        areas: [{ area_id: "living", name: "Soverom Jakob" }],
      },
    });
  });
  await page.route("**/api/controls/switch.led/commands", async (route) => {
    const body = route.request().postDataJSON();
    commands.push(body);
    switchState = body.action === "turn_off" ? "off" : "on";
    await route.fulfill({ json: { status: "state_updated" } });
  });
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Hovedmeny" })
    .getByRole("button", { name: "Rom", exact: true })
    .click();
  await page
    .locator(".room-summary-card")
    .filter({ hasText: "Soverom Jakob" })
    .click();
  await expect(page.locator(".room-section-power .harmony-device")).toHaveCount(
    10,
  );
  return { commands };
}
const card = (page: Page, name: string) =>
  page.locator(".room-detail .harmony-device").filter({
    has: page.getByRole("button", { name: `Åpne ${name}`, exact: true }),
  });

test("room power cards fit phone, tablet and desktop widths in both themes without broken units or overlaps", async ({
  page,
}, info) => {
  await setup(page);
  for (const theme of ["light", "dark"]) {
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
    }, theme);
    for (const width of [320, 390, 430, 834, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      const cards = page.locator(".room-section-power .harmony-device");
      const geometry = await cards.evaluateAll((nodes) =>
        nodes.map((node) => {
          const box = node.getBoundingClientRect();
          const values = Array.from(
            node.querySelectorAll(".equipment-measurement"),
          ).map((value) => {
            const rect = value.getBoundingClientRect();
            const unit = value.querySelector(".equipment-measurement-unit")!;
            return {
              left: rect.left,
              right: rect.right,
              bottom: rect.bottom,
              unitLines: unit.getClientRects().length,
            };
          });
          return {
            left: box.left,
            right: box.right,
            top: box.top,
            bottom: box.bottom,
            scrollHeight: node.scrollHeight,
            height: node.clientHeight,
            scrollWidth: node.scrollWidth,
            width: node.clientWidth,
            values,
          };
        }),
      );
      if (width <= 430)
        expect(new Set(geometry.map((g) => Math.round(g.left))).size).toBe(1);
      for (let i = 0; i < geometry.length; i++) {
        const g = geometry[i];
        expect(
          g.scrollHeight,
          `${theme}/${width}/card ${i}: vertical overflow`,
        ).toBeLessThanOrEqual(g.height + 2);
        expect(
          g.scrollWidth,
          `${theme}/${width}/card ${i}: horizontal overflow`,
        ).toBeLessThanOrEqual(g.width + 2);
        for (const value of g.values) {
          expect(value.unitLines).toBe(1);
          expect(value.left).toBeGreaterThanOrEqual(g.left);
          expect(
            value.right,
            `${theme}/${width}/card ${i}: value clipped`,
          ).toBeLessThanOrEqual(g.right - 8);
          expect(value.bottom).toBeLessThanOrEqual(g.bottom - 8);
        }
        for (let j = i + 1; j < geometry.length; j++) {
          const next = geometry[j];
          const overlaps =
            g.left < next.right - 1 &&
            g.right > next.left + 1 &&
            g.top < next.bottom - 1 &&
            g.bottom > next.top + 1;
          expect(overlaps, `${theme}/${width}: cards ${i}/${j} overlap`).toBe(
            false,
          );
        }
      }
      expect(
        await page
          .locator("body")
          .evaluate((e) => e.scrollWidth <= e.clientWidth),
      ).toBe(true);
      if (width === 390)
        await page.locator(".room-section-power").screenshot({
          path: `/private/tmp/smarti-room-readings-${theme}-${info.project.name}.png`,
        });
    }
  }
});

test("room cards preserve real power, small energy, zero and unavailable values with the correct linked device", async ({
  page,
}) => {
  const { commands } = await setup(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    card(page, "LED lys Soverom Jakob power").locator(".equipment-measurement"),
  ).toHaveText("14,9 W");
  await expect(
    card(page, "LED lys Soverom Jakob energy").locator(
      ".equipment-measurement",
    ),
  ).toHaveText("0,0246 kWh");
  await expect(
    card(page, "Lyspære Soverom Jakob 2 Forbruk").locator(
      ".equipment-measurement",
    ),
  ).toHaveText("0 kWh");
  await expect(
    card(page, "Nattlampe Soverom Jakob energy").locator(
      ".equipment-measurement",
    ),
  ).toHaveText("0,000248 kWh");
  const socket = card(page, "LED lys Soverom Jakob");
  await expect(socket.locator(".harmony-device-reading")).toHaveText("14,9 W");
  await expect(socket.locator(".equipment-extra-reading")).toContainText(
    "0,0246 kWh",
  );
  await expect(socket).not.toContainText("81,2");
  const missing = card(page, "Utilgjengelig måler");
  await expect(missing).toContainText("Utilgjengelig");
  await expect(missing.locator(".equipment-measurement")).toHaveCount(0);
  await socket.getByRole("switch").click();
  await expect.poll(() => commands.length).toBe(1);
  expect(commands[0]).toMatchObject({ action: "turn_off" });
  await expect(socket.getByRole("switch")).toHaveAttribute(
    "aria-checked",
    "false",
  );
  await socket
    .getByRole("button", { name: "Åpne LED lys Soverom Jakob", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "LED lys Soverom Jakob",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    socket.getByRole("button", {
      name: "Åpne LED lys Soverom Jakob",
      exact: true,
    }),
  ).toBeFocused();
});

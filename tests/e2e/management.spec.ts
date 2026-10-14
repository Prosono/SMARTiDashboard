import { test, expect } from "../../frontend/node_modules/@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await expect(page.locator(".home-welcome h1")).toBeVisible();
});
test("rooms create, rename, assign and remove without deleting devices", async ({
  page,
}) => {
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Rom", exact: true })
    .click();
  await page.getByRole("button", { name: "Administrer rom" }).click();
  await page.getByLabel("Romnavn", { exact: true }).fill("Testkontor");
  await page.getByRole("button", { name: "Opprett rom", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Lagre navn", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Romnavn", { exact: true }).fill("Arbeidsrom");
  await page.getByRole("button", { name: "Lagre navn", exact: true }).click();
  await expect(
    page
      .getByRole("navigation", { name: "Velg rom" })
      .getByRole("button", { name: /Arbeidsrom/ }),
  ).toBeVisible();
  const select = page.getByRole("combobox", {
    name: "Rom for Pendellampe",
    exact: true,
  });
  const placed = page.waitForResponse(
    (r) =>
      r.url().includes("/api/manage/placements/device/d1") &&
      r.request().method() === "PUT",
  );
  await select.selectOption({ label: "Arbeidsrom" });
  await placed;
  const rooms = await (await page.request.get("/api/manage/rooms")).json();
  expect(rooms.devices.find((d: any) => d.id === "d1").area_id).toBe(
    rooms.areas.find((a: any) => a.name === "Arbeidsrom").area_id,
  );
  await page.getByRole("button", { name: "Slett rom", exact: true }).click();
  await page
    .getByRole("button", { name: "Ja, slett rom", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Opprett rom", exact: true }),
  ).toBeVisible();
  const after = await (await page.request.get("/api/manage/rooms")).json();
  expect(after.devices.find((d: any) => d.id === "d1")).toBeTruthy();
  expect(after.areas.some((a: any) => a.name === "Arbeidsrom")).toBe(false);
});
test("automations create visually and preserve advanced configuration on edit", async ({
  page,
}) => {
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Innstillinger", exact: true })
    .click();
  await page.getByRole("button", { name: "Automasjoner", exact: true }).click();
  await page
    .getByRole("button", { name: "Ny automasjon", exact: true })
    .click();
  const name = "Testrutine " + test.info().project.name;
  await expect(
    page.getByRole("button", { name: "Velg handling", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: /På et tidspunkt/ }).click();
  await page.getByLabel("Klokkeslett", { exact: true }).fill("19:30");
  await page
    .getByRole("button", { name: "Velg handling", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Se over rutinen", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Velg lys eller stikkontakt", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Pendellampe/ })
    .click();
  await page
    .getByRole("button", { name: "Se over rutinen", exact: true })
    .click();
  await expect(page.locator(".routine-review")).toContainText("19:30");
  await page.getByRole("button", { name: "Tilbake", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Velg lys eller stikkontakt",
      exact: true,
    }),
  ).toContainText("Pendellampe");
  await page
    .getByRole("button", { name: "Se over rutinen", exact: true })
    .click();
  await page.getByLabel("Navn", { exact: true }).fill(name);
  await page.screenshot({
    path: `../artifacts/${test.info().project.name}-automation-editor.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Lagre automasjon", exact: true })
    .click();
  const row = page
    .locator(".system-row")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
  await page
    .getByRole("button", { name: "Strukturliste", exact: true })
    .click();
  await expect(
    page.getByLabel("Automasjonsflyt", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Rediger Når 1/ }).click();
  await page.getByLabel("Klokkeslett", { exact: true }).fill("21:00:00");
  await page
    .getByRole("button", { name: "Ferdig med kortet", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Vanlig editor", exact: true })
    .click();
  await expect(page.getByLabel("Klokkeslett", { exact: true })).toHaveValue(
    "21:00:00",
  );
  await page.getByRole("button", { name: "Flytvisning", exact: true }).click();
  await page
    .getByRole("button", { name: "Strukturliste", exact: true })
    .click();
  await page.screenshot({
    path: `../artifacts/${test.info().project.name}-automation-flow.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Avansert redigering (JSON)", exact: true })
    .click();
  const field = page.getByRole("textbox", {
    name: "Konfigurasjon (JSON)",
    exact: true,
  });
  const config = JSON.parse(await field.inputValue());
  config.variables = { preserved: "{{ 1 + 1 }}" };
  config.actions.push({ choose: [{ conditions: "{{ true }}", sequence: [] }] });
  await field.fill(JSON.stringify(config, null, 2));
  await page
    .getByRole("button", { name: "Lagre automasjon", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Alle automasjoner", exact: true })
    .click();
  await row.getByRole("button", { name: "Rediger", exact: true }).click();
  await page
    .getByRole("button", { name: "Avansert redigering (JSON)", exact: true })
    .click();
  expect(JSON.parse(await field.inputValue()).variables).toEqual(
    config.variables,
  );
  await page.getByRole("button", { name: "Slett", exact: true }).click();
  await page.getByRole("button", { name: "Bekreft", exact: true }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toHaveCount(0);
});
test("integrations and branded updates use explicit confirmation", async ({
  page,
}) => {
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Innstillinger", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Integrasjoner", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Deaktiver", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Utvid", exact: true }).click();
  await expect(page.locator(".integration-devices")).toContainText(
    "Pendellampe",
  );
  await page.getByRole("button", { name: "Deaktiver", exact: true }).click();
  await page.getByRole("button", { name: "Bekreft", exact: true }).click();
  await expect(
    page.locator(".integration-entry").getByText("Deaktivert", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Aktiver", exact: true }).click();
  await page.getByRole("button", { name: "Bekreft", exact: true }).click();
  await page
    .getByRole("button", { name: "Oppdateringer", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "SMARTi Core", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Home Assistant/ }),
  ).toHaveCount(0);
  const row = page.locator(".system-row").filter({
    has: page.getByRole("heading", { name: "SMARTi Core", exact: true }),
  });
  await expect(row.getByRole("img", { name: "SMARTi" })).toBeVisible();
  await row.getByRole("button", { name: "Installer", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Ta sikkerhetskopi før installasjon" }),
  ).toBeChecked();
  await page
    .getByRole("button", { name: "Bekreft installasjon", exact: true })
    .click();
  await expect(
    page.getByText(
      "Simulert i demohjemmet. Ingen programvare ble installert.",
      { exact: true },
    ),
  ).toBeVisible();
});
test("guided sensor transitions and sunset survive review without running devices", async ({
  page,
}) => {
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Innstillinger", exact: true })
    .click();
  await page.getByRole("button", { name: "Automasjoner", exact: true }).click();
  await page
    .getByRole("button", { name: "Ny automasjon", exact: true })
    .click();
  await page.getByRole("button", { name: /Når noe skjer hjemme/ }).click();
  await page.getByRole("button", { name: "Velg sensor", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Ytterdør/ })
    .click();
  await page
    .getByRole("button", { name: "Velg handling", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Velg lys eller stikkontakt", exact: true })
    .click();
  const picker = page.getByRole("dialog");
  await picker
    .getByRole("textbox", { name: "Søk etter navn eller rom", exact: true })
    .fill("ingen-slik-enhet");
  await expect(
    picker.getByText("Ingen treff her", { exact: true }),
  ).toBeVisible();
  await picker
    .getByRole("button", { name: "Vis alle enheter", exact: true })
    .click();
  await picker.getByRole("button", { name: "Stue", exact: true }).click();
  await picker
    .getByRole("textbox", { name: "Søk etter navn eller rom", exact: true })
    .fill("Pendellampe");
  await page.screenshot({
    path: `../artifacts/${test.info().project.name}-entity-picker.png`,
    fullPage: true,
  });
  await picker.getByRole("button", { name: /Pendellampe/ }).click();
  await expect(picker).not.toBeVisible();
  await page.getByRole("button", { name: "Slå av", exact: true }).click();
  await page
    .getByRole("button", { name: "Se over rutinen", exact: true })
    .click();
  await expect(page.locator(".routine-review")).toContainText("Ytterdør åpnes");
  await expect(page.locator(".routine-review")).toContainText(
    "slå av Pendellampe",
  );
  await page.getByRole("button", { name: "Tilbake", exact: true }).click();
  await page.getByRole("button", { name: "Tilbake", exact: true }).click();
  await page
    .getByRole("button", { name: /Når solen går ned eller opp/ })
    .click();
  await page.screenshot({
    path: `../artifacts/${test.info().project.name}-automation-start.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Velg handling", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Se over rutinen", exact: true })
    .click();
  await expect(page.locator(".routine-review")).toContainText("solen går ned");
  await page
    .getByRole("button", { name: "Flere muligheter", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Strukturliste", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Avansert redigering (JSON)", exact: true })
    .click();
  const config = JSON.parse(
    await page
      .getByRole("textbox", { name: "Konfigurasjon (JSON)", exact: true })
      .inputValue(),
  );
  expect(config.triggers).toEqual([{ trigger: "sun", event: "sunset" }]);
  expect(config.actions).toEqual([
    { action: "light.turn_off", target: { entity_id: "light.living_pendant" } },
  ]);
});

test("flow cards add conditions and actions, reorder and preserve drafts across editors", async ({
  page,
}) => {
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Innstillinger", exact: true })
    .click();
  await page.getByRole("button", { name: "Automasjoner", exact: true }).click();
  await page
    .getByRole("button", { name: "Ny automasjon", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Flere muligheter", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Strukturliste", exact: true })
    .click();
  await page.getByRole("button", { name: "Legg til når", exact: true }).click();
  await page.getByRole("button", { name: "Klokkeslett", exact: true }).click();
  await page
    .getByRole("button", { name: "Ferdig med kortet", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Legg til og hvis", exact: true })
    .click();
  await page.getByRole("button", { name: "En tilstand", exact: true }).click();
  await page
    .getByRole("button", { name: "Enhet eller sensor", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("textbox", { name: "Søk etter navn eller rom", exact: true })
    .fill("Ytterdør");
  await dialog.getByRole("button", { name: /Ytterdør/ }).click();
  await page
    .getByRole("combobox", { name: "Er", exact: true })
    .selectOption("off");
  await page
    .getByRole("button", { name: "Ferdig med kortet", exact: true })
    .click();
  await expect(page.locator(".flow-conditions")).toContainText("Er lukket");
  for (const action of ["Slå på lys", "Slå av lys"]) {
    await page
      .getByRole("button", { name: "Legg til så gjør", exact: true })
      .click();
    await page.getByRole("button", { name: action, exact: true }).click();
    await page.getByRole("button", { name: "Mål", exact: true }).click();
    await dialog.getByRole("button", { name: /Pendellampe/ }).click();
    await page
      .getByRole("button", { name: "Ferdig med kortet", exact: true })
      .click();
  }
  await page.getByRole("button", { name: /Rediger Så gjør 2/ }).click();
  await page.getByRole("button", { name: "Flytt opp", exact: true }).click();
  await page
    .getByRole("button", { name: "Ferdig med kortet", exact: true })
    .click();
  await expect(page.locator(".flow-actions .flow-card").first()).toContainText(
    "Slå av",
  );
  await page
    .getByRole("button", { name: "Vanlig editor", exact: true })
    .click();
  await page.getByRole("button", { name: "Flytvisning", exact: true }).click();
  await page
    .getByRole("button", { name: "Strukturliste", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Avansert redigering (JSON)", exact: true })
    .click();
  const json = JSON.parse(
    await page
      .getByRole("textbox", { name: "Konfigurasjon (JSON)", exact: true })
      .inputValue(),
  );
  expect(json.conditions).toEqual([
    { condition: "state", entity_id: "binary_sensor.front_door", state: "off" },
  ]);
  expect(json.actions.map((r: any) => r.action)).toEqual([
    "light.turn_off",
    "light.turn_on",
  ]);
  await page.getByRole("button", { name: "Flytvisning", exact: true }).click();
  await page
    .getByRole("button", { name: "Strukturliste", exact: true })
    .click();
  await page.getByRole("button", { name: /Rediger Så gjør 2/ }).click();
  await page.getByRole("button", { name: "Fjern blokk", exact: true }).click();
  await expect(page.locator(".flow-actions .flow-card")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Alle automasjoner", exact: true })
    .click();
  await expect(
    page.getByText("Forkaste ulagrede endringer?", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Avbryt", exact: true }).click();
  await expect(page.locator(".flow-actions .flow-card")).toHaveCount(1);
});

test("advanced branches render recursively and deep edits round trip unchanged siblings", async ({
  page,
}) => {
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Innstillinger", exact: true })
    .click();
  await page.getByRole("button", { name: "Automasjoner", exact: true }).click();
  await page
    .getByRole("button", { name: "Ny automasjon", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Flere muligheter", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Strukturliste", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Avansert redigering (JSON)", exact: true })
    .click();
  const config = {
    alias: "Forgrenet kveld " + test.info().project.name,
    mode: "restart",
    variables: { keep: "{{ 1 + 1 }}" },
    triggers: [{ trigger: "sun", event: "sunset" }],
    conditions: [
      {
        condition: "or",
        conditions: [
          {
            condition: "state",
            entity_id: "binary_sensor.front_door",
            state: "off",
          },
          { condition: "template", value_template: "{{ true }}" },
        ],
      },
    ],
    actions: [
      {
        alias: "Kveldsvalg",
        choose: [
          {
            alias: "Når døren er lukket",
            conditions: [
              {
                condition: "state",
                entity_id: "binary_sensor.front_door",
                state: "off",
              },
            ],
            sequence: [
              {
                if: [{ condition: "template", value_template: "{{ true }}" }],
                then: [
                  { alias: "Liten pause", delay: 10 },
                  {
                    parallel: [
                      {
                        sequence: [
                          {
                            action: "light.turn_on",
                            target: { entity_id: "light.living_pendant" },
                            data: { brightness_pct: 40 },
                          },
                        ],
                      },
                      { repeat: { count: 2, sequence: [{ delay: 1 }] } },
                    ],
                  },
                ],
                else: [{ stop: "Avslutt" }],
              },
            ],
          },
        ],
        default: [{ event: "smarti_no_match" }],
      },
    ],
  };
  const field = page.getByRole("textbox", {
    name: "Konfigurasjon (JSON)",
    exact: true,
  });
  await field.fill(JSON.stringify(config));
  await page.getByRole("button", { name: "Flytvisning", exact: true }).click();
  await page
    .getByRole("button", { name: "Strukturliste", exact: true })
    .click();
  await expect(
    page.getByText(
      "Første valg som passer kjøres. Ellers brukes reserveveien.",
      { exact: false },
    ),
  ).toBeVisible();
  await expect(
    page.getByText("Minst én må stemme", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Rediger steg: Liten pause", exact: true })
    .click();
  await page
    .getByLabel("Ventetid (sekunder eller tt:mm:ss)", { exact: true })
    .fill("25");
  await page
    .getByRole("button", { name: "Ferdig med steget", exact: true })
    .click();
  await page
    .getByRole("heading", {
      name: "Ellers · når ingen valg passer",
      exact: true,
    })
    .locator("..")
    .getByRole("button", { name: "+ Legg til steg", exact: true })
    .click();
  await page.getByRole("button", { name: "Vent litt", exact: true }).click();
  await expect(
    page.getByLabel("Ventetid (sekunder eller tt:mm:ss)", { exact: true }),
  ).toHaveValue("60");
  await page.getByRole("button", { name: "Fjern steget", exact: true }).click();
  await page.screenshot({
    path: `../artifacts/${test.info().project.name}-advanced-flow.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Vanlig editor", exact: true })
    .click();
  await page.getByRole("button", { name: "Flytvisning", exact: true }).click();
  await page
    .getByRole("button", { name: "Strukturliste", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Avansert redigering (JSON)", exact: true })
    .click();
  const expected = structuredClone(config);
  expected.actions[0].choose[0].sequence[0].then[0].delay = 25;
  expect(JSON.parse(await field.inputValue())).toEqual(expected);
  await page.getByRole("button", { name: "Flytvisning", exact: true }).click();
  await page
    .getByRole("button", { name: "Strukturliste", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Lagre automasjon", exact: true })
    .click();
  await expect(
    page.getByText("Automasjonen er lagret.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Alle automasjoner", exact: true })
    .click();
  await page
    .locator(".system-row")
    .filter({
      has: page.getByRole("heading", { name: config.alias, exact: true }),
    })
    .getByRole("button", { name: "Rediger", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Avansert redigering (JSON)", exact: true })
    .click();
  const saved = JSON.parse(await field.inputValue());
  delete saved.id;
  expect(saved).toEqual(expected);
  await page.getByRole("button", { name: "Slett", exact: true }).click();
  await page.getByRole("button", { name: "Bekreft", exact: true }).click();
});

test("integrations group connections and expand devices with logo fallback", async ({
  page,
}) => {
  await page.route("**/api/manage/integrations", (r) =>
    r.fulfill({
      json: [
        {
          entry_id: "one",
          domain: "hue",
          title: "Bro i stua",
          state: "loaded",
          disabled_by: null,
          devices: 1,
          device_items: [
            { id: "lamp", name: "Leselampe", area: "Stue", model: "Hue White" },
          ],
        },
        {
          entry_id: "two",
          domain: "hue",
          title: "Bro i garasjen",
          state: "setup_retry",
          disabled_by: null,
          devices: 1,
          device_items: [
            { id: "garage", name: "Garasjelys", area: "Garasje", model: null },
          ],
        },
        {
          entry_id: "weather",
          domain: "met",
          title: "Værmelding",
          state: "loaded",
          disabled_by: null,
          devices: 0,
          device_items: [],
        },
      ],
    }),
  );
  await page.route("**/api/manage/integration-brands/*", (r) =>
    r.fulfill({ status: 404 }),
  );
  await page.route("https://brands.home-assistant.io/**", (r) =>
    r.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1XkAAAAASUVORK5CYII=",
        "base64",
      ),
    }),
  );
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Innstillinger", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Integrasjoner", exact: true })
    .click();
  await expect(page.locator(".integration-card")).toHaveCount(2);
  const hue = page.locator(".integration-card").filter({
    has: page.getByRole("heading", { name: "Philips Hue", exact: true }),
  });
  await expect(hue).toContainText("2 oppsett · 2 enheter");
  await expect(hue).toContainText("1 trenger oppmerksomhet");
  await expect(
    hue.getByRole("img", { name: "hue", exact: true }),
  ).toHaveAttribute("src", "https://brands.home-assistant.io/hue/icon.png");
  await hue.getByRole("button", { name: "Utvid", exact: true }).click();
  await expect(hue.getByText("Leselampe", { exact: true })).toBeVisible();
  await expect(hue.getByText("Garasjelys", { exact: true })).toBeVisible();
  await page.screenshot({
    path: `../artifacts/${test.info().project.name}-integrations.png`,
    fullPage: true,
  });
  await hue.getByRole("button", { name: "Skjul", exact: true }).click();
  await expect(page.getByText("Leselampe", { exact: true })).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Søk i integrasjoner", exact: true })
    .fill("Garasjelys");
  await expect(page.locator(".integration-card")).toHaveCount(1);
});

test("canvas moves cards with keyboard and pointer without changing automation logic", async ({
  page,
}) => {
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Innstillinger", exact: true })
    .click();
  await page.getByRole("button", { name: "Automasjoner", exact: true }).click();
  await page
    .getByRole("button", { name: "Ny automasjon", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Flere muligheter", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Arbeidsflate for automasjon" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Legg til hendelse", exact: true })
    .click();
  await page.getByRole("button", { name: "Klokkeslett", exact: true }).click();
  await page
    .getByRole("button", { name: "Ferdig med kortet", exact: true })
    .click();
  const handle = page.getByRole("button", { name: /Flytt kort: Klokken/ });
  await handle.focus();
  await page.keyboard.press("ArrowDown");
  const node = page.locator(".canvas-triggers");
  await expect(node).toHaveCSS("top", "80px");
  const box = await handle.boundingBox();
  await page.mouse.move(box!.x + 10, box!.y + 10);
  await page.mouse.down();
  await page.mouse.move(box!.x + 50, box!.y + 50);
  await page.mouse.up();
  await expect(node).toHaveCSS("top", "130px");
  const content = await node.locator(".canvas-node-content").boundingBox();
  await page.mouse.move(content!.x + 30, content!.y + 20);
  await page.mouse.down();
  await page.mouse.move(content!.x + 30, content!.y + 60);
  await page.mouse.up();
  await expect(node).toHaveCSS("top", "180px");
  await page.getByRole("button", { name: "Rutenett", exact: true }).click();
  await expect(page.locator(".canvas-viewport")).toHaveCSS(
    "background-image",
    "none",
  );
  await page.getByRole("button", { name: "Linjer", exact: true }).click();
  await expect(page.locator(".canvas-wires")).toHaveCount(0);
  await page.getByRole("button", { name: "Linjer", exact: true }).click();
  await expect(page.locator(".canvas-wires")).toHaveCount(1);
  const viewport = page.locator(".canvas-viewport");
  await viewport.scrollIntoViewIfNeeded();
  const surface = await viewport.boundingBox();
  await page.mouse.move(surface!.x + 180, surface!.y + 330);
  await page.mouse.down();
  await page.mouse.move(surface!.x + 60, surface!.y + 330);
  await page.mouse.up();
  expect(await viewport.evaluate((el) => el.scrollLeft)).toBeGreaterThan(50);
  await viewport.evaluate((el) => {
    el.scrollLeft = 0;
  });

  await page.getByRole("button", { name: "Zoom ut", exact: true }).click();
  await expect(page.locator(".canvas-toolbar output")).toHaveText("70%");
  await page
    .getByRole("button", { name: "Legg til handling", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Søk etter kort", exact: true })
    .fill("vent");
  await page.getByRole("button", { name: "Vent litt", exact: true }).click();
  await page
    .getByRole("button", { name: "Ferdig med steget", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Legg til hendelse", exact: true })
    .click();
  await page.getByRole("button", { name: "Klokkeslett", exact: true }).click();
  await page
    .getByRole("button", { name: "Ferdig med kortet", exact: true })
    .click();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: /Fjern kort: Klokken/ })
    .last()
    .click();
  await expect(page.locator(".canvas-triggers")).toHaveCount(1);
  await page.screenshot({
    path: `../artifacts/${test.info().project.name}-flow-canvas.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Avansert redigering (JSON)", exact: true })
    .click();
  const config = JSON.parse(
    await page
      .getByRole("textbox", { name: "Konfigurasjon (JSON)", exact: true })
      .inputValue(),
  );
  expect(config.triggers).toEqual([{ trigger: "time", at: "20:00:00" }]);
  expect(config.actions).toEqual([{ delay: 60 }]);
});

test("canvas connects by dragging or keyboard and saves native sequence and parallel actions", async ({
  page,
}) => {
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Innstillinger", exact: true })
    .click();
  await page.getByRole("button", { name: "Automasjoner", exact: true }).click();
  await page
    .getByRole("button", { name: "Ny automasjon", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Flere muligheter", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Avansert redigering (JSON)", exact: true })
    .click();
  const config = {
    alias: "Koblingstest " + test.info().project.name,
    triggers: [{ trigger: "time", at: "20:00:00" }],
    conditions: [],
    actions: [
      { alias: "A", delay: 10 },
      { alias: "B", delay: 20 },
      { alias: "C", delay: 30 },
    ],
    mode: "single",
  };
  await page
    .getByRole("textbox", { name: "Konfigurasjon (JSON)", exact: true })
    .fill(JSON.stringify(config));
  await page.getByRole("button", { name: "Flytvisning", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Farger", exact: true })
    .selectOption("calm");
  await expect(page.locator(".flow-workspace")).toHaveClass(/palette-calm/);
  await page
    .getByRole("combobox", { name: "Farger", exact: true })
    .selectOption("vivid");
  for (let i = 0; i < 4; i++)
    await page.getByRole("button", { name: "Zoom ut", exact: true }).click();
  // Bring the target within the mobile viewport, without changing execution.
  await page
    .getByRole("button", { name: "Flytt kort: C", exact: true })
    .focus();
  for (let i = 0; i < 34; i++) await page.keyboard.press("ArrowLeft");
  for (let i = 0; i < 8; i++) await page.keyboard.press("ArrowDown");
  const viewport = page.locator(".canvas-viewport");
  await viewport.evaluate((el) => {
    el.scrollLeft = 0;
  });
  await viewport.scrollIntoViewIfNeeded();
  const output = page.getByRole("button", {
    name: "Koble fra: Når én hendelse skjer",
    exact: true,
  });
  const input = page.getByRole("button", { name: "Koble til: C", exact: true });
  const from = await output.boundingBox(),
    to = await input.boundingBox();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, {
    steps: 8,
  });
  await expect(page.locator(".canvas-wire-preview")).toBeVisible();
  await page.mouse.up();
  await expect(
    page.getByRole("button", { name: "Bekreft kobling", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Bekreft kobling", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Avansert redigering (JSON)", exact: true })
    .click();
  let actual = JSON.parse(
    await page
      .getByRole("textbox", { name: "Konfigurasjon (JSON)", exact: true })
      .inputValue(),
  );
  expect(actual.actions.map((r: any) => r.alias)).toEqual(["C", "A", "B"]);
  await page.getByRole("button", { name: "Flytvisning", exact: true }).click();
  await page.getByRole("button", { name: "Koble fra: C", exact: true }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Koble til: C", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".canvas-connection-status")).toContainText(
    "Et kort kan ikke kobles til seg selv",
  );
  await expect(
    page.getByRole("button", { name: "Bekreft kobling", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Samtidig", exact: true }).click();
  const sourcePort = page.getByRole("button", {
    name: "Koble fra: C",
    exact: true,
  });
  const targetPort = page.getByRole("button", {
    name: "Koble til: B",
    exact: true,
  });
  if (test.info().project.name === "mobile") {
    await sourcePort.tap();
    await targetPort.tap();
  } else {
    await sourcePort.click();
    await targetPort.click();
  }
  await page
    .getByRole("button", { name: "Bekreft kobling", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Avansert redigering (JSON)", exact: true })
    .click();
  actual = JSON.parse(
    await page
      .getByRole("textbox", { name: "Konfigurasjon (JSON)", exact: true })
      .inputValue(),
  );
  expect(actual.actions).toEqual([
    {
      parallel: [
        { sequence: [config.actions[2]] },
        { sequence: [config.actions[1]] },
      ],
    },
    config.actions[0],
  ]);
  await page.getByRole("button", { name: "Flytvisning", exact: true }).click();
  await page.getByRole("button", { name: "Mørkt", exact: true }).click();
  await page.locator(".flow-workspace").screenshot({
    path: `../artifacts/${test.info().project.name}-flow-connections-dark.png`,
    animations: "disabled",
  });
  const savedResponse = page.waitForResponse(
    (r) =>
      r.url().includes("/api/manage/automations") &&
      r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Lagre automasjon", exact: true })
    .click();
  const saved = await (await savedResponse).json();
  const persisted = await (
    await page.request.get(`/api/manage/automations/${saved.id}`)
  ).json();
  expect(persisted.config.actions).toEqual(actual.actions);
});

test('platform integrations use SMARTi names and local logos without rewriting IDs',async ({page})=>{
  await page.route('**/api/manage/integrations',r=>r.fulfill({json:[{
    entry_id:'ha-entry',domain:'hassio',title:'Home Assistant Supervisor',state:'loaded',disabled_by:null,devices:1,
    device_items:[{id:'ha-device',name:'HA Green',area:null,model:'Home Assistant Green'}]
  }]}));
  let brandRequests=0;
  page.on('request',r=>{if(r.url().includes('integration-brands/hassio') || r.url().includes('brands.home-assistant.io/hassio')) brandRequests++;});
  await page.getByRole('navigation').getByRole('button',{name:'Innstillinger',exact:true}).click();
  await page.getByRole('button',{name:'Integrasjoner',exact:true}).click();
  await page.getByLabel('Søk i integrasjoner').fill('SMARTi');
  const card=page.locator('.integration-card');
  await expect(card.getByRole('heading',{name:'SMARTi Supervisor'})).toBeVisible();
  await expect(card.getByRole('img',{name:'SMARTi',exact:true})).toHaveAttribute('src','./brand/smarti-logo.png');
  expect(brandRequests).toBe(0);
  await card.getByRole('button',{name:'Utvid',exact:true}).click();
  await expect(card).not.toContainText('Home Assistant');
  await expect(card).toContainText('SMARTi Green');
  await card.getByRole('button',{name:'Endre navn',exact:true}).click();
  await expect(card.getByLabel('Navn',{exact:true})).toHaveValue('SMARTi Supervisor');
  let body:any;
  await page.route('**/api/manage/integrations/ha-entry',r=>{body=r.request().postDataJSON();return r.fulfill({json:{status:'simulated',require_restart:false}});});
  await card.getByRole('button',{name:'Lagre',exact:true}).click();
  await expect.poll(()=>body?.name).toBe('Home Assistant Supervisor');
});

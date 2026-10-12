import { test, expect } from "../../frontend/node_modules/@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Velkommen hjem." }),
  ).toBeVisible();
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
    .getByRole("button", { name: "Mer", exact: true })
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
    .getByRole("button", { name: "Mer", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Integrasjoner", exact: true })
    .click();
  await page.getByRole("button", { name: "Deaktiver", exact: true }).click();
  await page.getByRole("button", { name: "Bekreft", exact: true }).click();
  await expect(page.getByText("Deaktivert", { exact: true })).toBeVisible();
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
test("dashboard touch handles, keyboard moves, responsive layouts and persistence", async ({
  page,
}) => {
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Mer", exact: true })
    .click();
  await page.getByRole("button", { name: "Dashbord", exact: true }).click();
  await page
    .getByRole("button", { name: "Nytt dashbord", exact: true })
    .click();
  const name = "Min oversikt " + test.info().project.name;
  await page.getByLabel("Dashbordnavn", { exact: true }).fill(name);
  await page
    .getByRole("combobox", { name: "Synlighet", exact: true })
    .selectOption("shared");
  await page
    .getByRole("combobox", { name: "Velg kontroll", exact: true })
    .selectOption("demo-light.living_pendant");
  await page
    .getByRole("button", { name: "Legg til rute", exact: true })
    .click();
  await page.getByRole("button", { name: "Telefon", exact: true }).click();
  const handle = page.getByRole("button", { name: "Dra rute", exact: true });
  await handle.focus();
  await page.keyboard.press("ArrowDown");
  const tile = page.locator(".dashboard-tile");
  await expect(tile).toHaveCSS("grid-row-start", "2");
  await handle.scrollIntoViewIfNeeded();
  const box = (await handle.boundingBox())!;
  if (test.info().project.name === "mobile") {
    const cdp = await page.context().newCDPSession(page);
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [point],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: point.x, y: point.y + 112 }],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await cdp.detach();
  } else {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 112, {
      steps: 8,
    });
    await page.mouse.up();
  }
  await expect(tile).toHaveCSS("grid-row-start", "3");
  await page.getByRole("button", { name: "Stor skjerm", exact: true }).click();
  await expect(tile).toHaveCSS("grid-row-start", "1");
  await page
    .getByRole("combobox", { name: "Bredde", exact: true })
    .selectOption("6");
  await page
    .getByRole("button", { name: "Lagre dashbord", exact: true })
    .click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  const boards = await (await page.request.get("/api/dashboards")).json();
  const board = boards.find((b: any) => b.name === name);
  expect(board.scope).toBe("shared");
  expect(board.tiles[0].layouts.phone.y).toBe(2);
  expect(board.tiles[0].layouts.desktop.w).toBe(6);
  await page.reload();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Mer", exact: true })
    .click();
  await page.getByRole("button", { name: "Dashbord", exact: true }).click();
  await page.getByRole("button", { name, exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Pendellampe", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `../artifacts/${test.info().project.name}-custom-dashboard.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Rediger dashbord", exact: true })
    .click();
  await page.getByLabel("Dashbordnavn", { exact: true }).fill("Unsaved");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Hjem", exact: true })
    .click();
  await expect(page.getByLabel("Dashbordnavn", { exact: true })).toHaveValue(
    "Unsaved",
  );
  await page
    .getByRole("button", { name: "Slett dashbord", exact: true })
    .click();
  await page.getByRole("button", { name: "Bekreft", exact: true }).click();
});

test("guided sensor transitions and sunset survive review without running devices", async ({
  page,
}) => {
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Mer", exact: true })
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
    .getByRole("button", { name: "Mer", exact: true })
    .click();
  await page.getByRole("button", { name: "Automasjoner", exact: true }).click();
  await page
    .getByRole("button", { name: "Ny automasjon", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Flere muligheter", exact: true })
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
    .getByRole("button", { name: "Mer", exact: true })
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
    .getByRole("button", { name: "Avansert redigering (JSON)", exact: true })
    .click();
  const expected = structuredClone(config);
  expected.actions[0].choose[0].sequence[0].then[0].delay = 25;
  expect(JSON.parse(await field.inputValue())).toEqual(expected);
  await page.getByRole("button", { name: "Flytvisning", exact: true }).click();
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

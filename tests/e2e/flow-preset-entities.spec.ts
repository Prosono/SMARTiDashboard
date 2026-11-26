import { test, expect } from "../../frontend/node_modules/@playwright/test";

test("Flow presets suggest matching entities and save native triggers", async ({
  page,
}) => {
  const fixtures = [
    ["binary_sensor", "leak", "Lekkasjesensor Flowtest", "off", "moisture"],
    ["binary_sensor", "door", "Dørsensor Flowtest", "off", "door"],
    ["person", "resident", "Beboer Flowtest", "home", ""],
    ["device_tracker", "phone", "Telefonsporing Flowtest", "not_home", ""],
    ["sensor", "temperature", "Temperatur Flowtest", "21", "temperature"],
  ].map(([domain, id, name, state, deviceClass]) => ({
    id: `preset-${id}`,
    entity_id: `${domain}.preset_${id}`,
    device_id: null,
    name,
    state,
    domain,
    attributes: deviceClass ? { device_class: deviceClass } : {},
    area_id: null,
  }));
  await page.route("**/api/manage/entities?details=true", (route) =>
    route.fulfill({ json: fixtures }),
  );
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Hovedmeny" })
    .getByRole("button", { name: "Automasjoner", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Ny automasjon", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Ny automasjon", exact: true })
    .getByRole("button", { name: "Avansert", exact: true })
    .click();

  const canvas = page.getByRole("region", {
    name: "Arbeidsflate for automasjon",
  });
  await expect(canvas).toBeVisible();
  await canvas
    .getByRole("button", { name: "Legg til kort", exact: true })
    .click();
  const library = canvas.locator(".canvas-add");
  await library.getByRole("button", { name: "Når", exact: true }).click();
  const buildingBlockSearch = library.getByLabel("Søk i byggesteiner");
  const step = page.getByRole("dialog", {
    name: "Tilpass steget",
    exact: true,
  });
  const openPreset = async (preset: string, label: string) => {
    await buildingBlockSearch.fill(preset);
    await library.getByRole("button", { name: preset, exact: true }).click();
    await step.getByRole("button", { name: label, exact: true }).click();
    return page.getByRole("dialog", { name: label, exact: true });
  };
  const done = step.getByRole("button", {
    name: "Ferdig med steget",
    exact: true,
  });

  const leak = await openPreset("Vannlekkasje oppdages", "Velg lekkasjesensor");
  const leakSensor = leak.getByRole("button", {
    name: /^Lekkasjesensor Flowtest/,
  });
  await expect(leakSensor).toBeVisible();
  await expect(
    leak.getByRole("button", {
      name: /^(Dørsensor|Beboer|Telefonsporing|Temperatur) Flowtest/,
    }),
  ).toHaveCount(0);
  await leakSensor.click();
  await done.click();
  await canvas.locator(".canvas-triggers .canvas-node-content").first().click();
  await step
    .getByRole("button", { name: "Velg lekkasjesensor", exact: true })
    .click();
  await expect(leakSensor).toHaveAttribute("aria-pressed", "true");
  await expect(
    leak.getByRole("button", { name: /^Dørsensor Flowtest/ }),
  ).toHaveCount(0);
  await leak
    .getByRole("button", { name: "Lukk enhetsvalg", exact: true })
    .click();
  await done.click();

  const arrival = await openPreset(
    "Noen kommer hjem",
    "Velg person eller sporingsenhet",
  );
  await expect(
    arrival.getByRole("button", { name: /^Telefonsporing Flowtest/ }),
  ).toBeVisible();
  await expect(
    arrival.getByRole("button", {
      name: /^(Lekkasjesensor|Dørsensor|Temperatur) Flowtest/,
    }),
  ).toHaveCount(0);
  await arrival.getByRole("button", { name: /^Beboer Flowtest/ }).click();
  await done.click();

  const smoke = await openPreset("Røyk oppdages", "Velg røyksensor");
  await expect(
    smoke.getByRole("heading", { name: "Ingen enheter av denne typen" }),
  ).toBeVisible();
  await smoke
    .getByRole("button", { name: "Lukk enhetsvalg", exact: true })
    .click();
  await step
    .getByRole("button", { name: "Forkast endringer i steget", exact: true })
    .click();

  const generic = await openPreset("Noe endrer seg", "Enheter og sensorer");
  await expect(
    generic.getByRole("button", { name: /^Temperatur Flowtest/ }),
  ).toBeVisible();
  await generic.getByRole("button", { name: /^Dørsensor Flowtest/ }).click();
  await done.click();

  await page
    .getByRole("textbox", { name: "Navn på flyten", exact: true })
    .fill(`Valg av enheter ${test.info().project.name} ${Date.now()}`);
  const saving = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname.endsWith("/api/manage/automations"),
  );
  await page.getByRole("button", { name: "Lagre flyten", exact: true }).click();
  const saved = await saving;
  expect(saved.ok(), await saved.text()).toBeTruthy();
  expect(saved.request().postDataJSON().config.triggers).toEqual([
    { trigger: "state", entity_id: "binary_sensor.preset_leak", to: "on" },
    { trigger: "state", entity_id: "person.preset_resident", to: "home" },
    { trigger: "state", entity_id: "binary_sensor.preset_door", to: "on" },
  ]);
});

import { test, expect } from "../../frontend/node_modules/@playwright/test";
test("room lighting overview filters and controls lights", async ({ page }) => {
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
  await page.locator(".device-toolbar select").selectOption("light");
  const lights = page.locator(".light-overview");
  await expect(
    lights.getByRole("heading", { name: "Lys", exact: true }),
  ).toBeVisible();
  await expect(lights.locator(".lighting-room").first()).toBeVisible();
  await expect(
    lights.locator(".lighting-room > header img").first(),
  ).toHaveJSProperty("naturalWidth", 1600);
  const disclosure = lights.getByRole("button", {name: /Vis søk og filtre/});
  if (await disclosure.count()) await disclosure.click();
  await lights.getByLabel("Søk etter rom eller lys").fill("finnesikke");
  await expect(lights.locator(".lighting-room")).toHaveCount(0);
  await lights.getByLabel("Søk etter rom eller lys").fill("");
  await lights.getByLabel("Velg rom", {exact:true}).selectOption({label:"Stue (2)"});
  await expect(lights.locator(".lighting-room")).toHaveCount(1);
  await lights.getByLabel("Velg rom", {exact:true}).selectOption("all");
  await expect(lights.locator(".lighting-room")).toHaveCount(3);
  const toggle = lights.getByRole("switch", {
    name: "Pendellampe",
    exact: true,
  });
  await expect(toggle).toBeEnabled();
  const old = await toggle.getAttribute("aria-checked");
  await toggle.click();
  await expect(toggle).toHaveAttribute(
    "aria-checked",
    old === "true" ? "false" : "true",
  );
  const roomToggle = lights.getByRole("switch", {name: "Alle lys i Stue", exact: true});
  const roomWasOn = await roomToggle.getAttribute("aria-checked");
  await roomToggle.click();
  await expect(roomToggle).toHaveAttribute("aria-checked", roomWasOn === "true" ? "false" : "true");
  await lights
    .getByRole("button", { name: /Farge og hvitt lys/ })
    .first()
    .click();
  await expect(
    page.getByRole("dialog").locator("input[type=color]"),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Lukk innstillinger", exact: true })
    .click();
  expect(
    await lights.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBeTruthy();
  await lights.getByRole("button", {name:"Åpne Pendellampe",exact:true}).click();
  await page.getByRole("button", {name:"Tilpass lys",exact:true}).click();
  const appearance = page.getByRole("dialog", {name:"Tilpass lys",exact:true});
  await appearance.getByLabel("Navn",{exact:true}).fill("Spisebord test");
  await appearance.getByRole("button", {name:"Gulvlampe",exact:true}).click();
  await appearance.getByRole("button", {name:"Lagre",exact:true}).click();
  await expect(appearance).toHaveCount(0);
  await page.getByRole("button", {name:"Lukk innstillinger",exact:true}).click();
  await expect(lights.getByRole("button", {name:"Åpne Spisebord test",exact:true})).toBeVisible();
  await page.reload();
  await page.getByRole("navigation").getByRole("button", {name:"Enheter",exact:true}).click();
  await page.locator(".device-toolbar select").selectOption("light");
  await expect(lights.getByRole("button", {name:"Åpne Spisebord test",exact:true})).toBeVisible();
  await lights.getByRole("button", {name:"Åpne Spisebord test",exact:true}).click();
  await page.getByRole("button", {name:"Tilpass lys",exact:true}).click();
  await page.getByRole("dialog", {name:"Tilpass lys",exact:true}).getByRole("button", {name:"Bruk standard",exact:true}).click();
  await expect(page.getByRole("dialog", {name:"Tilpass lys",exact:true})).toHaveCount(0);
  await page.getByRole("button", {name:"Lukk innstillinger",exact:true}).click();
  await expect(lights.getByRole("button", {name:"Åpne Pendellampe",exact:true})).toBeVisible();
  await page.screenshot({
    path: `/tmp/lights-${test.info().project.name}.png`,
    fullPage: true,
  });
});

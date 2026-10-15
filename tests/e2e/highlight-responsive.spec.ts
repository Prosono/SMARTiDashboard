import { test, expect } from "../../frontend/node_modules/@playwright/test";

test("highlights mount only on tablets and recolor with the selected theme", async ({page}) => {
  let forecastRequests = 0;
  await page.setViewportSize({width: 390, height: 844});
  await page.route("**/api/home", async route => {
    const response = await route.fetch();
    const data = await response.json();
    await route.fulfill({json: {...data, controls: [...data.controls.filter((c: {domain: string}) => c.domain !== "weather"), {
      id: "weather.responsive", entity_id: "weather.responsive", name: "Hjemme", domain: "weather", state: "sunny",
      attributes: {temperature: 14, temperature_unit: "°C"}, capabilities: [], availability: "available", diagnostic: false,
    }]}});
  });
  await page.route("**/api/home/weather/*", route => {
    forecastRequests++;
    return route.fulfill({json: {days: {}, forecast: []}});
  });
  await page.goto("/");
  await page.getByLabel("Brukernavn", {exact:true}).fill("tester");
  await page.getByLabel("Passord", {exact:true}).fill("test-password-not-for-live");
  await page.getByRole("button",{name:"Logg inn",exact:true}).click();
  await expect(page.locator(".home-welcome")).toBeVisible();
  await expect(page.locator(".home-highlights")).toHaveCount(0);
  expect(forecastRequests).toBe(0);

  await page.setViewportSize({width:768,height:1024});
  const card = page.locator(".highlight-weather");
  await expect(card).toBeVisible();
  await expect.poll(()=>forecastRequests).toBe(1);
  const images: string[] = [];
  for (const palette of ["fjord","forest","sand","plum"]) {
    await page.evaluate(p => document.documentElement.dataset.palette = p, palette);
    images.push(await card.evaluate(e=>getComputedStyle(e).backgroundImage));
  }
  expect(new Set(images).size).toBe(4);
  const light = images.at(-1);
  await page.evaluate(()=>document.documentElement.dataset.theme = "dark");
  expect(await card.evaluate(e=>getComputedStyle(e).backgroundImage)).not.toBe(light);
  await page.locator(".home-highlights").screenshot({path:`../artifacts/${test.info().project.name}-widget-theme.png`,animations:"disabled"});
  expect(await page.locator("body").evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);

  await page.setViewportSize({width:767,height:1024});
  await expect(page.locator(".home-highlights")).toHaveCount(0);
  await page.setViewportSize({width:1280,height:900});
  await expect(card).toBeVisible();
});

import { test, expect } from "../../frontend/node_modules/@playwright/test";
test("whole-home reporting shares sidebar destination with house log", async ({page}, info) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/history/report?*", async r => { await gate; return r.fulfill({json: {
    events: 1200, analyzed_events: 1000, truncated: true, active_entities: 12, alarm_events: 2, unavailable_events: 3,
    categories: {Lys: 600, Klima: 300, Sikkerhet: 100}, daily: {"2026-10-22": 600, "2026-10-23": 400},
    top_entities: [{name:"Stuelampe",count:400}], temperatures:[{name:"Stue",minimum:20,maximum:24,unit:"°C",samples:40}], temperature_sensor_count:1, climate_unavailable:false
  }}); });
  await page.route("**/api/history/activity?*", r => r.fulfill({json: {entries:[],total:0,truncated:false}}));
  await page.route("**/api/home/energy/platform/dashboard?*", r => r.fulfill({json: {configured:false}}));
  await page.goto("/");
  await page.getByLabel("Brukernavn",{exact:true}).fill("tester");
  await page.getByLabel("Passord",{exact:true}).fill("test-password-not-for-live");
  await page.getByRole("button",{name:"Logg inn",exact:true}).click();
  await page.getByRole("button",{name:"Rapporter og innsikt",exact:true}).click();
  await expect(page.getByRole("tab",{name:"Hjemmerapport"})).toHaveAttribute("aria-selected","true");
  await page.getByRole("button",{name:"Generer hjemmerapport"}).click();
  const loading = page.getByRole("status").filter({hasText:"Lager rapporten din"});
  await expect(loading).toBeVisible();
  await expect(loading.locator("img")).toHaveCSS("animation-name", "report-logo-breathe");
  await loading.screenshot({path:`/tmp/smarti-report-loading-${info.project.name}.png`});
  await page.emulateMedia({reducedMotion:"reduce"});
  await expect(loading.locator("img")).toHaveCSS("animation-name", "none");
  release();
  await expect(loading).not.toBeVisible();
  const report = page.getByRole("article",{name:"Rapport for hele hjemmet"});
  await expect(report).toContainText("Fordeling og nøkkeltall nedenfor bygger på de siste");
  await expect(report).toContainText("Stuelampe");
  await expect(report).toContainText("20 – 24 °C");
  await expect(report).toContainText("Ingen energimåler konfigurert eller tilgjengelig");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({path:`/tmp/smarti-house-report-${info.project.name}.png`,fullPage:true});
  await page.getByRole("tab",{name:"Huslogg",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Huslogg",exact:true})).toBeVisible();
  await page.getByRole("tab",{name:"Energirapport",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Forstå energien i hjemmet."})).toBeVisible();
});

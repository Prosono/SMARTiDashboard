import { test, expect } from "../../frontend/node_modules/@playwright/test";
test("reauthentication badge and popup clear when request is completed", async ({ page }) => {
  let pending = true;
  await page.route("**/api/manage/integration-setup/discoveries", r => r.fulfill({json:[]}));
  await page.route("**/api/manage/integration-setup/attention", r => r.fulfill({json:pending ? [{id:"auth",domain:"reolink",name:"Kamera ved inngangen",source:"reauth"}] : []}));
  await page.route("**/api/manage/integration-setup/catalog*", r => r.fulfill({json:[]}));
  await page.route("**/api/manage/integration-setup/attention/auth/claim", r => r.fulfill({json:{type:"form",flow_id:"auth",domain:"reolink",step_id:"reauth_confirm",data_schema:[],translations:{}}}));
  await page.route("**/api/manage/integration-setup/flows/auth", r => {
    if(r.request().method()==="POST") {pending=false; return r.fulfill({json:{type:"abort",flow_id:"auth",domain:"reolink",reason:"reauth_successful",translations:{"component.reolink.config.abort.reauth_successful":"Tilkoblingen er gjenopprettet."}}});}
    return r.fulfill({json:{cancelled:true}});
  });
  await page.goto("/");
  await page.getByLabel("Brukernavn",{exact:true}).fill("tester");
  await page.getByLabel("Passord",{exact:true}).fill("test-password-not-for-live");
  await page.getByRole("button",{name:"Logg inn",exact:true}).click();
  const nav=page.getByRole("navigation",{name:"Hovedmeny"});
  const integrations=nav.getByRole("button",{name:"Integrasjoner",exact:true});
  await expect(integrations.locator(".nav-discovery-count")).toHaveText("1");
  if (test.info().project.name === "desktop") {
    for (const width of [800, 1100, 1440]) {
      await page.setViewportSize({width, height: 800});
      for (let i = 0; i < 2; i++) {
        await expect.poll(() => nav.evaluate(el => el.scrollWidth - el.clientWidth)).toBe(0);
        await expect(integrations.locator(".nav-discovery-count")).toBeVisible();
        await page.locator(".sidebar-toggle").click();
      }
    }
  }
  await integrations.click();
  const panel=page.getByRole("region",{name:"Trenger oppmerksomhet"});
  await expect(panel).toContainText("Kamera ved inngangen");
  await panel.getByRole("button",{name:"Koble til på nytt",exact:true}).click();
  await page.getByRole("dialog").getByRole("button",{name:"Fortsett",exact:true}).click();
  await expect(page.getByRole("dialog")).toContainText("Tilkoblingen er gjenopprettet.");
  await page.getByRole("dialog").getByRole("button",{name:"Ferdig",exact:true}).click();
  await expect(integrations.locator(".nav-discovery-count")).toHaveCount(0);
  await expect(panel).toContainText("Ingen integrasjoner ber om ny innlogging nå.");
});

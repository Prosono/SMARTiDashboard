import { test, expect } from "../../frontend/node_modules/@playwright/test";
test("integration wizard searches, validates credentials, completes and cancels", async ({ page }) => {
  let cancelled = 0, submits = 0;
  const form = { type: "form", flow_id: "owned", domain: "reolink", step_id: "user", translations: {
    "component.reolink.config.step.user.title": "Koble til kameraet",
    "component.reolink.config.step.user.data.host": "Adresse",
    "component.reolink.config.step.user.data.password": "Kamerapassord",
    "component.reolink.config.error.invalid_auth": "Kontroller passordet",
  }, data_schema: [{ name: "host", type: "string", required: true }, { name: "password", selector: { text: { type: "password" } }, required: true }] };
  await page.route("**/api/manage/integration-setup/**", async route => {
    const req = route.request();
    if (req.url().endsWith("/discoveries")) return route.fulfill({ json: [] });
    if (req.method() === "DELETE") { cancelled++; return route.fulfill({ json: { cancelled: true } }); }
    if (req.url().includes("catalog")) return route.fulfill({ json: [{ domain: "reolink", name: "Reolink" }, { domain: "hue", name: "Philips Hue" }] });
    if (req.url().endsWith("/flows")) return route.fulfill({ json: form });
    if (req.method() === "POST") {
      submits++; expect(req.postDataJSON().host).toBe("192.168.1.20");
      return route.fulfill({ json: submits === 1 ? { ...form, errors: { password: "invalid_auth" } } : { ...form, type: "create_entry", title: "Kamera", data_schema: [] } });
    }
    return route.fulfill({ json: form });
  });
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page.getByLabel("Passord", { exact: true }).fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await page.getByRole("navigation").getByRole("button", { name: "Innstillinger", exact: true }).click();
  await page.getByRole("button", { name: "Integrasjoner", exact: true }).click();
  const open = page.getByRole("button", { name: "Legg til integrasjon", exact: true });
  await open.click();
  const dialog = page.getByRole("dialog", { name: "Legg til integrasjon" });
  await dialog.getByLabel("Finn integrasjon").fill("reolink");
  await expect(dialog.getByRole("button", { name: /Philips Hue/ })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Reolink", exact: true }).click();
  await dialog.getByLabel("Adresse").fill("192.168.1.20");
  await dialog.getByLabel("Kamerapassord").fill("wrong");
  await expect(dialog.getByLabel("Kamerapassord")).toHaveAttribute("type", "password");
  await dialog.getByRole("button", { name: "Fortsett" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Kontroller passordet");
  await expect(dialog.getByLabel("Adresse")).toHaveValue("192.168.1.20");
  await dialog.getByLabel("Kamerapassord").fill("correct");
  await page.screenshot({ path: `test-results/integration-setup-${test.info().project.name}.png` });
  await dialog.getByRole("button", { name: "Fortsett" }).click();
  await expect(dialog).toContainText("Integrasjonen er lagt til");
  await dialog.getByRole("button", { name: "Ferdig", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await open.click();
  await dialog.getByRole("button", { name: "Reolink", exact: true }).click();
  await dialog.getByRole("button", { name: "Avbryt oppsett" }).click();
  await expect(dialog).toHaveCount(0);
  expect(cancelled).toBe(2);
});

import {
  test,
  expect,
  type Page,
} from "../../frontend/node_modules/@playwright/test";

async function overview(page: Page, english = false) {
  await page.addInitScript(() => {
    localStorage.setItem("smarti-home-style", "harmony");
    localStorage.setItem("smarti-palette", "smarti-black");
  });
  if (english)
    await page.route("**/api/home/language", (route) =>
      route.fulfill({ json: { language: "en" } }),
    );
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await page
    .getByRole("navigation", {
      name: english ? "Main navigation" : "Hovedmeny",
    })
    .getByRole("button", {
      name: english ? "Automations" : "Automasjoner",
      exact: true,
    })
    .click();
  await expect(page.locator(".automation-overview")).toBeVisible();
  const writes: string[] = [];
  page.on("request", (request) => {
    if (!["GET", "HEAD"].includes(request.method()))
      writes.push(request.method() + " " + new URL(request.url()).pathname);
  });
  return writes;
}

for (const english of [false, true]) {
  test(`new automation offers a cancellable method choice and opens the simple guide in ${english ? "English" : "Norwegian"}`, async ({
    page,
  }, info) => {
    const writes = await overview(page, english);
    const title = english ? "New automation" : "Ny automasjon";
    const opener = page.getByRole("button", { name: title, exact: true });
    await opener.click();
    const dialog = page.getByRole("dialog", { name: title, exact: true });
    const simple = dialog.getByRole("button", {
      name: english ? "Simple automation" : "Enkel automasjon",
      exact: true,
    });
    const advanced = dialog.getByRole("button", {
      name: english ? "Advanced" : "Avansert",
      exact: true,
    });
    await expect(simple).toBeVisible();
    await expect(advanced).toBeVisible();
    await expect(advanced).toHaveAccessibleDescription(/Flow/);
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (theme) => (document.documentElement.dataset.theme = theme),
        theme,
      );
      await dialog.screenshot({
        animations: "disabled",
        path: info.outputPath(`creation-${english ? "en" : "nb"}-${theme}.png`),
      });
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await advanced.focus();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
    await expect(page.locator(".routine-guide,.automation-flow")).toHaveCount(
      0,
    );
    expect(writes).toEqual([]);
    await opener.click();
    await simple.click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByRole("heading", {
        name: english ? "When should it happen?" : "Når skal det skje?",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator(".routine-guide")).toBeVisible();
    await expect(page.locator(".flow-designer,.code-editor")).toHaveCount(0);
    expect(writes).toEqual([]);
  });
}

test("advanced creation opens the expanded free Flow canvas directly and discards drafts without writes", async ({
  page,
}, info) => {
  const writes = await overview(page);
  const open = async () => {
    await page
      .getByRole("button", { name: "Ny automasjon", exact: true })
      .click();
    const choice = page.getByRole("dialog", {
      name: "Ny automasjon",
      exact: true,
    });
    await choice.getByRole("button", { name: "Avansert", exact: true }).focus();
    await page.keyboard.press("Enter");
  };
  await open();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const canvas = page.getByRole("region", {
    name: "Arbeidsflate for automasjon",
    exact: true,
  });
  await expect(canvas).toBeVisible();
  await expect(page.locator(".canvas-expanded")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Fri arbeidsflate", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("heading", { name: "Hva skal starte flyten?", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".routine-guide,.code-editor,.canvas-node"),
  ).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe(
    "hidden",
  );
  const name = page.getByRole("textbox", {
    name: "Navn på flyten",
    exact: true,
  });
  await expect(name).toHaveValue("");
  await name.fill("Ulagret Flow");
  await page.screenshot({ path: info.outputPath("new-flow.png") });
  expect(writes).toEqual([]);
  await page
    .getByRole("button", { name: "Vanlig størrelse", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Alle automasjoner", exact: true })
    .click();
  await expect(page.locator(".inline-confirm")).toContainText(
    "Forkaste ulagrede endringer?",
  );
  await page
    .locator(".inline-confirm")
    .getByRole("button", { name: "Avbryt", exact: true })
    .click();
  await expect(page.locator(".automation-flow")).toBeVisible();
  await page
    .getByRole("button", { name: "Alle automasjoner", exact: true })
    .click();
  await page
    .locator(".inline-confirm")
    .getByRole("button", { name: "Bekreft", exact: true })
    .click();
  await expect(page.locator(".automation-overview")).toBeVisible();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
  await open();
  await expect(name).toHaveValue("");
  await expect(page.locator(".canvas-node")).toHaveCount(0);
  expect(writes).toEqual([]);
});

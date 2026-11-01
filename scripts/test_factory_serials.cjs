const {
  chromium,
  expect,
} = require("../frontend/node_modules/@playwright/test");

// Only the dedicated ephemeral HTTPS harness may be used by this mutation test.
const port = Number(process.env.SMARTI_TEST_CLOUD_PORT || 8770);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw Error("Invalid test port");
const origin = `https://localhost:${port}`;
const generated = new Set();

async function login(page, name = "factory-test") {
  await page.goto(origin + "/admin/hubs");
  await page.locator('#login [name="username"]').fill(name);
  await page
    .locator('#login [name="password"]')
    .fill("isolated-factory-password-not-live");
  await page
    .locator('#login button[type="submit"], #login button.primary')
    .click();
}

(async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({
        ignoreHTTPSErrors: true,
        viewport: { width, height: 1000 },
      });
      const page = await context.newPage(),
        errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      let generations = 0,
        registrations = 0;
      page.on("request", (request) => {
        if (request.method() !== "POST") return;
        const path = new URL(request.url()).pathname;
        if (path === "/api/admin/hubs/serial") generations++;
        if (path === "/api/admin/hubs") registrations++;
      });
      await login(page);
      const form = page.locator("#new-hub"),
        input = form.getByRole("textbox", { name: "Serienummer", exact: true });
      const generate = form.getByRole("button", {
        name: "Generer serienummer",
        exact: true,
      });
      await expect(generate).toBeVisible();
      await generate.click();
      const pattern = /^SMARTi-\d{4}-\d{6,}$/;
      await expect(input).toHaveValue(pattern);
      const first = await input.inputValue();
      if (generated.has(first)) throw Error("Reissued serial");
      generated.add(first);
      await expect(input).toBeFocused();
      await expect(page.locator("#serial-status")).toContainText(
        "Serienummeret er klart",
      );
      if (registrations !== 0) throw Error("Generating registered a hub");
      await expect(
        form.getByRole("textbox", { name: "Modell", exact: true }),
      ).toHaveValue("");
      await form
        .getByRole("textbox", { name: "Modell", exact: true })
        .fill("SMARTi testhub");
      await form
        .getByRole("textbox", { name: "Maskinvare / radioer", exact: true })
        .fill("8 GB · Zigbee og Z-Wave");

      let release;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      await page.route(
        "**/api/admin/hubs/serial",
        async (route) => {
          await gate;
          return route.continue();
        },
        { times: 1 },
      );
      await generate.click();
      await expect(form).toHaveAttribute("aria-busy", "true");
      await expect(generate).toBeDisabled();
      await expect(input).toHaveAttribute("readonly", "");
      await expect(
        form.getByRole("button", { name: "Registrer hub", exact: true }),
      ).toBeDisabled();
      release();
      await expect(input).not.toHaveValue(first);
      const serial = await input.inputValue();
      if (!pattern.test(serial) || generated.has(serial))
        throw Error("Invalid serial");
      generated.add(serial);
      await expect(input).not.toHaveAttribute("readonly", "");
      await expect(generate).toBeEnabled();
      if (generations !== 2 || registrations !== 0)
        throw Error("Unexpected requests while generating");

      for (const theme of ["light", "dark"]) {
        await page.evaluate((theme) => {
          document.documentElement.dataset.portalTheme = theme;
        }, theme);
        await form.screenshot({
          path: `/private/tmp/smarti-factory-serial-${width}-${theme}.png`,
        });
        if (
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth + 1,
          )
        )
          throw Error("Horizontal overflow");
      }

      await page.route(
        "**/api/admin/hubs/serial",
        (route) =>
          route.fulfill({ status: 503, json: { detail: "unavailable" } }),
        { times: 1 },
      );
      await generate.click();
      await expect(page.locator("#message")).toContainText(
        "Kunne ikke generere serienummer",
      );
      await expect(input).toHaveValue(serial);
      await expect(generate).toBeEnabled();
      await expect(
        form.getByRole("textbox", { name: "Modell", exact: true }),
      ).toHaveValue("SMARTi testhub");

      await form
        .getByRole("button", { name: "Registrer hub", exact: true })
        .click();
      await expect(page.locator("#factory-kit")).toBeVisible();
      await expect(
        page.locator(".hub-record").filter({ hasText: serial }),
      ).toHaveCount(1);
      await expect(page.getByAltText(`QR-kode for ${serial}`)).toBeVisible();
      await expect(input).toHaveValue("");
      if (registrations !== 1) throw Error("Hub registered more than once");
      await page.reload();
      await expect(
        page.locator(".hub-record").filter({ hasText: serial }),
      ).toHaveCount(1);

      await input.fill(serial);
      await form
        .getByRole("textbox", { name: "Modell", exact: true })
        .fill("Duplicate test");
      await form
        .getByRole("textbox", { name: "Maskinvare / radioer", exact: true })
        .fill("Zigbee");
      await form
        .getByRole("button", { name: "Registrer hub", exact: true })
        .click();
      await expect(page.locator("#message")).toContainText(
        "allerede registrert",
      );
      await expect(input).toHaveValue(serial);
      await input.fill(`MANUAL-${width}`);
      await form
        .getByRole("button", { name: "Registrer hub", exact: true })
        .click();
      await expect(
        page.locator(".hub-record").filter({ hasText: `MANUAL-${width}` }),
      ).toHaveCount(1);

      if (errors.length) throw Error(errors.join("\n"));
      await context.close();
    }
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    await login(page, "customer-test");
    await expect(page.locator("#message")).toContainText("Tilgang mangler");
    await expect(
      page.getByRole("button", { name: "Generer serienummer", exact: true }),
    ).toBeHidden();
    await context.close();
    console.log(
      "PASS: real HTTPS admin login, generation without creation, busy/error states, persistent registration/QR, duplicates, manual serials and resident restrictions at 390/1440 px in both themes.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

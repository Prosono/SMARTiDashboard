// Run against the isolated HTTPS portal from scripts/test_cloud_server.py.
const { chromium, webkit, expect } = require("../frontend/node_modules/@playwright/test");

const portal = `https://localhost:${process.env.SMARTI_TEST_CLOUD_PORT || "8770"}`;

async function test(engine, width) {
  const browser = await engine.launch();
  try {
    const page = await browser.newPage({
      ignoreHTTPSErrors: true,
      viewport: { width, height: 844 },
    });
    page.setDefaultTimeout(10_000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/customer/password/forgot", async (route) => {
      expect(route.request().postDataJSON()).toEqual({ email: "test@example.org" });
      await route.fulfill({ json: { queued: true } });
    });

    await page.goto(portal);
    const auth = page.locator("#auth");
    await expect(auth.getByRole("heading", { name: "Logg inn på SMARTi" })).toBeVisible();
    const language = auth.getByRole("combobox");
    await expect(auth.getByRole("combobox", { name: "Språk" })).toHaveValue("nb");
    await auth.getByRole("textbox", { name: "E-post eller brukernavn" }).fill("customer-test");
    await auth.getByLabel("Passord", { exact: true }).fill("a-typing-test");
    await language.focus();
    await language.selectOption("en");
    await expect(language).toBeFocused();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(auth.getByRole("combobox", { name: "Language" })).toHaveValue("en");
    await expect(auth.getByRole("textbox", { name: "Email or username" })).toHaveValue("customer-test");
    await expect(auth.getByLabel("Password", { exact: true })).toHaveValue("a-typing-test");
    await auth.getByRole("button", { name: "Show password" }).click();
    await expect(auth.getByRole("button", { name: "Hide password" })).toBeVisible();
    await auth.getByRole("button", { name: "Hide password" }).click();
    await auth.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.locator("#message")).toContainText("Incorrect username or password");
    await language.selectOption("nb");
    await expect(page.locator("#message")).toContainText("Feil brukernavn eller passord");
    await language.selectOption("en");
    await page.reload();
    await expect(auth.getByRole("heading", { name: "Sign in to SMARTi" })).toBeVisible();

    const newHomeTab = auth.getByRole("tab", { name: "New home" });
    await newHomeTab.click();
    await expect(newHomeTab).toHaveAttribute("aria-selected", "true");
    await expect(newHomeTab).toHaveCSS("background-color", "rgb(255, 121, 0)");
    const setup = auth.getByRole("tabpanel", { name: "New home" });
    await expect(setup.getByRole("heading", { name: "Your first SMARTi home?" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: `/tmp/smarti-auth-language-${engine.name()}.png` });
    await setup.getByRole("link", { name: "Create an account" }).click();
    await expect(page.getByRole("heading", { name: "Your home starts here." })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Full name" })).toBeVisible();
    await expect(page.getByLabel("Confirm password", { exact: true })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /I accept the SMARTi terms of use/ })).toBeVisible();
    await page.getByRole("textbox", { name: "Full name" }).fill("Test Ægir");
    await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("nb");
    await expect(page.getByRole("heading", { name: "Ditt hjem starter her." })).toBeVisible();
    await expect(page.getByLabel("Gjenta passord", { exact: true })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Fullt navn" })).toHaveValue("Test Ægir");
    await page.getByRole("combobox", { name: "Språk" }).selectOption("en");
    await page.reload();
    await expect(page.getByRole("heading", { name: "Your home starts here." })).toBeVisible();
    await page.getByRole("link", { name: "Already have an account? Sign in" }).click();

    await auth.getByRole("link", { name: "Forgot your password?" }).click();
    await expect(page.getByRole("heading", { name: "Forgot your password?" })).toBeVisible();
    await page.getByRole("textbox", { name: "Email address" }).fill("test@example.org");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.locator("#message")).toContainText("we’ll email you a link");
    await page.getByRole("link", { name: "Back to sign in" }).click();
    await auth.getByRole("textbox", { name: "Email or username" }).fill("customer-test");
    await auth.getByLabel("Password", { exact: true }).fill("isolated-factory-password-not-live");
    await auth.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.locator("#account")).toBeVisible();
    await expect(page.getByRole("heading", { name: "My homes" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Add your first home" })).toBeVisible();
    await page.route("**/api/homes", route => route.fulfill({json: [{
      name: "Testbolig Øst", installation_id: "8628a7ad-2450-4004-ad2b-2a2404d37262",
      connected: true, remote_enabled: true, can_manage: true,
    }]}));
    await page.reload();
    await expect(page.locator("#home-count")).toHaveText("1 home");
    await expect(page.getByRole("heading", {name: "Testbolig Øst"})).toBeVisible();
    await expect(page.getByRole("link", {name: "Open home"})).toBeVisible();
    await page.getByRole("button", {name: /Add member/}).click();
    await expect(page.getByRole("dialog", {name: "Add a member"}).getByRole("button", {name: "Send invitation"})).toBeVisible();
    await page.getByRole("button", {name: "Cancel", exact: true}).click();
    await page.getByRole("button", {name: "Change the home photo for Testbolig Øst"}).click();
    await expect(page.getByRole("dialog", {name: "Home photo"}).getByRole("button", {name: "Upload photo"})).toBeVisible();
    await page.getByRole("button", {name: "Close", exact: true}).click();
    await page.unroute("**/api/homes");
    await page.goto(`${portal}/account`);
    await expect(page.getByRole("heading", { name: "Your SMARTi account" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save profile" })).toBeVisible();
    await expect(page.locator("#profile-summary")).toContainText("This older account needs a contact profile");
    await expect(page.getByRole("link", { name: "My homes", exact: true })).toBeVisible();
    await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("nb");
    await expect(page.getByRole("heading", { name: "Din SMARTi-konto" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Lagre profil" })).toBeVisible();
    await page.getByRole("combobox", { name: "Språk" }).selectOption("en");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.goto(portal);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(auth.getByRole("heading", { name: "Sign in to SMARTi" })).toBeVisible();

    await auth.getByRole("link", { name: "Create an account" }).click();
    const registration = page.locator("#signup");
    await registration.getByRole("textbox", { name: "Full name" }).fill("Test Ægir");
    await registration.getByRole("textbox", { name: "Email", exact: true }).fill(`account-${engine.name()}-${Date.now()}@example.org`);
    await registration.getByRole("textbox", { name: "Phone number" }).fill("12345678");
    await registration.getByRole("textbox", { name: "Street address" }).fill("Testveien 1");
    await registration.getByRole("textbox", { name: "Postal code" }).fill("0001");
    await registration.getByRole("textbox", { name: "City" }).fill("Oslo");
    await expect(registration.getByRole("combobox", { name: "Country" })).toHaveValue("Norway");
    await registration.getByLabel("Choose a password", { exact: true }).fill("isolated-test-account-password");
    await registration.getByLabel("Confirm password", { exact: true }).fill("different");
    await expect(registration.getByText("Passwords must match")).toBeVisible();
    await registration.getByLabel("Confirm password", { exact: true }).fill("isolated-test-account-password");
    await registration.getByRole("checkbox", { name: /I accept the SMARTi terms of use/ }).check();
    await registration.getByRole("button", { name: "Create an account" }).click();
    await expect(page.getByRole("heading", { name: "Your SMARTi account" })).toBeVisible();
    await expect(page.locator("#profile-summary")).toHaveText("Verify your email before adding a hub.");
    await registration.getByRole("textbox", { name: "City" }).fill("Kristiansand");
    await registration.getByRole("button", { name: "Save profile" }).click();
    await expect(page.locator("#message")).toContainText("Your profile was saved.");
    await expect(registration.getByRole("textbox", { name: "City" })).toHaveValue("Kristiansand");

    await page.getByRole("link", {name: "Support", exact: true}).click();
    await expect(page.getByRole("heading", {name: "How can we help?"})).toBeVisible();
    await expect(page.getByRole("heading", {name: "No requests yet"})).toBeVisible();
    await page.getByRole("link", {name: /Services and pricing/}).click();
    await expect(page.getByRole("heading", {name: "Hourly support"})).toBeVisible();
    await expect(page.locator("#terms")).toContainText("Hourly work is billed for the time spent.");
    await page.getByRole("link", {name: "Support", exact: true}).click();
    await page.getByRole("button", {name: "Create your first request"}).click();
    const request = page.locator("#create");
    await expect(request.getByRole("heading", {name: "Tell us what you need"})).toBeVisible();
    await request.getByRole("textbox", {name: "Subject"}).fill("Test request Øst");
    await request.getByRole("combobox", {name: "Category"}).selectOption("devices");
    await request.getByRole("textbox", {name: "Description"}).fill("This is a test using the isolated portal.");
    await request.getByRole("checkbox").check();
    await request.getByRole("button", {name: "Submit request"}).click();
    const requestDetail = page.locator("#case");
    await expect(requestDetail.getByRole("heading", {name: "Conversation"})).toBeVisible();
    await expect(requestDetail.getByText("General enquiry", {exact: false})).toBeVisible();
    await expect(requestDetail.getByText("No access has been requested.")).toBeVisible();
    await requestDetail.getByRole("textbox", {name: "Reply"}).fill("A test reply.");
    await requestDetail.getByRole("button", {name: "Send reply"}).click();
    await expect(requestDetail.getByText("A test reply.")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.getByRole("link", {name: "My account", exact: true}).click();
    await page.getByRole("combobox", {name: "Language", exact: true}).selectOption("nb");
    await page.getByRole("link", {name: "Support", exact: true}).click();
    await expect(page.getByRole("heading", {name: "Hvordan kan vi hjelpe?"})).toBeVisible();
    await page.getByRole("link", {name: "Mine hjem", exact: true}).click();
    await expect(page.getByRole("heading", {name: "Mine hjem"})).toBeVisible();
    await page.getByRole("link", {name: "Min konto", exact: true}).click();
    await page.getByRole("combobox", {name: "Språk"}).selectOption("en");
    await page.getByRole("button", { name: "Delete account", exact: true }).click();
    const confirmation = page.getByRole("dialog", { name: "Delete account?" });
    await expect(confirmation.getByRole("status")).toContainText("You can delete this account");
    await confirmation.getByRole("checkbox").check();
    await confirmation.getByRole("textbox", { name: "Type DELETE to confirm" }).fill("DELETE");
    await confirmation.getByRole("button", { name: "Permanently delete account" }).click();
    await expect(auth.getByRole("heading", { name: "Sign in to SMARTi" })).toBeVisible();
    expect(errors).toEqual([]);
    console.log(`${engine.name()} (${width}px): sign-in, account, homes, support and account deletion passed`);
  } finally {
    await browser.close();
  }
}

Promise.all([test(chromium, 1440), test(webkit, 320)]).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

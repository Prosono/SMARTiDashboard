import { test, expect } from "../../frontend/node_modules/@playwright/test";

test("blueprint preview is read-only and input edits retain the linked source", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  const nav = page.getByRole("navigation", { name: "Hovedmeny" });
  await expect(nav).toBeVisible();
  const session = await (await page.request.get("/api/session")).json();
  const config = {
    alias: `Oppskrift med trygge valg ${test.info().project.name}`,
    description:
      "Tester kun oppskriftens visning og lagring, uten å kjøre enheter.",
    mode: "restart",
    trace: { stored_traces: 9 },
    use_blueprint: {
      path: "smarti-fixtures/motion-light.yaml",
      input: {
        motion_sensor: "binary_sensor.front_door",
        brightness_pct: 45,
        allow_evening: true,
        calculation: "{{ states('sensor.threshold') | float(10) }}",
        light_target: {
          entity_id: ["light.living_pendant"],
          area_id: "living",
        },
        weekdays: ["mon", "wed", "fri"],
      },
    },
  };
  const created = await page.request.post("/api/manage/automations", {
    headers: {
      "X-CSRF-Token": session.csrf,
      Origin: new URL(page.url()).origin,
    },
    data: { config },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const saved = await created.json();
  const sourceURL = `/api/manage/automations/${saved.id}`;
  const entityId = `automation.${saved.id}`;
  let previewRequests = 0;

  // Demo does not expand blueprints. Simulate HA's separate, resolved read model
  // using persisted inputs, while leaving the real source/save API under test.
  await page.route(
    `**/api/manage/automation-preview/${entityId}`,
    async (route) => {
      previewRequests += 1;
      const source = await (await page.request.get(sourceURL)).json();
      const inputs = source.config.use_blueprint.input;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          entity_id: entityId,
          read_only: true,
          config: {
            alias: "Oppløst oppskrift – kun forhåndsvisning",
            triggers: [
              {
                alias: "Oppskriftens dør",
                trigger: "state",
                entity_id: inputs.motion_sensor,
                to: "on",
              },
            ],
            conditions: [],
            actions: [
              {
                alias: "Oppskriftens valg",
                choose: [
                  {
                    alias: "Kveldslys fra oppskriften",
                    conditions: [{ condition: "sun", after: "sunset" }],
                    sequence: [
                      {
                        alias: "Oppskriftens lampe",
                        action: "light.turn_on",
                        target: inputs.light_target,
                        data: {
                          brightness_pct: inputs.brightness_pct,
                          transition: 2,
                        },
                      },
                    ],
                  },
                ],
                default: [{ stop: "Ingen vei passet" }],
              },
            ],
            runtime_only:
              "This resolved configuration must never replace use_blueprint",
          },
        }),
      });
    },
  );

  await nav.getByRole("button", { name: "Innstillinger", exact: true }).click();
  await page
    .locator(".experience-picker")
    .getByRole("button", { name: /^Avansert/ })
    .click();
  await nav.getByRole("button", { name: "Automasjoner", exact: true }).click();
  await page
    .locator(".automation-item")
    .filter({ hasText: config.alias })
    .getByRole("button", { name: "Rediger", exact: true })
    .click();

  const blueprint = page.locator(".blueprint-preview");
  await expect(
    blueprint.getByRole("heading", {
      name: "En rutine fra en oppskrift",
      exact: true,
    }),
  ).toBeVisible();
  await expect(blueprint).toContainText(config.use_blueprint.path);
  await expect(
    page.getByRole("button", { name: "Flytvisning", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Vanlig editor", exact: true }),
  ).toBeDisabled();
  await expect(blueprint.locator(".blueprint-flow")).toHaveCount(0);
  await blueprint
    .getByRole("button", { name: "Se hva oppskriften gjør", exact: true })
    .click();
  await expect.poll(() => previewRequests).toBeGreaterThan(0);

  const flow = blueprint.locator(".blueprint-flow");
  await expect(
    flow.getByRole("button", {
      name: "Vis steg: Oppskriftens lampe",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    flow.getByRole("button", { name: /^Rediger steg:/ }),
  ).toHaveCount(0);
  await expect(flow.locator(".flow-branch-add")).toHaveCount(0);
  await expect(flow.getByRole("textbox")).toHaveCount(0);
  await flow
    .getByRole("button", { name: "Vis steg: Oppskriftens lampe", exact: true })
    .click();
  const previewDialog = page.getByRole("dialog");
  await expect(previewDialog).toContainText(
    "Dette steget styres av oppskriften",
  );
  await expect(previewDialog.locator(".flow-inspector")).toHaveCount(0);
  await expect(previewDialog.getByRole("textbox")).toHaveCount(0);
  await expect(
    previewDialog.getByRole("button", {
      name: "Ferdig med steget",
      exact: true,
    }),
  ).toHaveCount(0);
  await previewDialog
    .getByText("Vis oppsettet for steget", { exact: true })
    .click();
  await expect(previewDialog.locator("pre")).toContainText(
    '"brightness_pct": 45',
  );
  await previewDialog
    .getByRole("button", { name: "Lukk innstillinger", exact: true })
    .click();

  // Opening/closing nested read-only cards must not materialize runtime steps in the source.
  const untouched = await (await page.request.get(sourceURL)).json();
  expect(untouched.config).toEqual({ ...config, id: saved.id });
  await blueprint.getByLabel("brightness pct", { exact: true }).fill("65");
  await blueprint
    .getByRole("combobox", { name: "allow evening", exact: true })
    .selectOption("false");
  await blueprint
    .getByLabel("motion sensor", { exact: true })
    .fill("binary_sensor.motion_hall");
  await expect(
    blueprint.getByLabel("calculation", { exact: true }),
  ).toHaveValue(config.use_blueprint.input.calculation);

  // The visible flow remains an honest snapshot until the changed inputs are saved.
  await flow
    .getByRole("button", { name: "Vis steg: Oppskriftens lampe", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByText("Vis oppsettet for steget", { exact: true })
    .click();
  await expect(page.getByRole("dialog").locator("pre")).toContainText(
    '"brightness_pct": 45',
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Lukk innstillinger", exact: true })
    .click();

  const submit = page.waitForResponse(
    (r) => r.url().endsWith(sourceURL) && r.request().method() === "PUT",
  );
  await page
    .getByRole("button", { name: "Lagre automasjon", exact: true })
    .click();
  const response = await submit;
  expect(response.ok(), await response.text()).toBeTruthy();
  const expected = structuredClone(config);
  expected.use_blueprint.input.brightness_pct = 65;
  expected.use_blueprint.input.allow_evening = false;
  expected.use_blueprint.input.motion_sensor = "binary_sensor.motion_hall";
  const actual = await (await page.request.get(sourceURL)).json();
  expect(actual.config).toEqual({ ...expected, id: saved.id });
  expect(response.request().postDataJSON().config).toEqual({
    ...expected,
    id: saved.id,
  });
  expect(actual.config).not.toHaveProperty("triggers");
  expect(actual.config).not.toHaveProperty("actions");
  expect(actual.config).not.toHaveProperty("runtime_only");
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: `../artifacts/${test.info().project.name}-blueprint-preview.png`,
    fullPage: true,
  });
});

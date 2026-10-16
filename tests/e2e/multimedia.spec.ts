import { test, expect } from "../../frontend/node_modules/@playwright/test";
test("multimedia filters players and sends supported playback commands", async ({
  page,
}) => {
  let state = "playing";
  const commands: any[] = [];
  const player = (
    id: string,
    name: string,
    kind: string,
    area: string,
    unavailable = false,
  ) => ({
    id,
    entity_id: `media_player.${id}`,
    name,
    domain: "media_player",
    device_id: id,
    area_id: area,
    state: unavailable ? "unavailable" : state,
    availability: unavailable ? "unavailable" : "available",
    attributes: {
      device_class: kind,
      media_title: "Evening sessions",
      media_artist: "Living room collection",
      volume_level: 0.35,
      media_duration: 236,
      media_position: 84,
      source: "Radio",
      is_volume_muted: false,
    },
    capabilities: [
      {
        kind: "media",
        actions: ["media_play", "media_pause", "media_next_track", "turn_off"],
      },
      { kind: "volume", actions: ["set_volume"] },
      { kind: "mute", actions: ["set_mute"] },
    ],
    diagnostic: false,
  });
  await page.route("**/api/home", async (r) => {
    const response = await r.fetch();
    const data = await response.json();
    await r.fulfill({
      json: {
        ...data,
        controls: [
          ...data.controls,
          player("speaker", "Stuehøyttaler", "speaker", "living"),
          player("tv", "TV på soverommet", "tv", "bedroom", true),
        ],
      },
    });
  });
  await page.route("**/api/controls/media_player.*/commands", async (r) => {
    const body = r.request().postDataJSON();
    commands.push(body);
    if (body.action === "media_pause") state = "paused";
    await r.fulfill({ json: { status: "state_updated" } });
  });
  await page.goto("/");
  await page.getByLabel("Brukernavn", { exact: true }).fill("tester");
  await page
    .getByLabel("Passord", { exact: true })
    .fill("test-password-not-for-live");
  await page.getByRole("button", { name: "Logg inn", exact: true }).click();
  await page.getByRole("tab", { name: "Multimedia", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Multimedia", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".media-player-card")).toHaveCount(2);
  await expect(
    page.getByRole("button", {
      name: "TV på soverommet: Spill av",
      exact: true,
    }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Stuehøyttaler: Pause", exact: true })
    .click();
  await expect(
    page.locator(".media-state").filter({ hasText: "På pause" }),
  ).toBeVisible();
  expect(commands[0]).toEqual({ action: "media_pause" });
  await page.getByLabel("Søk i multimedia").fill("finnesikke");
  await expect(page.locator(".media-player-card")).toHaveCount(0);
  await page.getByLabel("Søk i multimedia").fill("");
  await page.getByRole("button", { name: "Liste", exact: true }).click();
  await expect(page.locator(".media-player-grid")).toHaveClass(/is-list/);
  await page.getByRole("button", { name: "Kort", exact: true }).click();
  await page
    .getByLabel("Multimedia-rom", { exact: true })
    .selectOption("living");
  await expect(page.locator(".media-player-card")).toHaveCount(1);
  await page.screenshot({
    path: `../artifacts/${test.info().project.name}-multimedia.png`,
    fullPage: true,
  });
  await page.getByRole("tab", { name: "Multimedia", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Oversikt", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(
    page.getByRole("tab", { name: "Multimedia", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  expect(
    await page.locator("body").evaluate((e) => e.scrollWidth <= e.clientWidth),
  ).toBe(true);
});

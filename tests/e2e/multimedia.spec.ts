import { test, expect } from "../../frontend/node_modules/@playwright/test";
test("multimedia filters players and sends supported playback commands", async ({
  page,
}) => {
  let state = "playing";
  let extraPlayers = 0;
  let appearance = { name: "Stuehøyttaler", icon: "auto", image: "auto" };
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
    name: id === "speaker" ? appearance.name : name,
    domain: "media_player",
    device_id: id,
    area_id: area,
    state: unavailable ? "unavailable" : state,
    availability: unavailable ? "unavailable" : "available",
    attributes: {
      device_class: kind,
      smarti_icon: id === "speaker" ? appearance.icon : "auto",
      smarti_media_image: id === "speaker" ? appearance.image : "auto",
      smarti_artwork: id === "speaker" ? "cover1" : undefined,
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
          ...Array.from({ length: extraPlayers }, (_, i) =>
            player(
              `extra${i}`,
              [
                "Chromecast Stue",
                "HomePod mini",
                "Sonos kjøkken",
                "TV kjøkken",
                "Høyttaler 5",
              ][i],
              "speaker",
              "living",
            ),
          ),
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
  await page.route(
    "**/api/controls/media_player.speaker/appearance",
    async (r) => {
      appearance = r.request().postDataJSON();
      await r.fulfill({ json: { saved: true } });
    },
  );
  await page.route(
    "**/api/controls/media_player.speaker/artwork?*",
    async (r) => {
      await r.fulfill({
        contentType: "image/png",
        body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=",
          "base64",
        ),
      });
    },
  );
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
    page.locator(".media-device-visual img:not(.media-product-image)"),
  ).toBeVisible();
  await expect(
    page.locator(".media-device-visual img:not(.media-product-image)"),
  ).toHaveJSProperty("naturalWidth", 1);
  const tvImage = page.locator(".media-product-image");
  await expect(tvImage).toHaveAttribute("src", /media-devices\/tv\.webp$/);
  await expect(tvImage).toHaveJSProperty("naturalWidth", 600);
  await page.screenshot({
    path: `/tmp/media-redesign-${test.info().project.name}.png`,
    fullPage: true,
  });
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
  await page
    .getByRole("button", { name: "Åpne Stuehøyttaler", exact: true })
    .click();
  const detail = page.getByRole("dialog", {
    name: "Stuehøyttaler",
    exact: true,
  });
  await expect(
    detail.getByRole("button", {
      name: "Stuehøyttaler: Spill av",
      exact: true,
    }),
  ).toBeEnabled();
  await expect(
    detail.getByRole("button", { name: "Skjul enhet", exact: true }),
  ).toBeVisible();
  await detail
    .getByRole("button", { name: "Tilpass mediaspiller", exact: true })
    .click();
  const settings = page.getByRole("dialog", {
    name: "Tilpass mediaspiller",
    exact: true,
  });
  await expect(settings.locator(".light-icon-options button")).toHaveCount(13);
  await settings
    .getByRole("button", { name: "Apple HomePod", exact: true })
    .click();
  const pictures = settings.getByRole("group", { name: "Velg bilde" });
  await expect(pictures.locator("img")).toHaveCount(10);
  await pictures.getByRole("button", { name: "Telefon", exact: true }).click();
  await settings.screenshot({
    path: `/tmp/media-icons-${test.info().project.name}.png`,
  });
  await settings.getByRole("button", { name: "Lagre", exact: true }).click();
  await expect(settings).toHaveCount(0);
  expect(appearance.icon).toBe("homepod");
  expect(appearance.image).toBe("phone");
  await expect(detail.locator(".media-product-image")).toHaveAttribute(
    "src",
    /phone\.webp$/,
  );
  await detail
    .getByRole("button", { name: "Tilpass mediaspiller", exact: true })
    .click();
  await expect(
    settings.getByRole("button", { name: "Apple HomePod", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    settings
      .getByRole("group", { name: "Velg bilde" })
      .getByRole("button", { name: "Telefon", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await settings
    .getByRole("button", { name: "Lukk innstillinger", exact: true })
    .click();
  await detail
    .getByRole("button", { name: "Lukk innstillinger", exact: true })
    .click();

  await page
    .getByRole("button", { name: "Vis søk og filtre", exact: true })
    .click();
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
    page.getByRole("tab", { name: "Diverse", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(
    page.getByRole("tab", { name: "Multimedia", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  extraPlayers = 5;
  await page.reload();
  await page.getByRole("tab", { name: "Multimedia", exact: true }).click();
  await expect(page.locator(".media-player-card")).toHaveCount(6);
  for (const type of ["streamer", "mini", "speaker", "tv"]) {
    await expect(
      page.locator(`.media-product-image[src$="/${type}.webp"]`).first(),
    ).toHaveJSProperty("naturalWidth", 600);
  }
  await page.screenshot({
    path: `/tmp/media-products-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Vis alle 7 spillere", exact: true })
    .click();
  await expect(page.locator(".media-player-card")).toHaveCount(7);
  for (const card of await page.locator(".media-player-card").all()) {
    const picture = await card.locator(".media-device-visual").boundingBox();
    const controls = await card.locator(".media-controls-row").boundingBox();
    const progressElement = card.locator(".media-progress");
    const progress = (await progressElement.count())
      ? await progressElement.boundingBox()
      : null;
    expect(picture).not.toBeNull();
    expect(controls).not.toBeNull();
    if (picture && controls)
      expect(picture.y + picture.height).toBeLessThanOrEqual(controls.y);
    if (picture && progress)
      expect(picture.y + picture.height).toBeLessThanOrEqual(progress.y);
  }

  await page.getByRole("button", { name: "Vis færre", exact: true }).click();
  await expect(page.locator(".media-player-card")).toHaveCount(6);
  expect(
    await page.locator("body").evaluate((e) => e.scrollWidth <= e.clientWidth),
  ).toBe(true);
});

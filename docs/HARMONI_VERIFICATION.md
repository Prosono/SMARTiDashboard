# Compact Home toolbar and hidden search — release 1.36.95

The existing top-right gear starts editing the active Harmoni canvas. The inline
Edit layout button and canvas title/description are removed. Save/Cancel and the
other editing actions appear only while editing; the gear reflects that state.
Successful saves and cancellation restore focus to the enabled gear. Repeated
gear clicks during editing preserve the draft. Failed loads keep editing disabled
and retain the existing retry action; failed saves preserve the draft.

Home category titles now remain as screen-reader headings without taking visible
space. Cards start 16px below the tabs. Existing room headings and card titles
remain. Category search/filters start collapsed and register a round magnifier
beside the alert and gear. Opening focuses the search field; Escape closes the
filters and returns focus to the magnifier. Each newly mounted category starts
collapsed. Simple-mode category destinations use the same controls.

Phone Tiles/Detailed selection now lives in editing mode, retaining the existing
browser preference independently of stored desktop layouts. Overview editing also
provides Personalize Home for its original favorites/routines preferences.
Classic/Living and the Energy page retain their existing gear fallback. Reusable
Devices headings and toolbar disclosure remain independent of Home controls.
No backend or equipment-image files changed.

Validation on 2 November 2026:

- Production TypeScript/Vite build, frontend lint, changed-test TypeScript,
  changed-file Prettier, git diff checks and deterministic packaging checks passed.
  The existing Vite chunk-size advisory remains. **255 unit cases passed.**
- **52 selected production-build browser scenarios passed** across initial and
  follow-up runs: toolbar search, all three styles, light/dark themes, mobile
  tiles, card controls/artwork, layout save/cancel/focus, drag/resize, compaction,
  failed saves and concurrent-edit protection.
- **16 desktop/mobile scenarios passed against the final extracted archive**.
  They cover collapsed search and keyboard focus, room filtering, retained alerts,
  Simple mode, Devices independence and gear editing on all six canvas pages.
- Overview and category screenshots were visually inspected on desktop and phone.
  The old title/edit row is absent and the search control is a round magnifier.
- All **276 runtime files** match their manifest hashes. Archive SHA-256:
  `69b8168b2212d6bc8941435360905460bf63e83413d6d5bce3b253e15057305d`.

Browser checks used isolated demo servers and fixture devices. No real device
commands or Home Assistant hardware were exercised.

# Banner-free Home destinations — release 1.36.94

The image/greeting banner is removed from Overview and all Home categories,
including Energy's Home heading. Categories retain a compact icon/title and
show their existing search, room selectors and filters directly. Classic,
Living, Harmoni and the category destinations in Simple mode share this policy.

Home name/date stay above the tabs on desktop and phones. The existing red
alert opens its details from the toolbar on every advanced Home tab, including
when reduced motion is requested. A compact offline message preserves stale-data
feedback. Overview retains its accessible page heading. Classic/Living routines
and presence remain available outside their former banner.

The Home-only context leaves the reusable device-management headings, photo
preferences and collapsible toolbars intact. Existing layouts, card imagery,
colors, glass surfaces, mobile tiles, command behavior and saved image data are
preserved. No backend or asset files changed.

Validation on 2 November 2026:

- Production TypeScript/Vite build, frontend lint, changed-test TypeScript,
  changed-file Prettier, git diff checks and deterministic package checks passed.
  The existing Vite chunk-size advisory remains. **255 unit cases passed.**
- **48 selected production-build browser scenarios passed** across the initial
  and follow-up runs, covering the bannerless destinations, both themes, all
  three Home styles, search/room filtering, alerts, Simple mode, offline states,
  mobile layouts, device images, card controls and saved layouts.
- **18 desktop/mobile browser scenarios passed against the final extracted
  runtime archive**, including the surviving Devices photo upload/preference
  flow and canvas editing/resizing/reload. Desktop/mobile screenshots were
  visually inspected; no empty banner stage remains above the cards.
- The archive contains **276 runtime files**. Every extracted file matches its
  manifest hash. SHA-256:
  `39ba89538aaac1f10df929534fb1516a14fabccf2cb19e36913c0db57d5cd0c3`.

Browser checks used isolated demo servers and fixture devices. Real device
commands and Home Assistant hardware were not exercised.

# Stronger colored glass, opaque portraits and light-gray calendar — release 1.36.93

Category colors now use more saturated identities and gradients. The former dark
mode strength reduction is removed. Reported RGB lighting still supplies its
exact configured color, while clock/energy remain charcoal. The calendar uses a
light-gray gradient with dark ink; month, empty agenda, footer and separators
now inherit that ink instead of the previous pale warm labels.

The glass material has lower opacity (82/88% in light mode, 74/84% in dark mode),
stronger backdrop saturation and a clearer lit edge/reflection. Calendar opacity
stays higher to retain its light-gray appearance. Blur remains 5px on phones and
8px elsewhere; there are no added animated filters or runtime measuring loops.
Reduced transparency restores opaque material, including calendar overrides.

Equipment, unavailable media portraits and mobile portraits retain CSS opacity 1.
The unavailable mobile icon is dimmed independently, so its parent no longer
fades the product. Grayscale/status and disabled actions remain available cues.
Manually selected cutouts also use full opacity and bounded contain sizing.
Full photographic backdrops use full opacity, with an independent text scrim.
Small photographic cards keep their expansion button above the scrim/content.
The actual image files and their transparent outer margins are unchanged.

Validation on 2 November 2026:

- Production TypeScript/Vite build, frontend lint, changed-test TypeScript,
  changed-file Prettier, git diff --check and deterministic packaging checks
  passed. Existing Vite chunk-size advisory remains. **255 unit cases passed.**
- **28 selected production-build browser regressions passed**, followed by
  **26 desktop/mobile browser scenarios against the final extracted archive**.
  They retain equipment images, image selection, weather, media and thermostat
  behavior, preview/save, reduced transparency and compact/detailed layouts.
- A new scenario verifies a neutral light-gray calendar, darker readable labels,
  greater glass transparency and at least 4.5:1 sampled composite contrast for
  readings/secondary/calendar text over gradient stops and representative light/
  dark page backdrops, at 390/834/1440px. This sampling is not a full WCAG audit.
- Portrait opacity is checked through its ancestor chain, including unavailable
  devices and explicit image choices. A deliberately small photo card still
  opens its full view. Test commands use isolated fixtures.
- Actual light/dark renders were visually inspected. These are Chromium
  emulations, not physical-device validation. All **276 runtime files** match
  the final extracted tested archive. Backend and image assets are unchanged;
  earlier repository-wide validation limitations below still apply.

---

# Expanded transparent equipment portraits — release 1.36.92

Thirteen new product portraits were generated with the built-in image_gen tool:
water leak detector, PIR motion detector, EV wallbox, light switch, smoke detector,
LED strip, outdoor fixture, downlight, track lighting, ceiling lamp, E27 bulb,
floor lamp and desk lamp. Each original has genuine alpha. Runtime WebPs are
512×512 with transparency retained; the thirteen files total **246,066 bytes**.
Original PNGs remain in Codex's generated-images directory. The complete prompts
and original filenames are recorded in equipment-images-2026-11-02.json.

The shared equipment artwork selects the new portraits on both full cards and
mobile tiles, with existing SVG fallbacks on failure. Explicit image choices
include the new portraits using namespaced IDs, separate from existing room
photographs. The backend accepts only these additional allowlisted image IDs.
Track lighting also has a native picker icon and a persisted admin light-type
choice. Existing source bindings, permissions and device commands are retained.
Name-based selection gives physical lamp types priority over a generic LED hint;
EV wallbox art requires clear EV hints on a switching entity, keeping ordinary
phone-charging sockets distinct. Images are decorative and contain no live values.

Validation on 2 November 2026:

- Production TypeScript/Vite build, frontend lint, changed browser-test TypeScript,
  changed-file Prettier, git diff --check and deterministic packaging checks passed.
  Existing Vite chunk-size advisory remains.
- **255 frontend unit cases passed**, including lamp-type precedence, explicit
  overrides, EV charging versus ordinary sockets, and sensor classifications.
- **43 selected backend tests passed**, covering appearance permissions,
  track-type persistence, image allowlisting and personal layout persistence.
  Scoped application/layout-test Ruff passed; the API test file's pre-existing
  I001 import ordering was excluded. Existing TestClient deprecation remains.
- **38 desktop/mobile browser scenarios passed against the final extracted
  archive.** New cases load all thirteen images at 390/834/1440px in both themes,
  verify bounds, transparent card materials, image selection/save/reload and
  image-failure fallbacks without issuing device commands. The light picker
  selects and persists track lighting. Regression cases retain mobile layouts,
  source readings, device controls, weather photos, media and thermostat behavior.
- Generated originals and actual light/dark card renders were visually inspected.
  These are Chromium emulations rather than physical-device validation.
- All **276 runtime files** match the extracted tested archive. Backend changes
  only extend presentation allowlists. Earlier repository-wide validation
  limitations below remain applicable.

---

# Mobile product portraits and translucent card materials — release 1.36.91

Phone tiles now reuse the local equipment cutouts, media-device selection and
state-aware equipment illustrations from larger cards. Lighting summaries use
actual light controls; explicit source and image choices take precedence. Images
occupy a bounded header row, separate from the title, reading and secondary text.
Failed images retain a decorative fallback; unavailable equipment is dimmed.
There are no additional live streams, history queries or measuring loops.

Non-photographic Home card surfaces, previews and full views use one translucent
colored gradient with a fine border, inset highlight and backdrop filter. Inner
specialist cards inherit a transparent skin, so an opaque second background does
not mask the glass. Only the material is translucent: content opacity remains 1.
Weather scenes and selected room photographs keep their existing treatment.
Transparent product cutouts are distinguished from photographic backgrounds.
Blur is 5px on phones and 8px elsewhere. Reduced-transparency preference switches
to an opaque material without blur; a forced-colors fallback is included.

Validation on 2 November 2026:

- Production TypeScript/Vite build, frontend lint, test TypeScript, changed-file
  Prettier, git diff --check and deterministic packaging checks passed. The
  existing Vite chunk-size advisory remains. **253 unit cases passed.**
- **40 selected desktop/mobile browser regressions passed** against the production
  build, covering palettes, equipment types, layout editing, room grouping,
  reference controls and the new portraits/materials.
- The final extracted archive passed 29 of 30 targeted scenarios on the first
  pass. The remaining thermostat scenario encountered an in-flight test response
  being disposed during teardown; awaiting route cleanup fixed the fixture, and
  that scenario then passed twice on each browser profile. No app change was
  needed for that test cleanup.
- Final-package cases verify 320/390/430px portraits without text collisions,
  native artwork selection, square geometry, 390/834/1440px glass surfaces,
  transparent inner cards, photo exclusions, custom cutouts, no-image choices,
  image failures, reduced transparency and deferred history mounting. Picker,
  media, weather and thermostat behavior are retained.
- Light/dark phone renders were visually checked. Results use Chromium emulation,
  not physical devices. All **263 runtime files** match the extracted tested
  archive. Backend code and the existing background animation are unchanged;
  earlier repository-wide validation limitations below still apply.

---

# Compact phone tiles and full controls — release 1.36.90

Phones now default to two square tiles per row. Wider landscape phones use
three columns. Each tile shows its name, icon, actual reading and brief status;
a tap mounts the original full controls in the existing accessible dialog.
The per-browser Tiles/Detailed choice is separate from saved layout geometry.
Editing uses the existing layout, and returning to tiles does not overwrite
card sizes, placement, configuration or room grouping. Tablet and desktop
layouts remain detailed. The energy destination keeps its existing layout.

Phone banners share a compact 320px height, with smaller inline status fields.
Weather tiles reuse the state-driven local scenes and localized labels. Clock
tiles reuse the shared minute snapshot, without adding a timer per card. Full
card children, history queries and control measurement observers remain unmounted
until needed in tile mode. Missing sources, unavailable controls, offline homes,
unknown temperatures and unknown light states are represented explicitly.

Validation on 2 November 2026:

- Production TypeScript/Vite build, frontend lint, mobile-test TypeScript,
  changed-file Prettier and git diff --check passed. The existing Vite chunk-size
  advisory remains.
- **253 frontend unit cases passed.** New cases cover real zero versus missing
  readings, explicit missing sources, native thermostat units and modes,
  Fahrenheit normalization, W/kW versus counters, unknown light states, weather
  labels/scenes, graph sources and immutable phone geometry with room tracks.
- **32 selected desktop/mobile browser scenarios passed against the final
  extracted archive.** Fresh-default tests verify 320–430px squares, three-column
  phone landscape, all grouped categories, shared banner heights, tablet/desktop
  fallback, persistent detailed choice, edit/save geometry, focus return, actual
  temperature commands, unavailable devices and deferred history mounting.
  Existing suites explicitly retain detailed mode to verify inline controls.
- Regression cases cover reference layouts/materials, weather image fallbacks,
  thermostat limits/modes, media controls, room editing and no nested card scroll.
  Commands run against isolated fixtures. The phone rendering was visually
  checked; these are Chromium emulations, not physical-device validation.
- Deterministic packaging check passed. All **263 runtime files** match the
  extracted archive used by the final browser tests. No backend code changed;
  the earlier repository-wide limitations below remain applicable.

---

# Centered thermostat setpoint and bottom reading — release 1.36.89

The latest confirmed reference uses a centered large target, minus/plus controls
on either side, and a full-width room-temperature footer below a horizontal line.
The preceding side-by-side framed layout is replaced with this composition.
The header uses the actual device/card name, a localized Thermostat subtitle and
its reported mode badge. Target/measurement values remain supplied by the home.

The compact setting uses three native grid columns. Its label spans the row
above the number and controls, with no overlay covering interactive buttons.
The room reading follows in its own row; its fractional digits and unit scale
match the latest reference. Typography and circular 44–104px controls respond to
both card dimensions, with wider relative spacing on phones. Feedback receives a
separate flow row. Existing mode materials, limits, permissions, saved layout and
small-card full view are retained. There are no new runtime measuring loops or
animations.

Validation on 2 November 2026:

- Production TypeScript/Vite build, frontend TypeScript lint, reference-test
  TypeScript, changed-file Prettier and git diff --check passed. Existing Vite
  chunk-size advisory remains.
- **244 frontend unit cases passed.**
- **28 selected desktop/mobile browser scenarios passed against the final
  extracted archive.** The updated reference check verifies 778×478, 400×230,
  778×230, 400×490, 282×270 and 348×270 cards; centered setpoint/side controls;
  a separate bottom reading; header/badge separation; real setpoint changes after
  resizing; and working controls in the full view of a deliberately tiny card.
- Regression coverage includes cooling/modes, unknown readings and unavailable
  controls, previews/custom images, Home styles, responsive categories, card
  editing and volume/weather behavior. Commands use isolated demo fixtures.
- Large light/dark cards and phone variants were visually checked against the
  latest image. These are Chromium results, not physical wall-panel validation.
- Packaging check passed. All **263 runtime files** match the extracted archive
  used by browser tests. No backend code changed; earlier repository-wide
  limitations below remain applicable.

---

# Thermostat reference layout at every card size — release 1.36.88

The thermostat card now follows the supplied close-up: the device/room header and
mode badge share a real header row; current temperature sits left of a fine
separator; the target label, large temperature and circular controls share one
framed setting panel. Typography, spacing and 44–80px buttons scale with both
card dimensions. Large cards no longer retain the old 460px internal width cap.
The reference proportions are reproduced at 778×490 without hardcoding its
example name, room or temperatures into the application.

The card uses a bounded CSS size container, with the former nested compact
inline-size container removed from this presentation so widths are measured from
the whole card. The setting wrapper is display:contents in other presentations.
Superseded thermostat rules were removed from referenceCards.css and consolidated
in thermostatCard.css. Mode materials, capability limits, permissions, command
handling and existing saved layout dimensions remain intact. Very small saved
cards still offer the full view. No animation or runtime sizing loop was added.

Validation on 1 November 2026:

- Production TypeScript/Vite build, frontend TypeScript lint, reference-test
  TypeScript, changed-file Prettier and git diff --check passed. Existing Vite
  chunk-size advisory remains.
- **244 frontend unit cases passed.**
- **28 selected desktop/mobile browser scenarios passed against the final
  extracted archive.** New reference coverage verifies 778×490, 400×230,
  778×230, 400×490, 282×270 and 348×270 cards; header/badge separation; framed
  target proportions; circular controls; temperature steps after resizing; and
  working full-view controls for a deliberately undersized card.
- Existing coverage checks cooling/idle/modes, unknown/offline readings,
  disabled controls, actual demo commands, previews, custom pictures, Home styles,
  responsive categories, small-card overflow handling and card editing. Browser
  commands use isolated demo fixtures and do not operate real equipment.
- Reference-size light/dark cards and phone variants were visually inspected.
  These are Chromium test results, not physical wall-panel validation.
- Packaging check passed; all **263 runtime files** match the extracted archive
  used by browser tests. No backend code changed. Prior repository-wide
  limitations documented below remain applicable.

---

# Simple volume, climate mode materials and weather scenes — release 1.36.87

Harmoni media cards now use an unboxed speaker icon and a 3px range track with a
10px circular thumb. The input retains a 44px-high pointer/touch area. Mute and
keyboard control remain available; the hidden percentage is exposed through
aria-valuetext, with an explicit unknown-volume label for missing/unavailable
readings. Players without a volume slider retain their read-only volume output.

Thermostats have genuinely circular 44×44px plus/minus buttons. Cool mode and
reported automatic cooling use a blue card material and matching pale-blue
controls. Heat retains the warm material; off/unknown/unavailable use a neutral
material. Shared mode icons identify heat, cool, auto, combined heat/cool, dry,
fan and off. Selected mode and reported heating/cooling remain separate, so an
idle thermostat in cool mode is blue without falsely claiming active cooling.
Capability/step limits and command guards are unchanged. Calendar cards now use
an ochre-gold material distinct from orange heating cards.

Six local WebP weather scenes add rain, thunder/lightning, fog, snow, wind and
partly cloudy daylight, for nine scene files overall. Selection follows reported
weather; partly cloudy day/night remains state-driven. Hail, sleet and unsupported
conditions retain the appropriate artwork, rather than showing an inaccurate
photo. Custom images, No image, missing data and image-load fallback are preserved.
Only the selected scene loads. No new animation or live filter is introduced.
[Asset paths, generation tool and exact prompts](REFERENCE_CARD_ASSETS.md) are
recorded with the assets. The photographs are decorative scenic illustrations.

Validation on 1 November 2026:

- Production TypeScript/Vite build, frontend TypeScript lint, changed-file
  Prettier, reference-test TypeScript and git diff --check passed. The existing
  Vite chunk-size advisory remains.
- **244 frontend unit cases passed.**
- **80 distinct selected desktop/mobile browser scenarios passed against the
  final extracted archive**, across the full regression and focused reference
  runs. New coverage exercises keyboard volume/mute, unknown volume, seven mode
  indications, cooling versus idle, circular button dimensions (allowing browser
  subpixel rounding), new image responses, mixed/unknown weather fallbacks and
  retained custom image choices. All commands use isolated demo fixtures.
- Existing regression coverage includes all Home styles/categories, all nine
  palettes in both themes, 320/390/834/1440 widths, saved layout editing and
  drag/resize, room grouping, recorder history/graphs, actual light color,
  unavailable states, keyboard/touch inspection, and reduced/paused motion.
  Existing text/chart contrast thresholds remain 4.5:1 and 3:1.
- New controls, cooling material and rain/thunder/fog card compositions were
  visually inspected on desktop/mobile. These are Chromium results, not physical
  wall-panel validation. The lightweight ribbon background is unchanged.
- Packaging check passed. All **263 runtime files** match the final extracted
  archive under test. No backend code changed; prior repository-wide limitations
  recorded below remain applicable.

---

# Reference-matched card materials and controls — release 1.36.86

The November reference now guides all twelve overview card families: photographic
weather, charcoal clocks, deep-plum routines with green run controls, terracotta
calendar, mint presence and robots, beige white-light cards, wine-red media, warm
orange thermostats, charcoal energy, blue temperature and violet humidity.
Existing RGB lights still follow the confirmed light color. The materials use
static gradients and local WebP assets; the optimized background from 1.36.85 is
unchanged. [Generated asset paths and exact prompts](REFERENCE_CARD_ASSETS.md) are
recorded separately. Weather photographs are decorative, not live camera feeds.

Overview desktop rows are more compact (108px, with two-row default cards), with
14px gaps and consistent heading/inset proportions. Mobile retains 128px rows so
ordinary device cards keep their touch controls directly accessible. Saved card
positions/sizes, room grouping, editing, drag/resize, previews and full views are
preserved. Inset presence rows use dark text on mint to retain readable contrast.

Compact thermostats show measured and target temperatures side by side. Actual
HVAC action distinguishes heating/cooling from the configured mode; unavailable
states stay neutral. Buttons retain capability/step bounds. Media and robot
controls remain capability-driven, and routines still require confirmation.
Energy uses rounded bars, a readable numeric scale and explicit units, converting
large W readings to kW for display. Raw history and comparisons remain intact.
Metric cards now retain their type material, as in the latest reference; badges
and chart series retain the earlier history-relative consumption, temperature
assessment and humidity indication. Gaps and cumulative counters stay distinct.

Validation on 1 November 2026:

- Production TypeScript/Vite build, TypeScript lint, changed-file Prettier and
  git diff --check passed. The existing Vite chunk-size advisory remains.
- **244 frontend unit cases passed.**
- **76 selected desktop/mobile browser scenarios passed against the final
  extracted archive.** These include six new reference-card cases covering all
  twelve cards without overflow, light/dark screenshots, thermometer steps,
  playback, robot actions, routine confirmation, unavailable states and weather
  image-failure fallback. All actions use isolated demo fixtures.
- Regression coverage includes all Home tabs/styles, nine palettes, responsive
  layouts at 320/390/834/1440px (and 1555px for the reference composition), actual
  RGB/white lighting, room grouping, saved layout editing, conflicts, picture/icon
  customization, multi-source graphs, recorder history, counters, Fahrenheit,
  keyboard/touch chart inspection, motion preferences and the unchanged ribbons.
  Text/chart contrast checks retain their 4.5:1/3:1 thresholds. Related dark
  material separation is measured from the primary material color.
- Desktop and mobile compositions were visually inspected in both themes. These
  are Chromium test-environment results, not physical wall-panel validation.
- Deterministic packaging check passes. All **257 runtime files** match the final
  extracted archive used by the browser tests. No backend code changed; prior
  repository-wide limitations recorded below remain applicable.

---

# Bounded, pre-softened ribbons with independent sizing — release 1.36.85

The animated background uses three bounded HTML surfaces with pre-rendered alpha
masks, replacing three large SVGs, six SVG blur filters and nested motion wrappers.
Each 960×216 lossless WebP mask contains one distinct soft ribbon (43,964 bytes in
total). The live CSS gradient supplies the palette colors, so masks do not freeze
the theme. scripts/render_atmosphere.py reproduces them with Pillow; Pillow is a
developer-only tool and is not added to the application runtime.

There is one transform animation per ribbon, with independent geometry, size
keyframes, phase and 19/29/37-second duration. Height changes by more than 2:1 per
ribbon, with independent width variation. Different ribbons can grow and shrink
at the same time. Quarter-cycle steps (114/174/222) give all three animations an
aligned 24 Hz change cadence without a JavaScript timer or animation loop. Other
UI rendering is not capped. Opacity and color gradients do not animate.

Layer heights are capped at 360 CSS pixels (250 on mobile), and offscreen width
is reduced. The old full-screen group opacity is replaced with fixed per-ribbon
opacity, avoiding an extra overlapping group surface. Promotion is limited to
these three known animation layers while moving. Existing Still preference,
hidden-tab pause, reduced motion, inert background, theme palettes, login and
forced-colors/print behavior remain. Mask URLs resolve under document.baseURI for
ingress, like the existing local image assets.

Before/after Chromium evidence on 1 November 2026:

| Isolated background, 4-second trace, 4× CPU throttling | 1.36.84 | 1.36.85 |
| --- | ---: | ---: |
| Desktop background layer area, CSS pixels | 3,835,728 | 1,820,700 |
| Mobile background layer area, CSS pixels | 1,203,930 | 483,000 |
| Desktop DrawLayers.FrameViewerTracing operations | 242 | 97 |
| Mobile DrawLayers.FrameViewerTracing operations | 241 | 97 |

This is about 53%/60% less layer area and 60% fewer background draw operations.
The same RAF measurement probe ran in both captures, so overall callback/frame
frequency staying near 60 Hz does not imply the background still draws at 60 Hz.
The isolated trace removes other interface animations to measure the backdrop;
these numbers do not represent a 60% reduction in whole-browser CPU or VRAM.
The mask candidate was also compared with continuous motion before choosing the
24 Hz cadence. A separate normal full-UI probe retained approximately 16.7 ms
median/95th-percentile frame intervals on desktop/mobile. These are controlled
Chromium measurements, not a physical low-end panel or every browser.

Validation:

- Production TypeScript/Vite build, TypeScript lint, changed-file Prettier, targeted
  Ruff check/format and git diff --check passed; existing Vite size advisory remains.
- **244 frontend unit cases passed.** Mask regeneration is byte-identical.
- **4 desktop/mobile background scenarios passed against the final extracted
  archive**, covering all main destinations/Home tabs, three Home styles, nine
  palettes, light/dark, 320/390/834/1440 widths, login, mask asset responses,
  no SVG/canvas/runtime filters, three animation layers, >2:1 independent height
  envelopes, independent growth/contraction, bounded dimensions, 24 Hz change
  cadence, pause/persistence/hidden-tab behavior, reduced motion and forced colors.
- Light/dark desktop/mobile compositions at multiple phases were visually checked.
  Packaging check passes and all **253 runtime files** match the extracted archive.
  No backend code or real device actions changed. Prior repository limitations
  below remain applicable.

---

# Independent ribbon currents — release 1.36.84

The spectrum background now combines two independent CSS motion layers per color.
The outer layers drift and breathe over 34/43/51 seconds. Inner currents vary
shear, scale, position and opacity over 19/23/29 seconds, with different initial
phases and directions. This changes the visible rise/fall and crossing of the
ribbons rather than moving every fold together. Existing vector paths, diffuse
edges, theme colors and overall background opacity remain unchanged. Only
transform and opacity animate; there is no application requestAnimationFrame loop.

Both layers pause with the existing Still preference and document visibility.
Reduced motion removes all six animations and keeps a static composition. Login
uses the same embedded behavior, and the background remains inert and behind the
interactive interface. No card layout or device behavior changed.

Validation on 1 November 2026:

- Production TypeScript/Vite build, TypeScript lint, changed-file Prettier and
  git diff --check passed. Existing Vite chunk-size advisory remains.
- **244 frontend unit cases passed.**
- **4 desktop/mobile background scenarios passed against the final extracted
  archive.** Coverage includes all main destinations and Home tabs, all three Home
  styles, all nine palettes/both themes, 320/390/834/1440 widths, existing controls,
  saved Still preference, hidden-tab pause, reduced motion, forced colors and print.
  The tests also sample a full active animation iteration and verify independent
  swell, shear, opacity, amplitude variation and pause of all inner currents.
- Desktop/mobile compositions at 0/6/12 seconds and both themes were visually
  inspected. A separate 2.2-second Chromium probe recorded 132/133 intervals on
  desktop/mobile: median and 95th percentile 16.7 ms on both. Script time was
  2.22/1.80 ms and layout time 0.021/0 ms. This is test-environment evidence,
  not physical wall-panel validation. The compiled bundle is identical in the
  preview and final extracted archive.
- Deterministic packaging check passed; all **250 runtime files** match the
  extracted archive. Demo tests did not control real equipment. Prior repository
  limitations documented below remain applicable.

---

# Breathing waves, softer category surfaces and hourly energy bars — release 1.36.83

The existing three CSS-only spectrum layers now change width and height at
several phases of their slow 46/57/63-second cycles. Their tapered SVG ribbons,
soft edges, palette colors, single persistent background, pause setting,
visibility pause, reduced-motion and forced-colors behavior remain.

Presence, vacuum and other fresh-family cards use a lighter mint gradient with
dark foreground and darker series colors. Ordinary white/off/unknown lights use
pale beige with a slightly warmer gradient endpoint; active RGB lights retain the
exact confirmed reported RGB. Clock designs have a separate grey material in both
themes. Saved cards, builders and expanded views share these tokens. Existing
security blue, media wine and miscellaneous bronze remain distinct.

A shared decorative weather illustration combines the bundled realistic cloud
cutout with shaded native SVG sun/moon, precipitation, fog, wind and storm details.
All 15 supported weather states are represented; unknown/unavailable states use
an unknown symbol. Partly cloudy current weather uses explicit is_daytime when
provided, otherwise cached home-sky solar altitude when available. Missing solar
data does not invent a sun or moon. Daily forecast illustrations represent the
daytime forecast. No remote image provider or new image-generation dependency is
required. Existing numeric weather readings and forecasts remain their own data.

Harmoni energy metric cards now show rounded hourly columns on a neutral plotting
surface. Instantaneous power is averaged by known recorder duration; a null state
ends the preceding known interval. Completed-hour energy changes remain totals,
not averages or cumulative readings. Up to 24 clock-hour columns are shown, with
a partial ongoing hour explicitly identified; a partial starting hour outside
those 24 slots is omitted. Counter-only fallback and histories without window
metadata retain their existing curve. Null columns stay empty, known zero is
shown at the baseline, negative power uses a blue export column, and negative
counter changes remain unclassified. The current card reading stays separate
from the historical hourly values. Pointer, touch and keyboard inspection report
actual interval, value, unit and incomplete coverage. The measured peak is labeled.

Columns and current-card status share the source's time-weighted consumption
quartiles. The lower quartile belongs to low when the range is varied; a flat
baseline stays medium (apart from zero). Missing completed-hour records are not
extended across gaps when calculating the baseline. At least two hours of known
nonnegative consumption are still required. Colors are also explained by labels.
Light/dark plotting colors retain at least 3:1 bar-to-plot contrast.

Validation on 1 November 2026:

- Production TypeScript/Vite build, TypeScript lint, changed-file Prettier and
  git diff --check passed; the existing Vite chunk-size advisory remains.
- **244 frontend unit cases passed**, including time-weighted hourly averages,
  null/partial/zero intervals, export and counter resets, completed-hour changes,
  bounded time windows, source immutability, classification boundaries and hourly
  coverage gaps. Existing RGB-gamut and humidity contrast tests remain green.
- **70 desktop/mobile scenarios passed** against the extracted release archive:
  all weather states, day/night and unavailable artwork; all nine palettes/both
  themes with readable surfaces and distinct families; RGB changes; grey time
  designs; background amplitude variation, route persistence, pause/reduced motion;
  existing grids, grouping, editing/drag/resize, chart inspection and device/media
  controls. Energy bars have at least 3:1 plotting contrast, preserve gaps and
  unit/counter semantics, and support keyboard and touch selection.
- Visual review then corrected a small energy-legend overhang with scoped CSS:
  reserved tooltip height, plot minimum height and energy-card vertical padding.
  All **8 affected metric scenarios passed again against the final extracted
  archive**, including an explicit check that the legend/axis stay in the plot.
  The final bundle differs from the broad-run archive only by this CSS change.
- A separate 2.2-second Chromium probe on the final archive recorded 133 frame
  intervals per viewport: desktop 1440×1050 median/95th percentile 16.7/16.7 ms,
  script 2.25 ms and layout 0.021 ms; mobile 390×844 DPR 3 median/95th percentile
  16.7/16.8 ms, script 2.17 ms and layout 0.017 ms. This is test-environment
  evidence, not physical wall-panel validation.
- Grey clock designs, pale beige lighting, mint presence/vacuum surfaces, realistic
  weather variants and the energy plot were visually inspected on desktop/mobile.
- Packaging is deterministic; all **250 runtime files** match the extracted
  archive used for browser testing. No backend code changed. Tests use isolated
  demo/recorder fixtures; no real home equipment was controlled. Existing broader
  repository limitations in prior entries continue to apply.

---

# Metric history, value-aware surfaces and photo-header pills — release 1.36.82

RGB ribbons retain their geometry and slow transform-only motion, with softer
edges, a wider diffused glow and lower opacity. Photo-header pills have colored
icon plates, inset highlights, deeper shadows, clearer readings and hover/focus
feedback. Short neutral status copy avoids unnecessarily tall summaries. Existing
actions, alert counts, keyboard focus, reduced motion and shared banner heights
remain. No additional source or device commands are introduced by the design.

Power metric cards now prefer recorder state history and fall back to hourly
statistics only when recorder readings are empty/unavailable. Values and graph
units are normalized, including W/kW and Celsius/Fahrenheit. Initial known state
is anchored at the requested window boundary; invalid points remain gaps.
Energy counters prefer recorded hourly changes in kWh, with an explicit latest
completed-hour reading. A raw-counter fallback is labelled Meter total and stays
unclassified rather than comparing an accumulated total as consumption.

The user selected comparison with the home's own history. Consumption colors use
time-weighted 25th/75th percentiles from this source's last recorded day, requiring
at least two hours of known, nonnegative intervals. Low is green, middle yellow,
high red, and missing basis grey. Zero remains a valid reading. Negative power
is labelled export; negative counter changes are not classified as power export.
Null/negative intervals are excluded from consumption coverage. Color is also
expressed by a text badge and explanatory description. Temperature uses blue below
18°C, green through 24°C, yellow above 24°C and below 27°C, and red from 27°C;
Fahrenheit is converted for classification. Relative humidity varies continuously
from nearly white at 0% to deep blue at 100%. Foreground is chosen for contrast.
Measurement cards, editor previews and expanded views use the same component.
Classic/Living keep their existing material, while sharing the corrected history.

Thermostat recorder requests retain full attributes and all updates, read actual
current_temperature and use last_updated before last_changed. This preserves
temperature changes while HVAC mode is unchanged. Invalid, boolean/nonfinite and
unavailable readings remain null. The response only exposes measured value/state/
time and the configured temperature unit, not the recorder attributes. Existing
read authentication, entity lookup, allowed periods and offline errors remain.

Validation on 1 November 2026:

- Production TypeScript/Vite build, frontend TypeScript lint, changed-file Prettier,
  targeted Ruff check and `git diff --check`: passed. Existing Vite size advisory
  remains. **238 frontend unit cases passed**, including recorder/statistics
  fallbacks, unit conversion, source identity, counter totals, weighted durations,
  gaps/coverage, export/reset handling, temperature bands, valid zero humidity and
  contrast throughout all 101 integer humidity levels.
- **16 related backend cases passed**. The two new thermostat scenarios cover C/F,
  full-attribute query parameters, measured attributes, unchanged-mode timestamps,
  missing/invalid/zero values, gaps, authentication, lookup and disconnection. They
  also pass with the module imported directly from the final extracted archive.
- **68 distinct desktop/mobile scenarios verified across the broad run and focused
  rerun**. The broad run passed 65; three fixtures were adjusted for both history
  sources and the existing 30-second availability grace period. All 10 repeated
  history/metric scenarios then passed against the final archive. Its compiled
  frontend is byte-identical to the broad-run bundle; only the backend thermostat
  timestamp correction differs and has extracted-module verification above.
  Coverage includes real recorder curves/gaps, fallback units, counters versus
  hourly consumption, level changes, humidity progression, header navigation/fit,
  disconnection, existing grids/room grouping, graph inspection, RGB light colors,
  clock/sky cards, palettes, reduced motion and Classic/Living/media/energy charts.
- A 2.2-second Chromium probe observed 133 intervals per viewport: desktop
  1440×1050 median/95th percentile 16.7 ms, script 1.84 ms, layout 0.019 ms;
  mobile 390×844 DPR 3 median 16.7 ms, 95th percentile 16.8 ms, script 2.24 ms,
  layout 0.021 ms. This is test-environment evidence, not physical panel validation.
- Desktop/mobile pills, metric cards and softened ribbons were visually inspected.
  Packaging check passes and all **250 runtime files** match the final archive.
  Tests use isolated demo/recorder fixtures; no real home equipment was controlled.
  Existing broader repository limitations below continue to apply.

---

# Flowing spectrum ribbons and source-aware card colors — release 1.36.81

The user supplied a new reference of translucent rainbow ribbons on a dark field.
The shared background now uses tapered native SVG ribbons, spectrum gradients,
transparent folds, fine colored edges and a small soft glow. The broad DNA helix
and crosslinks are replaced. Three existing transform layers retain their slow
46/57/63-second cycles. Light mode uses the same ribbons on its light base; dark
mode has stronger ribbon opacity. No per-frame JavaScript, audio input, external
asset/service or new dependency is used. Login remains a single embedded
composition. Pause, hidden-document pause, reduced motion, forced colors, print,
inert decoration and click-through navigation retain their existing behavior.

Security retains its blue surface. Media players and the media widget have a
separate deep wine surface. Ordinary switches, sockets, shades and system summary
cards use warm bronze/graphite; garage/gate/door covers retain security blue.
Scenes/routines, clocks/sky, heating and air/cleaning keep their respective colors.
Classification uses actual domains/classes and stable widget IDs, not titles.

Lighting defaults to warm yellow. Available, on lights in color modes use their
exact valid reported RGB, without accent mixing or dark-theme dimming. HA-derived
RGB for HS/XY color modes is accepted. Explicit white/color-temperature modes
ignore retained RGB values. Invalid/achromatic, off, unavailable or disconnected
sources use yellow. A group follows a common real color only when all available
on lights agree; mixed colors or whites use yellow rather than a fabricated RGB
average. Foreground and inset surfaces adapt to RGB luminance. This read-only
presentation is shared by grid cards, editing previews and expanded cards and
reacts to confirmed source changes. No user layout or device API is changed.

Validation on 1 November 2026:

- Production TypeScript/Vite build, frontend TypeScript lint, changed-file Prettier
  and `git diff --check`: passed. The existing Vite chunk-size advisory remains.
  Frontend unit suite: **221 passed**. Six added light-surface cases cover exact
  RGB, derived color modes, stale white-mode RGB, invalid values, connectivity,
  grouping, edited sources and immutable inputs; text contrast is sampled at 729
  RGB combinations including the black/white crossover. Type tests distinguish
  media, ordinary switches/shades and security garage/gate/door covers.
- Final extracted archive: **60 desktop/mobile browser scenarios passed**. Seven
  category surfaces remain perceptually distinct across all nine palettes and
  both themes, with sampled text contrast of 4.5:1 and graph strokes of 3:1.
  Added RGB scenarios verify confirmed live color changes, exact red/blue/yellow/
  turquoise across themes, white-mode stale RGB and off-state yellow, palette
  independence, actual UI resize/save, expanded color and editor preview. Existing
  photo headers, room grouping, controls, grid motion, graphs, clock/sky, global
  background navigation/pause/reduced motion and Classic/Living/media/energy
  regressions pass. Full-view testing resizes via the real UI and waits for save.
- A 2.2-second headless Chromium probe without concurrent browser tests observed
  133 intervals on each viewport: desktop 1440×1050 median 16.7 ms, 95th percentile
  16.8 ms, script 1.62 ms, layout 0.016 ms; mobile 390×844 DPR 3 median/95th
  percentile 16.7 ms, script 1.04 ms, layout 0.018 ms. These are test-environment
  observations, not physical wall-panel performance guarantees.
- Light/dark desktop/mobile ribbon and card compositions were visually inspected.
  All **250 runtime files** match the extracted manifest; packaging check passes.
  Browser checks use isolated demo sources, including intercepted color commands;
  no real home devices were controlled. Broader existing limitations below apply.

---

# Stronger card colors and diffuse RGB helix — release 1.36.80

Harmoni's cards have saturated type surfaces with soft gradients and light text,
following the user's Homey references. Lighting has its own rose-to-violet family;
heating/calendar/daylight use orange, air/presence/cleaning green-to-teal, energy/
security/clocks blue, and media/routines/Moon deep plum. Unknown sources and mixed
graphs remain neutral. A small accent mix follows the selected palette, and dark
mode deepens the same colors. Borders, inset controls, focus, readings and secondary
text adapt locally to the colored surface, including native controls. Saved
layouts, pictures and real state warnings remain intact. Editing previews and
expanded cards use the same material. Measured graph series use lighter local
colors, with their original colors as fallbacks outside these cards; values,
curve geometry, gaps, units and source visibility are unchanged.

The shared RGB atmosphere now uses opposing continuous waves with soft crosslinks,
forming a diffuse DNA-like double helix. More visible color envelopes and softly
defined strands move in three independently phased layers. SVG geometry and
gradients remain static: the existing 46/57/63-second transform cycles animate the
containing layers. User-space gradients also render the vertical crosslinks.
There is no per-frame production JavaScript, new dependency or backend change.
The global background remains inert and behind the UI, with one embedded login
composition. Still, document-visibility pause, reduced motion, forced colors and
print behavior are preserved.

Validation on 1 November 2026:

- Production TypeScript/Vite build, frontend TypeScript lint, changed-file
  Prettier and `git diff --check`: passed. The existing Vite chunk-size advisory
  remains. Frontend unit suite: **215 passed**.
- Final extracted archive: **58 desktop/mobile browser scenarios passed**. All
  five families have at least 0.05 sampled OKLab separation across all nine
  palettes and both themes. Sampled primary/secondary/legend text meets 4.5:1
  against both gradient ends; measured graph strokes meet 3:1. Editing, previews,
  picture preservation, reload, expanded cards and unchanged saved layouts pass.
  Existing room grouping, drag/resize/compaction, controls, graph sources/gaps/
  inspection, clock/sky cards, headers, global RGB navigation, pause/reduced motion,
  Classic/Living and multimedia/energy chart checks pass.
- A 2.2-second headless Chromium probe without concurrent browser tests observed
  desktop 1440×1050: 133 intervals, median 16.7 ms, 95th percentile 16.8 ms,
  script 1.93 ms, layout 0 ms. Mobile 390×844 at DPR 3: 133 intervals,
  median 16.7 ms, 95th percentile 16.8 ms, script 1.19 ms, layout 0.017 ms. These
  are test environment observations, not physical wall-panel performance guarantees.
- Light/dark card compositions and the isolated helix were visually inspected
  at desktop and mobile sizes. All **250 runtime files** match the extracted
  archive manifest; `scripts/package.py --check` passes. Checks use isolated demo
  data; no real home devices were controlled. Existing broader limitations below
  still apply.

---

# Recognizable card type surfaces — release 1.36.79

Harmoni's personal cards use four restrained color families: warm sand for lights,
heating/daylight/calendar; sage for air, presence/rooms and cleaning; blue-grey for
energy, security/system and clocks/horizon; plum for media, routines/scenes and the
Moon. Unknown sources and mixed-category graphs remain neutral. Classification uses
actual control domains, device classes and units, configured ambient type and stable
built-in widget IDs. Translated or personal titles, live state and availability do
not decide the color. Multiple comparable sources retain their shared type color.

A shared presentation helper supplies `data-card-tone` to the card surface, builder
preview and expanded view. Scoped OKLab material tokens mix each family with the
selected palette and light/dark surface. Secondary text contrast, quiet inset
controls and borders adapt with it. Existing weather artwork, gallery backgrounds,
media imagery, shadows, focus/status colors and controls remain. Geometry and saved
configuration are unchanged; no schema, API, device command or animation was added.
Classic/Living and Energy's separate workspace retain their existing surfaces.

Validation on 1 November 2026:

- Production TypeScript/Vite build, frontend TypeScript lint, changed-file Prettier
  and `git diff --check`: passed. Vite retains its existing bundle-size advisory.
- Frontend unit suite: **215 passed**. Five new cases cover stable widget IDs,
  actual domain/class/unit metadata, all clock/sky designs, edited sources,
  comparable/mixed/missing graph sources, unchanged state/availability behavior and
  immutable configuration.
- Extracted archive: **58 desktop/mobile browser scenarios passed**. Four new
  scenarios check all four families on overview cards, all nine palettes in both
  themes, sampled title/secondary text contrast of at least 4.5:1, no horizontal
  overflow or saved-layout changes, type changes in editing and live preview,
  gallery picture preservation, reload and the expanded graph view. Existing
  grouping, grids, headers, controls, graphs, clock/sky cards, RGB atmosphere,
  reduced motion, Classic/Living and multimedia/energy chart regressions pass.
- Light/dark desktop/mobile color compositions were visually inspected. All
  **250 runtime files** match the manifest; `scripts/package.py --check` passes.
  Browser checks use the extracted backend/frontend and isolated demo fixtures;
  no real home devices were controlled. Existing broader repository limitations
  below still apply.

The preceding 1.36.78 factory serial feature was also deployed to the live central
portal after the user restored SSH access. Its private backup, isolated database
migration check, image revision, public HTTPS/code/authorization checks and rollback
are recorded in REMOTE_ACCESS.md. No live hub or serial was created for that check.

---

# Shared animated RGB atmosphere — release 1.36.77

A shared fixed background adds three broad, softly diffused RGB wave envelopes to
all application destinations, including login, across Classic, Living and Harmoni.
Muted red/green/blue colors mix with the selected palette's accent; dark mode has
lower opacity. Layers drift at different phases over 46/57/63-second alternating
cycles. Only transform is animated. Native SVG paths, gradients and softening stay
static; no per-frame JavaScript, audio input, new dependency or external service.
The application root isolates stacking so the background stays behind content.
Login uses an embedded layer above its photograph and below text, while the global
layer is hidden there. Cards, header photographs, warnings and dialogs retain
their existing surfaces and controls. Clipped, fixed layers add no scrollable area.

Theme and appearance includes Background motion: Gentle RGB waves (default) or
Still. The existing safe browser preference helpers persist this device choice.
Still pauses the current composition rather than clearing it. Document visibility
pauses hidden pages and resumes the same motion phase. The OS reduced-motion query
disables all background animation and retains a static composition. Forced colors
and print hide the decoration. All layers are inert, aria-hidden and ignore pointer
events. No account, layout, device, backend or schema changes.

Validation on 1 November 2026:

- Production TypeScript/Vite build, frontend TypeScript lint, changed-file Prettier
  and `git diff --check`: passed. Vite retains its existing bundle-size advisory.
- Frontend unit suite: **210 passed**. No backend code changed in this release.
- Extracted release archive: **54 desktop/mobile browser scenarios passed**.
  Four new scenarios verify login, all 11 main destinations and seven Home tabs,
  one persistent background across navigation, actual motion, all nine palettes,
  all three Home styles, both themes, viewport coverage without horizontal overflow
  at 320/390/834/1440 px, click-through navigation and no commands. They also check
  the motion setting, persistence after reload, visibility pause/resume, live
  reduced-motion changes, forced colors and print. Existing clock/sky cards,
  headers, editable grids, room grouping, card editing, graphs, device controls,
  Living and multimedia/energy chart regressions remain covered.
  Navigation fixtures explicitly select Advanced for administrative destinations;
  graph keyboard checks wait for save to leave the inert editing state.
- A 2.2-second headless Chromium probe at 1440×1000 observed 133 frame intervals:
  median 16.7 ms, 95th percentile 16.8 ms; 2.5 ms script and 0.38 ms layout time
  during the probe. This checks this desktop test environment, not physical wall
  tablet hardware. Production animation uses no JavaScript frame loop.
- Light/dark desktop/mobile appearances and the isolated wave composition were
  visually inspected. All **250 runtime files** match the manifest;
  `scripts/package.py --check` passes. Browser checks use the extracted backend
  and compiled frontend with isolated demo data. No real home devices were
  controlled. Broader repository limitations below still apply.

---

# Clock, horizon and sky cards — release 1.36.76

The card builder has a new Clock and sky category with seven graphical choices:
digital, analog and orbital clocks; a wide horizon; daylight; moon phase; and
date/week. Clock style, 12/24-hour format and seconds are editable alongside the
existing title, icon and gallery image. The existing account/page layout saves
source-less card configuration with the same strict validation, revisions and
permissions. Ambient cards belong to Shared across the home on grouped pages.
They do not issue device commands. Existing defaults are unchanged.

Clock and calendar values use the home's IANA timezone. A shared aligned timer
updates visible clocks and stops when the document is hidden. Without home
metadata, the actual panel time is explicitly labelled. Native SVG clock faces
and horizon diagrams adapt to the measured card area without internal scrolling.
The wide horizon defaults to two columns; the existing grid still controls all
saved dimensions. Light/dark themes, palettes and reduced motion remain supported.

The authenticated read-only `/api/home/sky` endpoint calculates Sun/Moon altitude,
azimuth, daily paths and rise/set events locally with pinned Astral 3.2. Raw home
coordinates/configuration stay on the server. HA configuration is read through
`get_config`, cached and refreshed on connection epoch changes. Positions refresh
once per minute; daily paths sample the actual local day, including 23/25-hour DST
days. Missing placement, failed loads, cached placement and stale calculations
are distinguished. Moon illumination is approximate and labelled accordingly.
Polar days/nights have explicit states, with no invented rise/set times. Daylight
shows the actual light window(s), including midnight crossings, and a current-time
marker. Demo calculations are explicitly labelled Oslo. No geolocation service,
browser location permission or third-party astronomy API is used.

Astronomy implementation reference: [Astral API documentation](https://sffjunkie.github.io/astral/package.html).
The cards label calculated positions and approximate illumination explicitly.

Validation on 1 November 2026:

- Production TypeScript/Vite build, frontend TypeScript lint, changed-file
  Prettier, targeted backend Ruff checks/format and `git diff --check`: passed.
  Vite retains its existing bundle-size advisory.
- Frontend unit suite: **210 passed**. New coverage includes home-zone year/date
  boundaries, ISO weeks, leap years, repeated DST hours, noon/midnight in 12-hour
  format, all seven choices, measured horizon projection, north-wrap path breaks,
  moon-disc illumination and actual daylight windows across DST/polar days.
- Relevant backend layout/card/sky suites: **71 passed**. New coverage includes
  finite equatorial positions, UTC events, local DST-day sampling, polar events,
  strict location/timezone input, source-less configuration round-trips, invalid
  clock options, authentication, restricted resident access, cached configuration,
  failed-read cooldown and absence of raw coordinates/config/secrets in responses.
- Extracted release archive: **50 desktop/mobile browser scenarios passed**.
  New scenarios add all seven designs from graphical previews, check home time
  against a different panel timezone, live seconds, clock style/format editing,
  save/reload, light/dark appearance, missing location, retry, polar night, stale
  positions, no nested scrolling, no clipping fallback at default sizes, reduced
  motion and no commands. Existing Harmoni, Living, multimedia and energy chart
  regressions remain covered. Browser astronomy fixtures are explicitly synthetic;
  real calculation behavior is checked separately by the backend tests.
- Light/dark cards and the picker were visually inspected on mobile and desktop.
  All **250 runtime files** match the manifest; `scripts/package.py --check` passes.
  Browser checks use extracted backend/frontend and isolated demo data. No real
  home devices were controlled. Broader repository limitations below still apply.

---

# Default room sections and optional free/empty layouts — release 1.36.75

Lights, Miscellaneous, Climate, Security and Multimedia default to room sections.
Assignments use the actual source entities' area IDs. Unassigned/missing sources
use No room; aggregate/cross-room sources use Shared across the home. Stable room
IDs keep sections independent of renamed labels. The renderer interleaves room
headings and cards in DOM order. Heading rows exist only in CSS presentation;
persisted rectangles retain the validated three-column geometry. Cards retain
their sizes and complete personal configuration.

Edit mode provides Group by room and Clear layout. Grouping confines moves,
resizes, touch/keyboard reordering and deletion compaction to each room. Source
changes can move a personal card to its actual new room. Disabling grouping gives
one free canvas. Clear changes only the draft; save preserves an intentionally
empty page, cancel restores it, and Default layout restores populated room groups.
Overview/simple overview and Energy keep their prior grouping behavior.

The optional strict boolean `group_by_room` is saved with items under the existing
account/page revision transaction. Legacy records need no migration and default
to room presentation on these five pages. Legacy writes that omit the option
preserve an explicitly saved choice. Authentication, CSRF, visibility checks,
geometry limits and stale-revision protection remain in force. No database schema
or device assignment changes.

Validation on 1 November 2026:

- Production TypeScript/Vite build, frontend TypeScript lint, changed-file
  formatting, targeted backend Ruff checks/format and `git diff --check`: passed.
  Vite retains its existing bundle-size advisory.
- Frontend unit suite: **204 passed**. Room model cases cover actual/unknown and
  cross-room sources, immutable metadata, mixed sizes, display-only header rows,
  responsive reflow, room-scoped moves/reordering, source changes, deletion and
  a 300-card catalog within geometry limits.
- Relevant backend layout/card suites: **45 passed**. Coverage includes strict
  grouping options, supported pages, atomic clear/save, legacy preservation,
  stale writes, CSRF and account/page isolation.
- Extracted release archive: **46 desktop/mobile browser scenarios passed**
  (Harmoni, Living, multimedia and the energy chart regression). New coverage
  verifies all five default room pages, source assignment, heading/card DOM order,
  grouped resizing, save/reload, cancel after clear, free layout persistence,
  independent page preferences, saved empty pages, adding back a card and default
  restoration. Existing pointer/touch dragging, grouped deletion compaction,
  device controls, headers, graphs, card editing, motion and reduced motion pass.
- Light/dark room layouts and mobile/desktop editing controls were inspected.
  All **249 runtime files** match the manifest; `scripts/package.py --check` passes.
  Browser checks use extracted backend/frontend and isolated demo data. No real
  home devices were controlled. Broader repository limitations below still apply.

---

# Close dashboard gaps after deletion — release 1.36.74

Removing a card now repacks the remaining rectangles in visual reading order,
using the existing first-fit grid placement. Sizes and complete personal card
configuration are preserved; no input or saved layout is mutated. The shared
HomeGrid handler covers all personal dashboard pages, including simple Home.
Existing FLIP transitions animate the new positions. Save persists the compacted
layout atomically with deletion; cancel restores the previous layout. Energy's
separate workspace and the backend/schema are unchanged.

Validation on 1 November 2026:

- Production TypeScript/Vite build, frontend TypeScript lint, changed-file
  formatting and `git diff --check`: passed. Vite retains its bundle-size advisory.
- Frontend unit suite: **197 passed**. Added cases cover deleting first/middle/last
  cards, gaps across columns/rows, mixed rectangle sizes, visual order, complete
  configuration preservation, immutable inputs, responsive reflow, final-card
  removal and unknown-card no-ops.
- **16 desktop/mobile browser scenarios passed against the extracted archive**.
  All six category pages verify compaction after removal. A mixed-size fixture
  verifies actual intermediate movement, cancellation, retained dimensions and
  configuration, saving/reloading and no device commands. Existing dragging,
  resizing, card editing, simple mode, wiggle pauses, reduced motion, no nested
  scrolling and equal header heights remain covered.
- All **249 runtime files** match the manifest; `scripts/package.py --check` passes.
  Browser checks use the extracted backend and compiled frontend with isolated
  demo data. No real home devices were controlled. The broader repository
  limitations below still apply.

---

# Standard red alert in Home's upper-left corner — release 1.36.73

Harmoni's overview and simple Home headers use the existing standard-theme
warning button, including its round 52 px shape, red outline/icon and red count
badge. The alert sits in the upper-left corner of the photo. Conditional heading
spacing prevents overlap while preserving equal banner heights. The existing
actual alert count, dialog, focus restoration and reduced-motion pulse remain.
This is a CSS-only production change; no alert logic, backend or schema changed.

Validation on 1 November 2026:

- Production TypeScript/Vite build, frontend TypeScript lint, changed-file
  formatting and `git diff --check`: passed. Vite retains its bundle-size advisory.
- **10 desktop/mobile browser scenarios passed against the extracted release
  archive**: standard-theme warning style parity, upper-left positioning at
  320/390/834/1440 px, no overlap with the greeting, actual count/dialog and focus,
  dark theme, simple mode, reduced motion, status pills inside headers, equal
  banner heights, and the existing Living style.
- Header screenshots were inspected on desktop and mobile. All **249 runtime
  files** match the manifest; `scripts/package.py --check` passes. No home devices
  were controlled. The prior 194 unit tests are unchanged; the broader repository
  limitations below still apply.

---

# Card depth, edit wiggle and refined charts — release 1.36.72

Harmoni's cards use layered light/dark shadows and a subtle top highlight. In edit
mode, idle card surfaces rotate gently with a deterministic phase and an amplitude
scaled to card size. Layout cells and handles stay still. Hover, focus, dragging,
card dialogs, hidden documents and reduced motion stop the animation. Only cards
near the viewport animate. Existing FLIP moves/resizes, overflow fallback and
account-scoped saved geometry/configuration remain intact.

A shared measured-chart renderer now serves Harmoni's measurement cards,
multi-source graphs and numeric device/history explorer curves. Shape-preserving
cubic curves pass through measured vertices without overshooting; missing,
nonfinite and invalid-time samples still break the line. Readable shared axes,
subtle guides/fill and fixed-size markers adapt to the available space. Pointer,
touch and keyboard inspection reports actual stored values and their timestamps,
never interpolated readings or extrapolated source values. Source toggles,
conversion, units, permissions and empty/error states are preserved. The metric
heading remains a separate accessible details button so the graph can be inspected
without opening another view. State timelines keep their existing behavior.
Energy's bucket charts retain their calculations and bar semantics, with refined
guides, corners, selection and aligned price markers. No backend or schema changed.

Validation on 1 November 2026:

- Production TypeScript/Vite build, frontend TypeScript lint, formatting of changed
  frontend/test files and `git diff --check`: passed. Vite retains the existing
  bundle-size advisory.
- Frontend unit suite: **194 passed**. New coverage checks missing/invalid values,
  real zeroes, shared axes, nearest recorded samples without extrapolation and
  sampled curve bounds through peaks and flat segments. Text sensors and binary
  states retain their inspectable state timelines.
- Final extracted archive: **40 browser scenarios passed** across Chromium desktop
  and mobile (Harmoni, Living and multimedia). Two additional desktop/mobile energy
  chart checks passed. Coverage includes actual idle surface rotation, stable
  handles, focus/dialog pauses, live reduced-motion changes, dark/light shadows,
  mouse/touch/keyboard graph inspection, gaps and numeric history. Existing drag,
  resize, persistence, no-nested-scroll, card editing, headers and commands pass.
- Light/dark screenshots at 390/1440 px and single/multi-source graph screenshots
  were inspected. All **249 runtime files** match the deterministic manifest;
  `scripts/package.py --check` passes. Browser checks load the extracted backend
  and compiled frontend. No real home devices were controlled. The broader
  repository limitations recorded below still apply.

---

# Visual card picker and personal card editor — release 1.36.71

Harmoni's card picker starts with Device, Graph or Overview card. Residents can
search devices by name/room, filter by room/category and select a presentation
with an inert preview using available Home data. The editor is also reachable from
each card's pencil in layout edit mode. Personal titles, icons, bundled gallery
images and device/compact/picture/graph types are stored in that card's layout
configuration. The same entity can appear in several independent personal cards.
Shared entity names, appearance, favorites and other Home settings are untouched.

Graph cards bind up to six numeric sensor sources, with 6/24/168-hour history.
All curves use the same actual timestamp/value coordinates; W/kW, Wh/kWh and °C/°F
are normalized to a shared unit. Incompatible quantities are not plotted together.
Null/nonfinite samples and invalid times break curves. Missing, unavailable,
failed and unsupported sources have explicit states; other valid sources continue
to render. Legend controls can show/hide individual curves. Source changes and
period selection are available when editing an existing graph.

Optional, strictly bounded card configuration extends the existing versioned
layout JSON. Geometry and configuration save atomically with the same revision
check, authentication, CSRF and account/page isolation. Known forbidden source
references are rejected. Missing references remain editable and never cause
history requests for entities absent from the visible Home snapshot. Image/icon
choices are allowlisted; no arbitrary image URLs or HTML are stored. Existing
layouts need no migration. Moves, resizing, touch ordering and responsive reflow
retain each card's complete configuration; layout cancel also discards card edits.

Validation on 31 October 2026:

- Production TypeScript/Vite build, frontend TypeScript lint, changed-file
  formatting, targeted backend Ruff checks/format and `git diff --check`: passed.
  Vite retains the existing bundle-size advisory.
- Frontend unit suite: **187 passed**, including metadata preservation through
  geometry operations, unit compatibility/conversion, shared time/value axes,
  real zeroes and gaps across null, nonfinite and invalid-time readings.
- Relevant backend suites: **100 passed**. Coverage includes private configuration
  round trips, unchanged shared device/preferences data, missing sources, invalid
  options and limits, forbidden bindings, strict geometry and stale revisions.
- Final extracted archive: **36 browser scenarios passed** across Chromium desktop
  and mobile, with no retries/skips. New flows verify the picker, search, inert
  previews, personal icon/photo/type persistence, cancellation, duplicate device
  cards, adding/editing multiple graph sources, unit conversion, curve gaps,
  period changes, legend toggling and removed-source handling. Existing real layout
  persistence and concurrency checks use the new picker too. Rich graph fixtures
  isolate their personal layouts; backend tests separately cover SQLite round trips.
- Screenshots were inspected in light/dark at 390/1440 px. The prior responsive,
  header, device-command, view-only, reduced-motion and no-nested-scroll scenarios
  still pass. Controls and previews emit no unexpected device/appearance commands.
- All **249 runtime files** match the deterministic manifest. Browser checks use
  the extracted backend and compiled frontend; `scripts/package.py --check` passes.
  No real home devices were controlled. The broader repository limitations below
  still apply.

---

# Card overflow and layout motion — release 1.36.70

Harmoni card viewports no longer scroll internally. Equipment artwork fits the
available body height instead of extending beyond the controls. Unusually dense
cards and deliberately small cells offer an explicit full-card dialog. Their
preview is inert, keeping clipped controls out of keyboard navigation; a one-row
equipment card uses a compact summary. Full views retain existing permissions,
command handling and confirmations, Escape handling and native focus restoration.

Editing uses bounded FLIP transitions for moves, width/height changes, displaced
neighbors, added cards and restoring/cancelling layouts. Interrupted transitions
retarget from the currently displayed transform. Motion uses transform/opacity,
180–280 ms easing, no new dependency and no continuous animation loop. Reduced
motion disables the transitions and cancels running animations when the preference
changes. Grid geometry, persisted IDs, revisions and responsive reflow are unchanged.
No backend source or schema changed.

Validation on 31 October 2026:

- Production TypeScript/Vite build, frontend TypeScript lint, changed-file
  formatting and `git diff --check`: passed. The existing Vite bundle advisory
  remains.
- Frontend unit suite: **183 passed**.
- **32 distinct desktop/mobile browser scenarios pass against the extracted
  archive** (Harmoni, Living and multimedia). The main run passed 30; the two raw
  pointer scenarios initially sampled moving handles. They and their preceding
  persistence scenarios passed after adding explicit animation-completion waits
  before sampling pointer coordinates. No assertions were removed or disabled.
- The new browser scenario measures actual intermediate width and position,
  checks transform-only resizing, live reduced-motion cancellation, non-scrollable
  cards across all six grid pages at 390/1440 px, and full-view access/focus return
  from a one-row card. It checks that default light cards need no overflow fallback
  and that editing sends no device commands. Existing mouse/touch, saved-layout,
  device-control, header, color, theme and unavailable-state scenarios still pass.
- All **249 runtime files** match the deterministic manifest; package freshness is
  verified with `scripts/package.py --check`. The backend and compiled frontend
  used by browser checks come from that extracted archive. No real home devices
  were controlled. The broader repository limitations below still apply.

---

# Equipment card redesign — release 1.36.69

Harmoni's equipment cards now follow the supplied references: a consistent
name/room header, larger real readings, decorative product artwork, orange power
and dimming controls, RGB presets and a warm/cool scale for tunable white lights.
Manual light appearance takes precedence over automatic illustration selection.
Sockets can show a uniquely associated physical device's power/energy sensors;
ambiguous, unavailable and nonfinite readings are omitted. Cover illustrations
use actual position, with distinct blinds, rollers, curtains, awnings and garages.
Security cards distinguish contact, motion, presence, smoke and water states, and
show existing lock controls and battery data. Alarm labels are localized.

Room cards show available temperature and room-scoped lighting controls. Alerts,
batteries and connection summaries are optional additions in the card library.
Overview, media, cleaning and energy measurement surfaces share the new material;
Energy retains its existing workspace. No backend source or capabilities changed.
Existing grid IDs, saved layouts, equal-height photo headers, permissions, action
confirmations and full device dialogs are preserved.

Validation on 31 October 2026:

- Production TypeScript/Vite build, frontend TypeScript lint, formatting of changed
  frontend files and `git diff --check`: passed. Vite retains its existing bundle-size
  advisory.
- Frontend unit suite: **183 passed**. Four new cases cover manual/automatic artwork,
  bounded real readings including zero, unambiguous physical-device associations
  and actual safety conditions. No demonstration values enter production cards.
- Extracted release archive: **30 browser tests passed** across Chromium desktop
  and mobile (28 Harmoni/Living plus 2 multimedia), including the prior grid/header
  regressions.
  New coverage exercises RGB and white-temperature commands, dimming, device-specific
  cover art, real power/energy/battery readings, safety states, optional summary cards
  and working SVG fallback when a product image fails. Light/dark screenshots at
  390/1440 px were inspected; tests also check control bounds and horizontal overflow.
- All **249 runtime files** match the archive manifest. The deterministic bundle
  passes `scripts/package.py --check`; browser checks load its extracted backend
  and compiled frontend. No real household devices were controlled.
- Four transparent, locally bundled decorative WebP illustrations total about
  64 KiB. Tool, final prompts and asset paths are recorded in
  [the artwork notes](../frontend/public/home/equipment/README.md). Other artwork
  uses native SVG. Images do not identify residents' actual brands or models.

The broader repository limitations recorded below still apply.

---

# Personal card grids and equal banner heights — release 1.36.68

Harmoni now uses a shared banner height at each viewport breakpoint. Overview,
Lights, Climate, Security, Multimedia and Miscellaneous have a personal card grid
with three columns when space permits. Energy retains its existing workspace.
Simple mode has its own overview arrangement. Classic and Living keep their layouts.

Residents can enter edit mode, move cards with a mouse, touch or arrow keys, resize
in whole grid units, remove/re-add cards, restore defaults, save or cancel. The
desktop arrangement survives responsive reflow. Device controls are inert while
editing. Layouts are stored separately from favorites and other Home preferences,
scoped to the authenticated account and page. Atomic revisions reject stale saves.
Invalid rectangles, duplicates, overlaps and oversized payloads are rejected.

Validation on 31 October 2026:

- Production TypeScript/Vite build, frontend TypeScript lint, formatting for the
  changed frontend files, targeted Python Ruff checks/format and `git diff --check`:
  passed. Vite retains its existing bundle-size advisory.
- Frontend unit suite: **179 passed**, including grid collision handling, resizing,
  responsive reflow without mutation, touch ordering and maximum catalog capacity.
- Relevant backend suites: **80 passed**, including authenticated/CSRF-protected
  layout persistence, account/page isolation, read-only residents, strict geometry
  validation and concurrent-save protection.
- Extracted release archive browser suites: **28 passed** across Chromium desktop
  and mobile (Harmoni, Living and multimedia). Coverage includes the same banner
  heights across all seven tabs; 320/390/834/1440 px; light/dark themes; saved layouts
  after reload; cancellation; actual mouse dragging, snapped resizing and Chromium
  touch input; adding/removing cards on all six pages; failed/stale saves; leaving an
  unsaved edit; and no device commands during grid editing.
- The final mobile check verifies that the full-width greeting does not overlap the
  centered warning button. Existing device commands, dialogs, theme/background
  selection, reduced motion, missing history and disconnected states still pass.
- The **244 runtime files** match the deterministic archive's manifest. Browser
  checks run against the extracted backend and compiled frontend. No real home
  devices were controlled. The broader repository limitations below still apply.

---

# Status pills inside photo headers — release 1.36.67

Harmoni's existing live summaries now render inside the photo header on Overview,
Lights, Climate, Security, Multimedia and Miscellaneous. Each view renders one
interactive set, retaining the existing data, detail dialogs and navigation.
Multimedia's header spans the full content width. Classic and Living retain their
existing summary placement.

Validation on 31 October 2026:

- Production TypeScript/Vite build, frontend TypeScript lint, formatting of the
  changed frontend files and `git diff --check`: passed. The existing Vite
  bundle-size advisory remains.
- Frontend unit suite: **174 passed**.
- Final extracted release archive: **22 browser tests passed**, no skips or retries,
  across Chromium desktop and mobile (Harmoni, Living and multimedia suites).
- The new coverage verifies single rendered summaries, pills within photo bounds,
  readable foregrounds, full-width multimedia headers, working detail dialogs,
  Escape/focus restoration and no horizontal overflow at 320, 834 and 1440 px in
  light and dark themes. Existing photo/background and centered alert checks pass.
- All **244 payload files** match their manifest hashes; the deterministic archive
  passes `scripts/package.py --check`. No backend source was changed and no real
  household devices were controlled. The limitations recorded below still apply.

---

# Photo headers and backgrounds — release 1.36.66

The Harmoni follow-up adds stronger shared elevation, photo headers to all Home
categories, account-scoped background selection and bounded personal uploads.
Home name and the live date are visible above the tabs on all screen sizes.
Alerts use the existing real count and are centered in the welcome photo; their
pulse and the transition between real temperature readings respect reduced motion.
On narrow screens the alert and weather areas are kept separate.

Validation on 30 October 2026:

- Production build, TypeScript lint, Ruff checks/format for the changed Python
  files and `git diff --check`: passed.
- Frontend unit suite: **174 passed**. Temperature formatting includes localized
  negative numbers, zero, Fahrenheit and missing/nonfinite readings.
- Relevant backend suites: **69 passed**, including personal image isolation,
  authentication, CSRF, raster/size limits and preservation of other settings.
- Desktop/mobile browser suites: **20 passed** (Harmoni, Living and multimedia).
  New coverage verifies image selection, keyboard choice, upload, reload, removal,
  image headers on all categories, real count/centering with 19 fixture warnings,
  no alert/weather overlap at 320/390/834/1440 px, and reduced motion.
- Shared image selection uses the existing SQLite personal settings store. Image
  responses are authenticated, private and not cached; metadata responses do not
  include the image contents. Uploaded images are normalized to a bounded JPEG in
  the browser. The maximum server-side decoded size is 1 MB.

The repository-wide pre-existing limitations recorded for 1.36.65 below remain
separate from these passing checks. No real home devices were controlled.

---

# SMARTi Harmoni — release 1.36.65

Harmoni is an additional Home style, selectable in **Innstillinger → Tema og
utseende → Stil for Hjem**. Classic and Living are preserved. Existing device,
favorite, scene, room photo and account data are not migrated or replaced.

The shared theme covers the shell, overview, seven categories, rooms, all existing
specialized cards and Home dialogs. Reusable device cards distinguish opening full
details from issuing commands and expose only the backend's existing capabilities.
The full controls, history, scene editor and configuration remain in the existing
components. Existing function permissions and confirmations still apply.

## Validation on 30 October 2026

- Production TypeScript/Vite build, frontend TypeScript lint and `git diff --check`:
  passed. Vite retains its existing bundle-size advisory.
- Frontend unit suite: **172 passed**, including gap preservation, invalid samples
  and a single zero-valued sample in the new timestamp-based chart.
- Relevant backend suites (`test_home_overview`, `test_home_features`,
  `test_home_extras`, `test_api`, `test_access`): **66 passed**.
- Packaged runtime browser verification: **16 passed** across Chromium desktop and
  mobile, covering the 12 Harmoni scenarios plus existing Living and multimedia.
  The backend and compiled frontend are loaded from the extracted release archive.
- Widths: **320, 390, 834 and 1440 px**. Checked all Home categories, room browsing,
  control details, long content, light/dark, palette selection and reduced motion.
- Verified style switching in both directions and after reload without changing
  saved favorites or Home preferences; simple mode also retains the style.
- Verified real demo power, dimmer and thermostat commands, separate details,
  lock/shade confirmation and cancellation, pending/error states, read-only
  permissions, unavailable devices and the existing disconnection grace period.
- Charts use recorder/statistics data, units and timestamps. Null/nonfinite values
  remain gaps. Failed, absent and unsupported history show explanatory empty states.
- Deterministic HA app payload and source manifest: verified with
  `scripts/package.py --check`.

## Pre-existing repository limitations

The repository-wide checks are **not all green**. These failures are independent
of this frontend style and were not hidden or disabled:

- Backend Ruff reports **42 existing import-order violations** and **26 files**
  needing formatting. No backend source is changed by this release.
- The full backend suite passes **500 of 501** tests. The existing calendar overlap
  fixture hardcodes `+02:00` for dates derived from today, which disagrees with Oslo
  winter time on the validation date. Local socket tests pass outside the sandbox.
- A broader browser regression run has **14 passed / 26 failed**. Re-running the
  Home subset against the previously published **1.36.64 compiled payload** reproduces
  **all 12 failing desktop scenarios** (4 pass / 12 fail on that subset). Examples:
  assertions for six tabs although there are seven, old weather/alert selectors,
  removed theme buttons, older energy flows and a missing HLS fixture/tool.
  The extra room test also still looks for the old theme-button location.

The new passing tests exercise the current Home UI without weakening those older
assertions. Repairing the historical suites and repository-wide formatting remains
separate work. No live household devices or customer accounts were controlled.
Physical Home Assistant OS installation, native Safari and real device execution
are not claimed by isolated Chromium/package validation.

## Publication process

The established distribution is the Home Assistant app repository. Publish the
versioned `ha-app/config.yaml`, changelog, deterministic payload and manifest to
`Prosono/SMARTiDashboard` on `main`. A home must install the new app update before
Harmoni becomes available there; publishing the repository does not update an
existing household installation automatically.

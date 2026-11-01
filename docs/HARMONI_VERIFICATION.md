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

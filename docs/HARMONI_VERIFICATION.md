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

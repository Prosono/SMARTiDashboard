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

# SMARTi Home for iPhone

Apple Team ID: `3T2Y4G6HVQ` (verified in Apple Developer on 2026-10-19).
Separate Bundle ID: `dev.smarti.home`, registered with Apple on 2026-10-19.
`dev.smarti.flex` belongs to the existing SMARTi Flex app and must not be reused.

The iPhone implementation is in progress. Version 0.1.0 (1) was uploaded to internal TestFlight on 2026-10-19; see distribution status below.
Push requires a separately configured APNs provider and signing capabilities;
location requires explicit consent and validation on a physical iPhone.

## Implemented development slice

- SwiftUI shell with the existing SMARTi dashboard in WKWebView, account/home selection through `home.smarti.dev`, and a native phone settings tab.
- Explicit phone pairing from an authenticated home session. Pairing is limited to the exact HTTPS UUID home origin; the app cannot pair from the portal, embedded HA console, or arbitrary websites.
- Independent per-phone credentials, Keychain storage, serialized refresh, no bearer redirects, and revocation.
- A restricted HA `mobile_app` registration bridge. HA webhook credentials remain on the hub. The bridge exposes only location updates, not arbitrary HA webhook service commands.
- Explicit location consent, foreground location and significant-change background updates when Always permission is granted. No continuous background GPS polling.
- Existing SMARTi person settings can select the resulting HA device tracker. Automatic mapping to the correct HA person is **not yet implemented**; do not assume the Supervisor registration user is the resident.

## Build and verification

```sh
xcodebuild -project ios/SMARTiHome.xcodeproj -scheme SMARTiHome \
  -sdk iphonesimulator -configuration Debug -derivedDataPath /tmp/smarti-ios-build \
  CODE_SIGNING_ALLOWED=NO build
.venv/bin/python -m pytest backend/tests/test_mobile.py backend/tests/test_mobile_companion.py backend/tests/test_remote_console.py -q
```

Verified: unsigned simulator build succeeds; 21 backend tests pass. This is compile/automated-test evidence, not a successful physical-phone or live-HA test.

## Remaining before TestFlight

1. App ID registration is complete. Push Notifications capability/provider setup remains outstanding. Do not change SMARTi Flex.
2. Implement and configure the server APNs provider, protected device-token registration, revocation and HA notification delivery. No push token is requested or uploaded by this development slice.
3. Signing/provisioning and the App Store Connect app record are complete. Complete public-distribution disclosures before any App Store release. App icon and local privacy manifest are included.
4. Verify live registration against the hub's Supervisor/HA permissions. Confirm tracker discovery and resident association, including non-admin users.
5. Physical-device tests: permissions declined, location paused, phone locked, significant location changes, cold launch, refresh response loss, revoked access, offline recovery and notifications.
6. Complete physical-device validation before production distribution; the current upload is an internal test build.

Location history can remain in HA after sharing is disabled. The app explains this before enabling sharing. Coordinates are not persisted in SMARTi's companion metadata; only the last successfully forwarded timestamp is retained. HA's webhook transport can acknowledge unknown webhooks with HTTP 200, so a forwarded timestamp alone must not be presented as proof that HA updated the tracker.

## Simulator WebKit crash investigation — 2026-10-19

The iOS 26.2 run produced WebContent SIGBUS reports in JavaScriptCore's JIT helper thread and in dyld's shared-cache loader. These stacks point to native runtime failures; they do not establish a specific SMARTi JavaScript defect or prove that newer runtimes resolve it.

Added `webViewWebContentProcessDidTerminate` handling with at most two automatic GET reloads in a rolling 60-second window, followed by a visible manual retry state. The last committed approved main-frame URL is retained; cookies and phone credentials are not cleared. Navigation errors also offer retry, while cancelled navigation is ignored.

The simulator build succeeds and the standalone recovery budget test passes:

```sh
swiftc -module-cache-path /tmp/smarti-swift-cache \
  ios/SMARTiHome/WebRecoveryBudget.swift ios/Tests/WebRecoveryBudgetTests.swift \
  -o /tmp/smarti-recovery-tests
/tmp/smarti-recovery-tests
```

Updated build installed/launched on the existing iOS 27.1 simulator (`7F9921D9-56DB-432D-B210-64007D176C4F`). Login UI was visibly responsive. Authenticated dashboard reproduction and end-to-end forced WebContent termination recovery remain unverified; no claim of root-cause resolution.


## Local TestFlight preparation — 2026-10-19

Initially the user selected **local preparation only**. Later on 2026-10-19 the user explicitly authorized App ID registration, signing/provisioning, app-record creation and internal TestFlight upload, plus Full Access for existing App Store Connect team users.

Version 0.1.0 (1) now includes the SMARTi app icon (1024×1024, opaque), a privacy
manifest describing linked location/user/device identifiers for app functionality,
and the system-boot-time reason 35F9.1 for the local crash-recovery timer. There is
no tracking. The app uses system HTTPS/Keychain rather than custom encryption.

Unsigned Release archive successfully built at `/tmp/SMARTiHome-unsigned.xcarchive`.
This is not installable on a physical device and is not a TestFlight upload.
Build command:

```sh
xcodebuild -project ios/SMARTiHome.xcodeproj -scheme SMARTiHome \
  -configuration Release -destination 'generic/platform=iOS' \
  -archivePath /tmp/SMARTiHome-unsigned.xcarchive \
  -derivedDataPath /tmp/smarti-ios-release CODE_SIGNING_ALLOWED=NO archive
```

`ExportOptions-TestFlight.plist` is prepared for **local export**, automatic signing
and internal-only TestFlight distribution when later authorized; destination is
`export`, not `upload`. Signing and Apple validation remain unverified.

Follow-up reports supplied by the user at 11:49 both identify the old iOS 26.2
simulator B4739AFF-CAFA-4732-88F2-EC83C6DFC033. The first faults in
`JSC::CodeOrigin::approximateHash`; the next process launches about 32 ms after
that failure and faults in `DyldSharedCache::getUUID` about 144 ms later.
All six WebContent reports found in DiagnosticReports during this follow-up
belong to that same simulator; none identifies the iOS 27.1 test device. This
is not proof of stability on iOS 27.1 or physical hardware. The old simulator
was shut down to avoid continuing to test the wrong runtime; its data was kept.

### Simulator workaround withdrawn

The attempted iOS 26.2-only Lockdown/JIT workaround was removed after the
11:56 reports demonstrated a crash in `JSRopeString::resolveToBuffer` /
`stringProtoFuncTrim` on the interpreter path after a click. The replacement
WebContent.CaptivePortal process then failed in `DyldSharedCache::getUUID`
after approximately 149 ms. These reports show the workaround was insufficient;
the short successful startup check was not evidence of a resolved crash.

All web views now retain normal WebKit preferences. Bounded crash recovery is
retained. Continue comparative testing on iOS 27.1; do not claim the iOS 26.2
runtime or physical iPhone stability is fixed. No simulator data was erased.

Apple DTS confirms simulator shared-cache mapping/dyld bugs (r. 177003270,
r. 179143461) and recommends a complete 27-series test environment:
https://developer.apple.com/forums/thread/837945 . This supports the runtime
comparison, not a proven cause for the separate JSRopeString crash.
The normal-WebKit simulator build was installed/launched on iOS 27.1; login
rendered. Further hub reproduction requires the user to sign in there.
The unsigned iPhone Release archive was rebuilt after removing the workaround.

## Internal TestFlight distribution — 2026-10-19

- Apple app record: SMARTi Home, ID `6824492352`, Norwegian primary language, SKU `smarti-home-ios`.
- Version 0.1.0 (1) archive and distribution export succeeded. Xcode confirmed upload succeeded; Apple completed processing and marked the build Ready to Test.
- App Store Connect: https://appstoreconnect.apple.com/apps/6824492352/testflight
- Internal group: `SMARTi intern test`, manual build distribution, existing account holder added as tester. Build 0.1.0 (1) is assigned to the group and shows Testing.
- Signed archive: `/tmp/SMARTiHome-TestFlight.xcarchive`; local IPA: `/tmp/SMARTiHome-TestFlight-export/SMARTiHome.ipa`.
- Upload uses `ExportOptions-TestFlight.plist` with `destination` changed to `upload` in a temporary copy. The checked-in plist remains local-export-only.
- This does not establish physical-iPhone stability. Push delivery is not implemented in this build.

## Phone layout update — build 0.1.0 (2)

The native home toolbar and Hjem/Telefon tabs are removed. The WKWebView is sized
from the available SwiftUI safe-area geometry and explicitly requests mobile
content. Phone pairing/location settings are presented as a sheet from the hub's
Innstillinger → Denne iPhonen button (HA app 1.35.42 or later). The native bridge
only accepts its fixed `open` message from the main frame at the current UUID home
origin; it neither grants permissions nor pairs automatically.

Release archive and TestFlight upload succeeded. Frontend: 133 tests passed;
mobile Playwright checks passed for viewport widths 320, 393 and 852, settings
bridge dispatch and tab-strip centering. App chrome removal was visually checked
in the simulator; physical-phone layout verification remains pending.

## Edge-to-edge layout and remembered home — build 0.1.0 (3)

The native web view now extends behind the system safe areas; HA 1.35.43 uses
viewport-fit=cover and themed safe-area padding for the header and bottom menu.
Notification counts overlay mobile navigation icons instead of taking a flex row.

On a committed UUID home navigation, the app stores only the HTTPS origin in
UserDefaults. Subsequent launches reopen it with the existing WebKit session;
expired sessions still require authentication. The portal does not overwrite this
preference. Settings → Fjernaksess sends the fixed native command `remote` to
open the portal for choosing or connecting another home. The same main-frame and
current-home origin checks apply as for phone settings.

Validation: Release archive succeeded, 133 frontend tests passed, mobile
Playwright tests passed for badge geometry, viewport fit, both bridge commands
and tab centering. Real-device safe-area appearance requires checking after both
the native build and hub update are installed.

Build 0.1.0 (3) uploaded successfully and was assigned to SMARTi intern test;
App Store Connect confirmed Testing. Hub 1.35.43 is pushed to main.

## QR onboarding — build 0.1.0 (4)

Adds native QR scanning (camera permission only on explicit scan), first-launch
welcome, existing-home persistence, and validated Universal Links for
`https://home.smarti.dev/activate#...`. Portal pages implement the customer wizard;
hub 1.35.47 applies owner-approved setup with checkpoints. Associated Domains
entitlement is `applinks:home.smarti.dev`; the portal serves AASA for
`3T2Y4G6HVQ.dev.smarti.home`. Signed archive and simulator compilation succeeded.
Physical QR capture and Universal Links require device validation after TestFlight
installation; existing selected homes remain the default entry point.

Xcode confirmed build 0.1.0 (4) upload succeeded on 2026-10-19. Apple processing
and assignment to the existing manual internal-test group remain unverified;
the user was actively using Firefox during the attempted App Store Connect check.

## Local hub discovery — build 0.1.0 (5)

New Home opens a native Bonjour browser for `_smarti-setup._tcp`. Permission is
requested only after this action. TXT records are validated, capped and treated
as untrusted until the fixed HTTPS portal verifies their short-lived signed proof
and the separate activation PIN. No LAN URL or local configuration endpoint is
opened. Discovery stops when dismissed; QR/manual setup remains available.
Existing selected homes still open directly.

Simulator build, signed archive and Apple upload succeeded. Backend: 297 tests
passed. macOS DNS-SD received the actual Python broadcaster's TXT announcement.
Physical iPhone/HAOS discovery and denied-permission behavior need pilot testing.
Install HA 1.35.48 and use a factory-ready, unowned test hub with zero SMARTi users.

App Store Connect confirmed build 5 as **Testing** in **SMARTi intern test** on
2026-10-19. Portal discovery support is deployed at home.smarti.dev.

## Unconfigured hub discovery — build 0.1.0 (6)

Requires HA 1.35.50 for automatic enrollment. Install/start the HA app with no
SMARTi customer users and leave connection identity options empty. New Home
discovers it immediately as ready for setup, even before internet is available.
Select it, then scan the inventory QR inside the app and enter the separate PIN.
The selected device is carried into activation; remote credentials are delivered
directly to the hub over HTTPS, never via the phone. Existing homes remain private.
Physical iPhone/HAOS multicast discovery still requires a pilot test.

Build 6 uploaded successfully and App Store Connect confirmed **Testing** after
assignment to **SMARTi intern test** on 2026-10-19. HA 1.35.50 is published and
automatic enrollment is deployed at home.smarti.dev.

## Automatic QR transition — build 0.1.0 (7)

Selecting a discovered hub now dismisses discovery before presenting the native
QR camera. The selection is held in native state rather than depending on the
activation page having finished loading. The camera starts in viewDidAppear via
a containing UIViewController; startup and unavailable errors are surfaced.

A valid QR automatically opens activation with the selected hub and hides the
already-read label. Entering the eight-digit PIN advances once without another
button. PIN/account ownership checks remain required. Run
`node scripts/test_onboarding_scan.cjs` from the repository root for the isolated
mobile-browser regression test. Signed iPhone archive passed; physical camera
capture still needs testing on the user's iPhone.

Build 7 uploaded and confirmed **Testing** in **SMARTi intern test** on 2026-10-19.
Portal QR/PIN progression is deployed; HA remains at 1.35.50.

## Customer onboarding — build 0.1.0 (8)

Accepts v2 activation QR codes without a separate PIN and adds the camera/photo
library usage descriptions for profile portraits. The deployed portal provides
full contact profiles, verification and invitations; HA 1.35.51 provides the
customer-account handoff. Legacy QR labels still require their existing PIN.

Signed archive and TestFlight upload succeeded on 2026-10-20. Archive:
`/tmp/SMARTiHome-build8.xcarchive`. The seven customer-account backend tests and
both mobile browser onboarding regressions pass. Physical-device onboarding and
actual mail delivery remain to be tested. App Store Connect confirmed build 8
as **Testing** in **SMARTi intern test** on 2026-10-20 (build ID
`c736a9c1-9d9e-473f-9364-148b8a064928`).

# Customer onboarding update

Requires hub 1.35.51, iPhone 0.1.0 build 8 and the matching cloud + relay images.
Cloud and relay deployed to home.smarti.dev on 2026-10-20 using the
`customer-mail-20261020` image tags. Hub 1.35.51 was pushed to main on
2026-10-20 (bb48b29). Xcode confirmed successful upload of iPhone 0.1.0 build 8
on the same date; assignment to the internal TestFlight group is pending.

SendGrid SMTP is configured with `contact@smarti.dev`. TLS and authentication
were verified from the running portal container; actual delivery and sender
verification still need an end-to-end check. The key is mounted from the server's
protected secret file and is not stored in this repository.

Deployment checks: public health, portal, account page and account script return
HTTP 200; customer tables exist; the relay status endpoint responds. Prior
images and a consistent pre-migration database backup were retained on the server.

## Flow

1. LAN discovery → native QR scanner. New factory labels use `home.v2.secret` in the URL fragment. The HMAC-derived 256-bit activation secret replaces manual PIN entry. Legacy labels still require their separate PIN. New labels must be printed; an old physical QR cannot change itself.
2. Full name, e-mail (login identifier), phone, address, postal code, city, country and optional portrait. Camera/library selection is explicit. The browser crops/downscales/re-encodes JPEG to remove original metadata.
3. Home, rooms/floors, experience level, confirmation. User creation writes the cloud account/local user binding atomically. Existing-installation mode never silently adopts a pre-existing local administrator.
4. Completed hub setup starts a ten-day verification grace period and queues mail. Optional invitations are sent after setup. “Open home” redeems a 60-second, single-use, home-bound code for a customer session; no second password prompt.
5. Invitation links expire after seven days. Recipient must sign in with a matching e-mail profile. Possession of the mailed invitation verifies that e-mail. Invitees receive normal user access, not owner/admin access. Owners can revoke members from `/account`.

## Access enforcement

The relay and hub status both reject remote access once the owner's verification grace has expired. Explicit verification restores eligibility without toggling an owner's deliberate remote-disable setting. Local home access is unaffected. Legacy accounts without a customer profile are grandfathered.

Customer sessions are checked against current ownership/membership with a maximum five-second validation cache, including event streams and embedded HA consoles. Mapping uses cloud account IDs, never matching local usernames. Owner mapping requires the new onboarding checkpoint. Invited users get a separate local identity with an unguessable password; they cannot reuse a local administrator name to gain privileges.

## E-mail configuration — required before customer deployment

Use `services/cloud/compose.mail.example.yaml` with the actual verified sender/provider. SMTP uses certificate-verified STARTTLS (normally port 587), with password read from a mounted secret. No provider, sender or credentials are assumed.

The database outbox retries every minute and on explicit resend. Delivery failures retain a generic error, never provider credentials. Message bodies containing bearer links are erased after delivery. Database volume/backup protection is important because queued messages contain private contact data and temporary links. A single cloud worker is assumed by the outbox delivery lock.

Do not activate customer onboarding with no working mail sender: the grace period deliberately starts at successful hub setup, not at delivery. `/account` reports when no mail sender is configured. Configure SPF/DKIM with the chosen provider and perform delivery tests before rollout.

## Deployment order and validation

Back up cloud database. Deploy cloud first (schema migration), then relay (verification gating), then update hub and iPhone. Do not upgrade the relay alone against an old schema. Keep the hub's existing identities/users intact; test first-run on a separate clean test hub.

Automated checks cover old/new QR, ownership isolation, grace expiry/verification recovery, single-use sign-in, invitation e-mail matching/replay/revocation, local admin-name collision, and CSRF. Browser test covers QR-to-profile on a mobile viewport. Simulator compilation is not proof of physical camera/library or SMTP delivery; these still require a real-device end-to-end check.

Future replacement of lost/compromised QR codes is recorded in `docs/TODO.md`.

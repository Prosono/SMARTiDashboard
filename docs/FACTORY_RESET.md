# SMARTi factory reset — implementation status

An executable **partial cleanup** is implemented, not a complete factory restore.
It uses public HA APIs and preserves installed apps. The UI explicitly requires
acknowledgement of manual follow-up in addition to data loss and pairing warnings.
Live execution is allowed only with a connected HA, no active SMARTi pairing,
advanced-mode administrator access, CSRF validation and current-account password.
Demo never starts real operations. No live hub was reset during development.

Implemented:
- Read-only inventory of HA registries, users, statistics and Zigbee devices before
  writes. Pause automations/scripts before removals; stop if pausing fails.
- Close Zigbee joining, attempt non-forced per-device removal with an explicit
  acknowledgement and inventory verification. Remove Matter through HA's
  integration-aware device removal (never just erase its registry row).
- Delete API-managed automations, scenes, scripts, persons, zones, areas, floors
  and non-system/non-owner HA users; request recorder/statistics cleanup.
- Clear SMARTi favorites, dashboards and notification inbox. App installations,
  hub identity and portal ownership are never removed.
- Durable operation journal, idempotent request IDs and exclusion of concurrent
  SMARTi writes. Restart marks a running job interrupted without replaying it.
  An incomplete result retains SMARTi accounts and access for manual recovery.
- UI polling, per-step results, incomplete/interrupted states, retained report
  after reopening, and password clearing after submission/cancellation.

Current limitations (shown before confirmation and in results):
- Healthy Z-Wave nodes need physical exclusion; this version does not launch blind
  exclusion or reset a controller. Sleeping devices may require physical reset.
- HA does not allow deletion of its owner via config/auth/delete. That account,
  system users, unsupported integration configuration, helpers and YAML require
  separate cleanup. Location and HA access tokens are not reset here.
- Recorder purge acceptance is not proof of completed deletion; result remains
  unconfirmed. SMARTi users, cloud/mobile/support access and automatic onboarding
  transition are not reset. Consequently real jobs end **incomplete**, never with
  a claim that the hub is clean or ready for another owner.

Before full factory-reset completion can be enabled, implement coordinated cloud
revocation and owner-bound re-onboarding, a supported HA configuration reset path,
and verify end-state erasure. Do not relax the incomplete status to hide these gaps.

## Product contract

Only advanced-mode administrators can see the action. The backend independently
checks administrator role and saved advanced-mode preference. Temporary support
principals are rejected. Reauthentication verifies the current local account's
password without opening a new session, with a separate rate limit. Passwords
must never enter logs, persistent jobs or progress responses.

Keep installed Home Assistant and apps, hub identity and portal ownership.
Remove home data and device associations through the respective services, rather
than uninstalling apps or wiping the HAOS data partition. A failed pairing removal
is reported as remaining work, never silently labelled complete. Offline/sleeping
end devices may require a physical reset even after the hub forgets them.

The confirmation explains data loss and pairing limitations, requires both explicit
acknowledgements, a backup choice, the text RESET HUB and the administrator password.
Backup should be downloaded outside the hub. The factory reset does not transfer
ownership. Do not invoke HAOS datadisk wipe.

## Remaining execution work

1. Snapshot actual device, integration, automation and user inventories, plus active
   pairing operations. Keep a durable, credential-free reset journal outside data
   scheduled for deletion. Bind the confirmation to this snapshot.
2. Pause automations and stop inclusion/exclusion before removing devices. Implement
   adapters with bounded timeouts and verified results. Existing Setup.remove can
   remove an awake Zigbee device; Z-Wave exclusion requires physical participation
   and its returned `searching` state is not proof of deletion. Matter requires its
   own removal path. No generic force-remove fallback.
3. Record removed, failed, unconfirmed and manual-reset-required devices separately.
   Do not retry uncertain destructive operations automatically after power loss.
4. Reset HA configuration, users and history while preserving the app/service
   infrastructure required to bootstrap a new home. Include YAML-managed entities
   and recorder external-storage cases in readiness checks.
5. Revoke cloud/mobile/support access with acknowledged server operations while
   retaining the ownership record and stable hub identity. Coordinate cloud
   onboarding: deleting local users alone can replay an old onboarding plan.
6. Clear SMARTi customer data only after the journal and safe recovery path exist.
   Re-enter LAN discovery and require the existing owner's account for setup.
7. Show an explicit partial result for pairing leftovers, and a failed/incomplete
   result for access revocation or data erasure failures. Never claim data is erased
   on a timeout. Provide recovery independent of a user session that may be deleted.

No live hub has been reset during implementation. Validate on a disposable test
home with awake and sleeping radios, disconnected cloud, restart during each phase,
concurrent requests, user demotion and expired sessions before enabling execution.

## Offline HA account reset — isolated validation, 2026-10-20

`backend/app/ha_auth_reset.py` now implements the offline account transformation
and first-owner API client. It removes customer users, their credentials, refresh
and long-lived tokens, local password hashes and TOTP enrollment. System-generated
accounts and their service tokens are retained so Supervisor infrastructure can
survive. Only the user onboarding step is reopened; this is an **account reset**,
not erasure of integrations, person registries, history or every configuration file.
Unknown storage versions/providers/layouts are refused before writes.

The offline writer requires a host guard asserting that Core is stopped and the
instance is isolated. It rechecks this guard between files. Files are replaced
atomically with restrictive permissions; a durable credential-free journal blocks
replay after interruption. Multi-file replacement is not atomic: after any partial
failure Core must stay stopped and isolated until an operator resolves the journal.
Old credentials are not restored automatically. No credential backup is retained.
The first-owner API client checks onboarding before/after creation and never retries
an ambiguous POST or returns passwords/auth codes.

Validation:
- Unit tests exercise schema refusal, human credential removal, infrastructure
  retention, missing isolation, symlinks, interruption, and ambiguous owner creation.
- `scripts/test_ha_auth_reset.py` ran successfully against the real HA Docker image
  `ghcr.io/home-assistant/home-assistant:2026.10.2` (image digest
  `sha256:33afb0659d786213264c2211f8d91c5fe87461c56eba6a3a546eb05fc71e89f4`).
  It created an old owner, stopped Core, applied the reset, restarted Core, created
  a new owner through onboarding, and verified the stored old owner was absent and
  exactly one new owner existed. The container had `--network none`, no exposed
  ports, and only disposable configuration. It was removed after the test.
- This does not validate HAOS/Supervisor reconnection or physical radio behavior.

**Not connected to the live reset button yet.** The addon currently has no writable
HA configuration mount, and there is no verified host adapter to maintain network
isolation across Core restart. The cloud setup plan currently carries a SMARTi
password hash, not a password usable by HA's onboarding API. Before live activation,
implement owner-authorized credential entry/transport, host isolation and recovery,
and coordinated cloud/session revocation. Do not replace the manual-owner warning
with success until those dependencies are actually satisfied. This test changes no
production account, installed app, radio pairing or cloud ownership record.

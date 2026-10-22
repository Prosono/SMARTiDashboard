# SMARTi energy platform

## Architecture

The existing Home energy view now includes a shared per-hub energy setup and cost dashboard. Personal recorder presentation and the existing 3D energy flow remain available. The setup can seed empty 3D power bindings; it never overwrites a user's explicit bindings.

The hub stores effective-dated agreements, completed-hour recorder measurements, dated spot prices and versioned grid-tariff documents in its existing SQLite database. A single main-surface background task refreshes the last two days and backfills one older day every five minutes, up to 366 days. Mobile and remote surfaces do not run duplicate collectors. The cloud supplies cached public prices/tariffs and stores authenticated, idempotent measurement batches. A source outage preserves stored data and is retried.

Cloud readings are keyed by home, owner, sensor and UTC timestamp. Readers must own or belong to the current home; a subsequent owner cannot read the previous owner's archive. Confirmed factory reset clears the cloud archive and local energy tables. Uploads during reset are rejected. An in-flight recorder request checks the local generation before writing after reset.

## Setup and units

The wizard selects NO1–NO5, grid company, household/holiday home, spot/fixed contract, markup, monthly fee, independent support scheme, energy and optional power sensors. Additional consumer meters, solar/export, EV, battery charge/discharge and SoC are supported. Manual energy/capacity overrides and confirmed tax exemptions are available. All entered monetary rates are **excluding VAT**, in NOK/kWh or NOK/month as labelled. No postcode-to-grid-company mapping is guessed.

An explicitly selected effective date determines which historic intervals use an agreement. Without an agreement covering an old interval, the UI does not invent a historic cost. Energy sensors remain separate: submeter readings are not added to grid imports.

## Sources and interpretation

- [Hva koster strømmen API](https://www.hvakosterstrommen.no/strompris-api): prices excluding VAT, exact published ISO interval boundaries. History from December 2021. Its ENTSO-E/EUR conversion can differ from a supplier's NOK settlement; calculations are estimates, not invoices.
- [Fri Nettleie](https://github.com/kraftsystemet/fri-nettleie): CC BY 4.0; bundled snapshot of 73 companies, retrieved 2026-10-22, individual source revisions and original company sources retained in `backend/app/energy_data/tariffs.json`. Cloud refreshes allowlisted company documents daily. Community-maintained dates and coverage are not guaranteed.
- Raw Fri Nettleie rates exclude taxes; annual fixed charges are divided by 12. Hour ranges are inclusive, including overnight ranges. Norwegian public holidays, weekdays/weekends and month exceptions are interpreted in Europe/Oslo.
- [NVE strømstøtte](https://www.nve.no/reguleringsmyndigheten/kunde/stroem/dette-er-stroemstoetteordningen/), [NVE Norgespris](https://www.nve.no/reguleringsmyndigheten/kunde/stroem/dette-er-norgespris/), [Skatteetaten electricity tax](https://www.skatteetaten.no/satser/elektrisk-kraft/?year=2026), [Lnett tariff and taxes](https://www.l-nett.no/nettleie/priser-og-vilkar-privat/).

The verified 2026 rule set uses electricity tax 7.13 øre/kWh, the Energy Fund charge 1 øre/kWh, VAT 25% unless exempt, Norgespris 40 øre/kWh before VAT, and ordinary support at 90% above 77 øre/kWh. Rules deliberately stop at the verified year. Geographic exemptions require confirmation rather than assuming that every NO4 customer has the same tax treatment.

## Deliberate limits / remaining work

- **Elhub is not connected.** SMARTi must establish the Third Party API role, the required agreement and Maskinporten scopes, then obtain each customer's meter-point authorization. [Elhub API portal](https://api.elhub.no/) and [third-party requirements](https://elhub.no/fagomrader/aktor-og-markedsstruktur/aktorenes-roller?article=elhub-for-tredjeparter) distinguish business authentication from customer authorization. This implementation does not invent a consumer OAuth login or collect national identity numbers. The UI reports the external prerequisite clearly. Live end-to-end consent, retrieval, corrections and revocation must be implemented and tested against the granted API contract once access exists. Interval reconciliation is ready for that source.
- Support uses the chronological first 5,000 kWh (1,000 for holiday-home Norgespris). The crossing interval is prorated; complete import readings from month start through that interval are required. A missing prefix or changed import sensor with an unreconciled prefix blocks that cost, rather than assuming unused allowance. See [Elvia’s cap explanation](https://www.elvia.no/smart-forbruk/forbruk-og-sparing/stromstotte-for-hoye-strompriser/) and [the government’s Norgespris explanation](https://www.regjeringen.no/no/aktuelt/115-milliardar-kroner-til-straumstonad-og-norgespris/id3121799/).
- Capacity supports three distinct daily maxima and monthly maximum. Main-fuse and weighted-annual tariffs need a manual monthly override. Current capacity is provisional; missing readings prevent a final total. Fixed charges are proportionally allocated across elapsed monthly time, not presented as an actual daily invoice.
- The cost model covers 2026. Earlier/later policy years need separately sourced dated rules. Historical measurements remain available even without cost rules.
- Hourly consumption valued against shorter spot intervals uses time weighting and is estimated. It does not fabricate quarter-hour consumption. The recorder collector currently collects hourly energy changes; no integration of sparse power samples is presented as measured energy.
- Solar self-consumption is shown only with complete production/export readings and no configured battery. Export value is a spot-value estimate before supplier export terms. Battery-aware self-consumption and avoided-purchase valuation need a complete interval flow balance.
- The cloud archive stores measurements and effective-dated agreements/meter bindings; public price caches stay in the cloud as well. Authenticated reading is available; a customer-facing cloud history viewer and automatic archive restoration are not yet implemented. The local archive retains tariff revisions, while the cloud tariff cache exposes the latest source document.
- Currency is NOK; grid tariff updates still require source-quality monitoring. The dashboard labels unavailable data and source provenance instead of fabricating complete totals.

## Operations and validation

Deploy the cloud endpoints before installing the corresponding hub release. The cloud image needs `PyYAML==6.0.3`; copying only Python sources into an old image is insufficient. Include `energy_data/tariffs.json` in both images. Existing SQLite databases create additive energy tables automatically; back up production databases before deployment. No credentials belong in the source tree.

Tests cover DST days and gaps, negative prices, tariffs and holidays, overnight schedules, distinct-day capacity peaks, dated agreements, idempotent writes, owner isolation, admin-only setup and absent-data presentation. Playwright exercises the wizard at desktop and iPhone sizes. No real customer meter or Elhub credentials are used in these tests.

Release 1.36.0 includes the hub-onboarding fixes through 1.35.96. The cloud endpoints were deployed on 2026-10-22 after a SQLite backup and an isolated container startup/migration check. Physical HA recorder collection and cloud uploads require a configured energy meter; they must be verified on a connected hub once the owner selects their actual meters and agreement. Elhub remains unavailable until business access is established.

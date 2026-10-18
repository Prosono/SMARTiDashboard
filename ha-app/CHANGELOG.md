## 1.35.19

- Sonekartet viser alle sonene i soneoversikten med navn og radius, og tilpasser utsnittet automatisk.
- Passive soner markeres med stiplet kant. Andre soner vises som referanse ved redigering, og kartet oppdateres etter lagring.

## 1.35.18

- Profilbildet kan byttes direkte i Rediger person, også for personer uten SMARTi-innlogging.
- Forhåndsvis nytt bilde før lagring, eller velg å bruke systembildet igjen. Personoversikten oppdateres etter lagring.

## 1.35.17

- Ryddigere side for nye enheter: fjernet generell tekst om søkevinduet og mellomoverskriften Andre tilkoblinger.
- Matter vises med det faktiske protokollsymbolet, med god kontrast i alle temaer.

## 1.35.16

- Sidemenyen åpnes og lukkes med et rent menyikon øverst til venstre, uten tekst.

## 1.35.15

- Sidemenyen kan trekkes sammen til en smal ikonmeny på nettbrett og datamaskin. Valget huskes per bruker i nettleseren.
- Mobilens bunnmeny beholdes med synlige navn og automatisk rulling til valgt side.

## 1.35.14

- Lokale adresser til hjemmesentralen godkjennes automatisk gjennom bekreftet informasjon fra Supervisor. Nettbrett og telefoner trenger ingen individuell godkjenning.
- Oppdager aktive lokale IPv4-/IPv6-adresser og lokale vertsnavn med hjemmesentralens faktiske HTTP-/HTTPS-port. Adressene oppdateres hvert minutt.
- Beholder krav om brukernavn, passord, tilgangsstyring og CSRF-beskyttelse. Fremmede nettsider og andre enheter på samme nettverk godkjennes ikke som SMARTi-adresser.
- Automatisk oppdagelse kan slås av med auto_local_origins. Egendefinerte og eksterne adresser kan fortsatt legges til manuelt.

## 1.35.13

- Ny flow-redigering med tydelige hendelser, krav og handlinger, forståelige ikoner, farger og forklaringer. Velg mellom stegvis oversikt og fri arbeidsflate.
- Sammensatte automasjoner viser valg, hvis/ellers, gjentakelser, venting og parallelle løp med de opprinnelige grenene og rekkefølgen.
- Rediger hvert steg i en popup med relevante felt, enhetsvelger, validering og mulighet til å forkaste endringer. Maluttrykk og ukjente felt bevares.
- Flere HA-entiteter, også hjelpere, kan velges i automasjoner. Eldre og nyere syntaks får forståelige beskrivelser.
- Blueprint-automasjoner får redigerbare enkle inndataverdier og en separat, skrivebeskyttet forhåndsvisning av den oppløste flyten når hjemmesentralen leverer den. Oppskriftskoblingen beholdes.
- Forbindelser på arbeidsflaten kontrolleres strengere for å hindre at omkobling endrer variabelomfang eller betinget kjøring utilsiktet.

## 1.35.12

- Velg mellom 16 ikoner for automasjoner i en egen popup. Ikonvalget lagres i SMARTi uten å endre HA-logikken.
- Eget utløserfelt med ikoner og forklaring fra automasjonens oppsett. Trykk for å se flere utløsere.
- Utløserdetaljer lastes ved behov og mellomlagres.

## 1.35.11

- Redesignet automasjonsoversikt med bildebanner, reelle status-tall, søk, statusfiltre og sortering.
- Kort- og listevisning, tydelig aktiveringsbryter og rask tilgang til kjøring og eksisterende redigering.
- Tilpasset mobil, nettbrett og valgte fargetemaer.

## 1.35.10

- Tema- og lys/mørk-velgerne er fjernet fra toppbaren. Valgene finnes under Innstillinger → Tema og utseende.

## 1.35.9

- Bunnmenyen på mobil sentrerer den aktive siden.
- Rom er fjernet fra menyen i Enkel-modus; romtilgangen ligger på Hjem.
- Velg mellom rombilde og tolv romikoner under Administrer rom → Bilde eller ikon. Valget gjelder hele hjemmet.

## 1.35.8

- Valgt Hjem-fane sentreres automatisk i den horisontale mobilmenyen.
- Følger trykk, sveiping og tastaturnavigasjon, tilpasser seg skjermbredde og respekterer redusert bevegelse.

## 1.35.7

- Husillustrasjonen i innloggingsvinduet er erstattet med den originale SMARTi-logoen.

## 1.35.6

- Diverse får bildebanner og enhetsoversikt i samme stil som de andre hjemmesidene.
- Nytt robotstøvsugerikon.
- Egne persiennekort med rapportert posisjon, visuell åpning og støttede åpne/stopp/lukk-knapper.
- Egne bryter- og stikkontaktkort med tydelig status og stor av/på-knapp.
- Bekreftelse av persiennebevegelse i popup; tilgang, utilgjengelighet og ventende kommandoer respekteres.

## 1.35.5

- Rengjøring-fanen heter nå Diverse, også i Enkel-visningen.
- Egne seksjoner for robotstøvsugere, persienner/gardiner/markiser og brytere/stikkontakter.
- Eksisterende tilgangsstyring og enhetskontroller gjenbrukes. Garasjeporter og dører forblir under Sikkerhet.
- Samlet søk og romfilter bak utvid-ikonet.

## 1.35.4

- Bildebannerne vises alltid på Lys, Klima, Sikkerhet og Multimedia.
- Utvid-ikonet viser og skjuler i stedet verktøylinjen med søk og filtre, som er lukket som standard.

## 1.35.3

- Bannerne på Lys, Klima, Sikkerhet og Multimedia er lukket som standard.
- Felles utvid-/skjul-ikon på tittelraden, sentrert på desktop og til høyre på mindre skjermer.

## 1.35.2

- Scener-knapp i verktøylinjen på Lys åpner scenene i en dialog, som under Multimedia.
- Tilgangen følger brukerens eksisterende scenerettigheter.

## 1.35.1

- Velkomstbanneret viser kun værkort i Normal og Avansert, uten karusell eller automatisk bytting.
- Værkortet har en ensfarget bakgrunn som følger valgt tema, med ekte værdata og prognose.
- Fjernet «Vis mer informasjon». Værkortet er fortsatt skjult på mobil.
- Tydelig beskjed når værdata mangler eller forbindelsen er borte.

## 1.35.0

- Generell støtte for robotstøvsugere via hjemmesentralens vacuum-enheter, uavhengig av merke.
- Rengjøring-fane vises når en robot finnes, samt snarvei i Enkel og robotkort i rom/enhetsvisninger og favoritter.
- Status, batteri når tilgjengelig, start/fortsett, pause og retur til ladestasjon. Kun støttede handlinger vises.
- Detaljdialog med sugestyrke, stopp, finn roboten og punktrengjøring når integrasjonen støtter det.
- Romrengjøring bruker eksisterende HA-romkoblinger og clean_area-støtte; eldre integrasjoner får grunnstyring.
- Separate rettigheter for å se og styre rengjøring, kontrollert på serveren.
- Ingen automatisk gjentakelse av ubekreftede kommandoer. Kart og produsentspesifikke moppe-/stasjonsfunksjoner er ikke med i denne versjonen.

## 1.34.1

- Mer innbydende Enkel-visning med rombilder og favoritter først.
- Redesignet velger for Enkel, Normal og Avansert.
- Administrasjon-knappen er fjernet fra sidemenyen i Normal.
- Norsk bokmål og engelsk lagres per SMARTi-bruker under Tema og utseende og følger kontoen mellom enheter.
- Tilpass Hjem vises som et tannhjul med tilgjengelig navn.
- Multimedia-verktøylinjen følger samme design som Lys og Klima.

## 1.34.0

- Personlige visningsnivåer: Enkel, Normal og Avansert, lagret per SMARTi-bruker på hjemmesentralen.
- Enkel: rolig startside, romvalg, søk, favoritter, store av/på-knapper og flere enheter ved behov. Varsler for røyk, gass og lekkasje vises uavhengig av romfilter.
- Normal: daglige funksjoner med ekstra oversiktsinformasjon og teknisk administrasjon bak egne valg.
- Avansert beholder dagens komplette grensesnitt. Bytt nivå under Innstillinger; tilgangsstyringen er uendret i alle nivåer.
- Multimedia har verktøylinjen over oppsummeringsbanneret, som de andre sidene.

## 1.33.0

- Tilgangsstyring per bruker under Hjem og personer: administrator, beboer, lesetilgang eller tilpasset profil.
- Separate rettigheter for å se og styre funksjoner, håndhevet på serveren og i hjemoversikten.
- Skjulte enheter filtreres fra hjemdata; kommandoer, kameraer, historikk og direkte API-kall kontrolleres.
- Endrede rettigheter gjelder også eksisterende innlogginger. Beskyttelse mot å fjerne egen/siste administratortilgang.
- Grupper, scener og rutiner kan ikke omgå begrensninger for andre funksjoner.
- Direkte Home Assistant-innlogging har fortsatt egne rettigheter.

## 1.32.4

- Tydeligere bannerbilder på lys, klima, sikkerhet og multimedia med mindre slør over bildemotivet.
- Lokal skjerming bak lysmålinger i stedet for et kraftig filter over hele bildet.

## 1.32.3

- Samme bildefilter som lyssiden på klima, multimedia og sikkerhet, med tydeligere bilder og mindre hvitt slør.
- Egen bakgrunn bak klimamålingene for lesbarhet i alle temaer.

## 1.32.2

- Egne, unike bannerbilder for sikkerhet, klima og multimedia med eksisterende temafiltre.

## 1.32.1

- Eget stemningsbilde med varm belysning for banneret på lyssiden.

## 1.32.0

- Ny multimediaoversikt med rombilder, statusbanner og kompakte spillerkort.
- Samlet verktøylinje med søk, romfilter, avspillingsfilter og kort-/listevisning.
- Rapporterte avspillingstider, volum og støttede kontroller på hvert spillerkort.
- Oversikt over aktive kilder og grupperte spillere, samt scener i dialog.

## 1.31.1

- Gjenopprett liveforbindelsen automatisk etter nettverksbrudd, dvale og hengende forbindelser.
- Hent fersk status ved gjenoppkobling, nettverksretur og når appen åpnes igjen.
- Periodisk reservehenting av hjemstatus og tidsgrense på hengende statusforespørsler.
- Kommandoer til enheter sendes aldri automatisk på nytt.

## 1.31.0

- Redesignet sikkerhetsoversikt med statusbanner, kategorier, søk og romfilter.
- Stort livekamera med kameravelger og forhåndsvisninger; bare valgt kamera starter strøm.
- Egne paneler for låser, alarmer, sensorer og observerte hendelser.
- Hurtigtilgang til enhetskontroller i dialoger, med eksisterende bekreftelser.
- Tilpasset mobil og alle fargetemaer.

## 1.30.1

- Kameraer starter parallelt uten å vente på hverandre, med samme sesjonsgrenser.
- Gjenbruk forbindelser til hjemmesentralen for videodeler og spillelister.
- Last avspilleren parallelt med strømoppstart og unngå omstart ved kort rulling ut av bildet.

## 1.30.0

- Ny Alle rom-oversikt med rombilder, lysstatus og målinger per rom.
- Søk og sortering av rom, med direkte åpning av romdetaljer.
- Temperaturjustering med pluss/minus direkte på klimakort, med termostatens grenser og trinn.

## 1.29.1

- Rombilder på klimakort, med valgte rombilder og tematilpasset toning.

## 1.29.0

- Redesignet Klima med romkort, temperaturvisning og modusfarger.
- Samlet verktøylinje med søk, romvalg, kategorier og kort-/listevisning.
- Målt temperatur, fuktighet og CO₂ i oversikten; manglende data merkes tydelig.
- Åpne romkort for eksisterende termostatstyring og sensordetaljer.

## 1.28.3

- Søk er samlet med statusfilter, romvalg og avslåing i lysverktøylinjen.
- Responsiv plassering på desktop, nettbrett og mobil.

## 1.28.2

- Samlet og redesignet hele verktøylinjen for lys: statusfilter, romvalg og avslåing.
- Tydelig merking av at felles avslåing gjelder hele hjemmet.

## 1.28.1

- Kompakt romvelger i lysoversikten uten horisontal rulleliste.
- Romkort får naturlig høyde og flyter tett i kolonner på desktop.

## 1.28.0

- Ny lysoversikt med rombilder, kompakte brytere, dimmere og fargevalg.
- Søk, romfilter og filtrering på på/av, samt felles avslåing.
- Samme lysvisning på Hjem og under Enheter, tilpasset mobil og temaer.

## 1.27.2

- Vis eksisterende grupper fra hjemmesentralen sammen med SMARTi-grupper.
- Synkroniser navn og medlemslister automatisk, og styr støttede grupper direkte.
- Håndter eldre og nestede grupper uten doble kommandoer.

## 1.27.1

- Utvid bildebanken fra fire til tolv romtyper: loft, kjeller, garasje, uteområde, bod, vaskerom, kontor og gang er lagt til.
- Bildene følger med appen og krever ingen ekstern bildetjeneste.

## 1.27.0

- Bildebank for rom med ferdige rombilder og opplasting av egne bilder.
- Farge og hvittemperatur for kompatible lys, også når du lager scener.
- Felles SMARTi-grupper under Enheter, med samlet styring av støttede handlinger.
- Scener er nå også tilgjengelige fra lysfanen på Hjem.

# 1.26.0

- Add an administrator-only Debugging settings tab with an explicit warning and acknowledgement before opening the underlying Home Assistant interface.
- Embed the native interface within a large SMARTi dialog, with reload and return controls. Home Assistant retains its own login and permissions; existing HA sessions may be reused.
- Use only the current ingress origin and a fixed /config/dashboard route. Do not expose Supervisor addresses or tokens. Explain unavailable access in demo/standalone mode.
- Prevent opening a second debugging console from a SMARTi instance nested inside the underlying interface.

Prepared locally, not published. Four backend permission/mode tests and four desktop/mobile browser tests passed. Browser tests use a simulated HA page; a live HA installation was not available for verification.

# 1.25.1

- Show Home highlight widgets on tablet and desktop (768px and wider) only. Unmount the carousel on smaller screens so streams, polling and rotation do not run in the background.
- Tint decorative weather, climate and music artwork using the active palette and dark/light mode. Preserve natural live-camera colors.
- Verify phone/tablet boundary changes, palette updates and existing widget controls in browser tests.

Prepared locally, not published.

# 1.25.0

- Rebuild Home highlight widgets around the supplied visual reference: scenic weather, a glass music player, immersive live-camera frame, theme-aware energy chart, and photographic indoor climate card.
- Keep every card at the same 380px height, including unavailable/loading states; preserve carousel pause, focus and reduced-motion behavior.
- Show up to five actual daily weather forecasts, playback progress and supported media controls, interactive 24-hour energy history, and bounded thermostat adjustment where supported.
- Bundle an optimized decorative Nordic landscape locally; no external image dependency or fabricated camera preview.

Prepared locally, not published. Verified with frontend build, backend weather tests and desktop/mobile browser tests. Live hardware was not available.

# 1.24.0

- Redesign greeting highlights with a fixed-height viewport and stable navigation across weather, cameras, media, energy and indoor temperature.
- Add capability-aware media transport and an energy measurement card with actual 24-hour history.
- Keep missing forecasts, stream errors and long text inside the same card frame; preserve reduced-motion and pause behavior.

Prepared locally, not published. Live camera and media hardware were not available for verification.

# 1.23.0

- Replace the greeting-panel weather widget with a stacked home-highlight carousel: weather, configured cameras, media players and a temperature reading when available.
- Rotate every twelve seconds with previous/next, direct slide selection and a pause control. Pause on hover, focus, hidden document and offline state; disable auto rotation for reduced motion.
- Mount only the active camera card and reuse the live-stream lifecycle. Media and climate cards open their corresponding Home tabs.

Prepared locally, not published. Browser checks cover automatic rotation, manual pause, reduced motion and navigation on desktop/mobile. Live camera hardware was not available.

# 1.22.0

- Add a Multimedia home tab with room filtering, a featured currently playing device and responsive speaker/TV/player cards.
- Include media players in the normalized device model and expose playback, previous/next, stop, power, volume and mute only when advertised by the integration.
- Validate media commands server-side and convert volume percentages/mute values to the corresponding Home Assistant service payloads. Preserve unavailable/pending states.
- Adapt home-tab keyboard navigation and mobile scrolling to six tabs.

Prepared locally, not published. Mocked browser playback and backend service-mapping tests; live physical media players were not available for verification. Media browsing and source selection are not included.

# 1.21.0

- Open room management in a focused dialog, with room naming, favorites, personal control visibility and assignment of existing devices.
- Start the device-pairing wizard from the dialog; the final pairing step still asks for name and room.
- Persist room visibility per user and room. Hidden cards do not disable devices or suppress safety alerts; room metrics retain all controls.
- Keep whole-home room administration available from the room overview.

Prepared locally, not published.

# 1.20.1

- Keep the shared room selector visible above both the room overview and individual rooms, with the selected room highlighted and horizontal scrolling on narrow screens.

Prepared locally, not published.

# 1.20.0

- Refresh the room view with a large photo header, room-management action, individual colored status cards and compact lighting controls.
- Add category filters with an All option; reset filters/search when changing rooms. Retain working dimmers, switches, cameras and climate controls.
- Show air-quality readings when a suitable room sensor is available, without invented trends or comfort assessments. Adapt the layout to mobile and existing color palettes.

Prepared locally, not published.

# 1.19.2

- Move controller status and diagnostics out of device setup. Show Zigbee diagnostics on the Zigbee page and Z-Wave controller status/recovery on the Z-Wave page.

Prepared locally, not published.

# 1.19.1

- Use shared, device-class-aware state labels in protocol and integration device dialogs, device cards, history tables, entity pickers and automation editors.
- Display normalized door/window contacts as Open/Closed (Åpen/Lukket), with semantic labels for motion, moisture, smoke, battery, locks and other binary sensor classes in Norwegian and English.
- Preserve unknown/unavailable states and raw automation/service values; never infer a closed or safe condition from missing data.

Prepared locally, not published. State mapping follows Home Assistant binary-sensor device classes; no device-name guessing or raw Zigbee contact inversion.

# 1.19.0

- Redesign device setup with a dedicated smart-home illustration, an introductory help panel and wide, color-coded connection rows.
- Show controller status above connection choices, retain official Zigbee/Z-Wave logos, and group Bluetooth/Matter separately.
- Adapt the layout to mobile screens and the selected theme. Preserve pairing security, stop/recovery and the final name-and-room dialog.

Prepared locally, not published. Frontend build and eight desktop/mobile pairing and wireless setup tests passed; physical pairing was not repeated on a live hub.

# 1.18.1

- Send radio inventory revisions over the existing authenticated event stream for Zigbee availability, link-quality samples, inventory changes and bridge disconnections, through both MQTT and the Zigbee2MQTT frontend/proxy transport.
- Refresh active protocol lists and device details on radio/controller events instead of waiting for the five-second poll. Preserve polling as a fallback and avoid cancelling in-flight requests on busy networks.
- Coalesce backend notifications at a half-second interval and avoid duplicate availability notifications. Do not infer online status before Zigbee2MQTT reports it.

Prepared locally, not published. Simulated browser events verify visible status updates within 1.5 seconds of event delivery; live installation latency remains to be measured.

# 1.18.0

- Add a final name-and-room dialog after both Zigbee and Z-Wave pairing, including creation of a new room.
- Wait for the exact paired device to appear in the controller registry before allowing save. Update device name and area together; retain entered values after an unconfirmed response.
- Track the paired Z-Wave node ID, display registry names in Zigbee inventory and navigate to the matching protocol overview after saving.
- Reopen unfinished setup when returning to the pairing wizard; closing the dialog does not unpair the device. Completed setup does not reopen.

Prepared locally, not published. Tests use simulated devices; live hardware commissioning remains unverified.

# 1.17.1

- Use locally bundled original Zigbee and Z-Wave logos in protocol banners and tabs, replacing generic symbols and text approximations.
- Use the protocol logo for coordinator/controller images when an actual model or custom image is absent or fails to load, including device details.
- Preserve original brand colors with a neutral backing across themes and document asset provenance.

Prepared locally, not published. Frontend build and mobile/desktop logo checks included.

# 1.17.0

- Redesign Zigbee and Z-Wave overviews with protocol-colored network banners, decorative illustrations and clearer device cards that adapt to light/dark themes and mobile screens.
- Show actual online, offline, sleeping and unknown counts; unavailable network data remains unknown. Do not infer network signal quality from connectivity.
- Add manufacturer search and name/manufacturer/status sorting while keeping newly paired devices first.
- Move Advanced mode beside protocol navigation and place expandable diagnostics below the device list. Preserve device details, images, removal confirmations and pairing navigation.

Prepared locally, not published. Browser regression covers mobile and desktop with simulated radio inventories.

# 1.16.1

- Add an administrator-only restart button under Settings → System, with an explicit confirmation dialog and a demo-disabled state.
- Restart the core service through Supervisor without rebooting the host or other apps. Persist the request ID before dispatch to prevent duplicate requests from restarting twice.
- Distinguish accepted requests from unconfirmed responses after connection loss; never automatically retry or claim the controller has completed restarting.

Prepared locally, not published. Validation uses simulated Supervisor responses; no live controller was restarted.

# 1.16.0

- Add administrator-only Advanced mode to Zigbee and Z-Wave device overviews, embedding the installed controller app's original web interface in a large SMARTi dialog.
- Discover Zigbee2MQTT/Proxy and Z-Wave apps through Supervisor; offer selection for multiple installations and require a running app with Ingress.
- Reuse the current browser's Ingress access; expose only validated same-origin Ingress paths. No arbitrary external URL proxy or Supervisor token is exposed.
- Explain missing/stopped apps and standalone access limitations. External Docker interfaces without Ingress are not supported in this version.

Prepared locally, not published. API and browser tests use simulated apps; actual Ingress sessions and radio UIs still need validation on a live installation.

# 1.15.1

- After successful Zigbee pairing, automatically open the Zigbee device overview and place the new device first with a recently-added label.
- Track the device IEEE address from the interview event and wait for inventory propagation without leaving the user in the pairing wizard.
- Do not redirect for an old completed session when reopening the wizard, or for failed/stopped pairing and removal operations.

Prepared locally, not published. Browser tests cover desktop/mobile with simulated Zigbee events and delayed inventory.

# 1.15.0

- Add Bluetooth and Matter to Add device with dedicated setup dialogs.
- Show Bluetooth discoveries from the controller, including Bluetooth proxies, and continue the manufacturer's integration setup. Closing the dialog preserves shared controller discoveries.
- Commission Matter devices already on the local network using a fresh sharing/setup code, with persistent progress and duplicate-request protection. Codes are not stored.
- Explain phone-based first-time Matter commissioning through the Companion app and Thread border-router requirements; this web interface does not emulate the native phone setup.

Prepared locally, not published. Verified with mocked controller APIs; live Bluetooth/Matter hardware validation remains required.

# 1.14.1

- Show app icons in installed/library cards and larger logos in app dialogs, with icon/logo fallback and a neutral placeholder for missing images.
- Fetch bounded raster images through authenticated fixed Supervisor routes; keep credentials server-side and retain SMARTi self-protection.

Prepared locally, not published.

# 1.14.0

- Add an administrator Apps destination with installed apps, searchable app library and HTTPS repository registration.
- Install, start, stop, restart, update (optionally with backup), and uninstall other controller apps through explicit confirmation dialogs.
- Hide SMARTi and deny all management/configuration operations against the running SMARTi app, self aliases, SMARTi slugs and names. Resolve the actual app identity through Supervisor and fail closed when unavailable.
- Follow background installs/updates through persistent activity records, prevent duplicate request dispatch, and distinguish unconfirmed responses from completed jobs.
- Add advanced JSON configuration, validated by Supervisor before saving, plus boot/watchdog/automatic update switches and stale-configuration protection.
- Keep integration-managed apps protected from uninstall; preserve custom config folders when uninstalling other apps. Requires Supervisor; no fake demo apps.

Prepared locally, not published. Supervisor integration verified with mocks; live hardware validation remains required.

# 1.13.0

- Promote Automations, Integrations and Updates to independent administrator destinations in the main navigation.
- Rename More to Settings and split settings into Home and people, Backups, Network, System, and Theme and appearance.
- Keep location/zones and household together, and move hub metrics, backups and network management into their respective categories.
- Preserve automation unsaved-change protection and administrator-only access. Make navigation horizontally scrollable on phones.
- Fetch settings data for the selected category and poll system status only while its category is open.

Prepared locally, not published.

# 1.12.0

- Replace the embedded location map with an interactive, subdued Leaflet map that adapts to light/dark themes, with a SMARTi marker and zoom controls.
- Drag the marker or tap the map in the location dialog; changes apply only after saving. Coordinate inputs remain available.
- Rename the section to “Hjemmets plassering og soner”. Create, edit and delete stored zones with a map preview, radius and optional automation-only mode.
- Route zone changes through administrator/CSRF-protected controller APIs, validate coordinates and radius, and protect the special home zone and YAML configuration.
- Map tiles use OpenStreetMap and require internet access; locally bundle map code and explicitly allow the tile origin in CSP.

Prepared locally, not published.

# 1.11.1

- Use the creator-supplied transparent SMARTi Hub image without cropping.
- Redesign the hub as a full-width product presentation with integrated metric columns, refined typography and palette-aware surfaces.
- Refine home/location and household panels with larger portraits, balanced spacing and responsive layouts.

Prepared locally, not published.

# 1.11.0

- Place home location and household profiles first in a responsive two-column desktop layout.
- Show the configured home location in an OpenStreetMap embed with a marker, attribution and external-map link. Map viewing requires internet access; allow only the OpenStreetMap frame origin in CSP.
- Display account photos or matched controller person photos, with a person-icon fallback when unavailable.
- Group the official SMARTi Hub product photo, connection/version status and CPU, memory and storage usage into one system overview.
- Color metric icons, charts and labels green below 40%, orange at 40–70%, red above 70%; missing or failed measurements remain unknown. Storage percentage represents used space.
- Retain history inspection and modal editing; remove the duplicate administrator system-status panel.

Prepared locally, not published.

# 1.10.1

- Connect home welcome/photo overlays, home modes, room views, camera overlays, scene tiles, login accents and primary controls to shared palette roles.
- Remove isolated surface/text/accent palettes from the energy stage so it and its settings dialogs inherit the selected light/dark palette.
- Theme energy chart accents and decorative room surfaces. Preserve energy-source, thermostat-mode and warning colors as semantic signals, and preserve brand assets.
- Use a shared contrasting foreground for primary actions in each palette/mode combination.
- Add mobile and desktop coverage for all five palettes in light and dark mode.

Prepared locally; not published.

# 1.10.0

- Show only installable available updates and ongoing installations; hide up-to-date and unsupported update entries.
- Redesign backup management with password confirmation, persistent recent activity, streamed administrator-only downloads and reviewed restoration of full or partial backups.
- Restore the contents recorded in the selected backup after explicit confirmation; keep uncertain results distinct from completion and prevent replay of the same restore request.
- Combine linked SMARTi accounts and controller people into one household list with access labels, profile photos and presence editing. Keep people without login and home-screen visibility settings in this section.
- Refine Settings layout and mobile actions.

Prepared locally. Backup/restore APIs are tested with mocked Supervisor responses; an actual restoration and reconnection must still be validated on a test controller.

# 1.9.0

- Move controller metrics to the top of Settings, add real sampled history behind CPU, memory and storage values, and remove automation cards from this tab.
- Add a three-step user onboarding dialog: login, profile photo/access, review. Provision SMARTi and controller accounts plus a linked household person. Track partial results and reconcile known accounts without replaying uncertain user creation.
- Add profile-photo uploads for accounts and synchronize linked controller person pictures. Passwords are hashed locally; validation responses omit submitted secrets.
- Start password-protected full backups as background Supervisor jobs, with explicit accepted/completed/failed/unconfirmed states.
- Add reviewed IPv4 DHCP/static, gateway, DNS and supported Wi-Fi changes. Preserve IPv6, reject stale configuration, validate addresses and never replay the same write request after an uncertain result.
- Request Supervisor manager role for the new network/backup APIs. No restore, delete, reboot or arbitrary Supervisor proxy is exposed.

Prepared locally. Physical network reconnection, vendor/platform behavior and restore testing still require validation on the target installation.

# 1.8.0

- Add administrator settings for controller CPU/memory, host storage, network interfaces and backup inventory, with explicit unavailable states and no simulated measurements.
- Edit the home's name, coordinates, elevation and time zone in a dialog using the real controller configuration.
- Create, rename, assign presence trackers and remove stored household people; preserve login accounts, existing picture/user associations and YAML-managed people. Reuse presence visibility and photo settings.
- Enable Supervisor API access with the homeassistant role for Core stats and read-only info endpoints. Network configuration and backup creation/restoration are not exposed.

Prepared locally; validation against physical Supervisor hardware remains pending.

# 1.7.0

- Add an integration catalog and modal setup wizard using the controller's real config flows, with translated labels, typed fields, menus, errors, progress, external sign-in, cancellation and completion.
- Bind pending setup flows to the initiating administrator session; keep privileged credentials and completed config-entry data on the backend.
- Unsupported specialized selectors are explicitly blocked with guidance to finish setup in the controller. Demo cannot install integrations.

Prepared locally. Real hardware, vendor OAuth callbacks and version-specific integration schemas require validation on the target installation.

# 1.6.2

- Fix camera live-stream relay through Supervisor by preserving the `/core/api/` upstream prefix for playlists and video segments, including root-relative playlist links.
- Replace the misleading camera HLS-support error with an accurate playback failure message.

Prepared locally; physical HA camera validation remains pending.

# 1.6.1

- Open Home customization, people, calendar, energy display, EV/charger and energy-flow preferences in consistent accessible dialogs without inserting forms into the dashboard layout.
- Selecting an unconfigured energy component opens only its own measurement settings. Complete equipment and flow setup remain available from the toolbar.
- Keep focus inside the dialog, restore it on close, support Escape and prevent dismissal while saving. Keep save errors visible in the dialog; cancelling draft forms does not save changes.

Prepared locally; physical HA validation remains pending.

# 1.6.0

- Recompose Energy as one charcoal scene with a time-aware greeting, actual available weather, floating measurements with recorder-history previews, and compact source/period navigation.
- Refine the pitched graphite house with detailed roof panels and cladding, full-height glazing, a furnished golden-lit living room, a rear annex, slate paving, branching trees and softly illuminated planting.
- Keep physical measurement anchors and separate energy connections, editable equipment visibility, real live values, signed history, pause/reduced motion and WebGL fallback.

Prepared locally; physical HA hardware and native mobile GPU validation remain pending.

# 1.5.1

- Give the graphite energy house a low asymmetric pitched roof, with solar modules and their activity contours fitted to its slope.
- Add warm interior illumination visible through the glazing, retaining the dark site, simple architecture and independent energy connections. Interior lighting is part of the illustration, not a device-state indicator.

# 1.5.0

- Replace the pitched-roof miniature with a minimal graphite pavilion: stepped flat roofs, smoked glazing and restrained architectural lighting. Use a dark slate site and studio background in both app themes.
- Give solar, battery, grid and EV separate paths and physical house terminals instead of one shared outdoor junction. Show household consumption as an interior circuit behind the glass facade.
- Preserve measured directions, equipment visibility, history and pause/reduced-motion behavior. Add route checks for independent terminals and usable curves.

Prepared locally; physical HA energy hardware validation remains pending.

# 1.4.0

- Refine the energy home with a curved anonymous electric fastback, panoramic glazing, sculpted fenders, detailed wheels and studio reflections.
- Fit activity lighting to individual solar-module frames, the battery shell, vehicle/charger and mast insulators. Directional light packets travel smoothly when meter readings change; zero, missing and stale readings remain unlit.
- Anchor desktop measurement labels to the physical equipment with subtle pointers. Refine responsive spacing, measurement cards and separate hourly-history previews.
- Improve the energy-history workspace with readable responsive axes, signed area graphs, visible gaps, interactive inspection and data-coverage indicators.

Prepared locally; live HA recorder and physical energy hardware validation remain pending.

# 1.3.0

- Give the anonymous EV a lower fastback silhouette, smooth nose, glass canopy and narrow headlights, without manufacturer branding.
- Move battery/grid labels closer to their equipment. Add colored pulsing coronas around active solar panels, battery, EV and utility mast; pause, reduced motion, stale/offline/zero readings and hidden components remain respected.
- Add background sparklines and an expandable power-history graph with 24-hour/seven-day periods, pointer/touch/keyboard inspection and signed grid/battery direction. Use recorded hourly means and preserve gaps; align split meters before computing net values.
- Add a dedicated Edit 3D model entry and equipment checklist. Hide optional equipment and its readings/flows, retaining personal mappings for later reuse. A removed sensor does not prevent hiding its component.

Prepared locally; live HA recorder and physical energy hardware validation remain pending.

# 1.2.0

- Rebuild the energy house as a detailed architectural model with recessed glazing, timber, framed solar cells, a sculpted EV, charger, wall battery and utility mast.
- Replace loose grey cables with colored ribbons of light following the site's distribution paths. Moving white highlights show measured direction; missing, stale or zero readings do not light up a connection.
- Add anchored icons and live power readings beside each component. Select a component to open its sensor setup directly; labels remain usable while rotating and on smaller screens. Retain grid/battery direction, battery percentage and personal component visibility.
- Refine measurement summaries and configuration in every palette and both themes. Disconnected responses hide battery percentage and explicitly show offline status.

Prepared locally; live HA energy hardware validation remains pending.

# 1.1.0

- Add a real, locally rendered 3D energy home with solar roof, battery, EV/charger and utility connection. Rotate the view and inspect color-coded power readings; animate flows in their measured direction.
- Configure visible components and W/kW sensors per user. Grid and battery support signed net readings or separate opposite-direction meters, with explicit positive-direction configuration. Optional battery percentage is supported.
- Refresh power readings every five seconds. Missing, invalid, disconnected or stale readings stop the affected flow. Configure freshness from one to 60 minutes; no totals or energy balances are inferred.
- Lazy-load the renderer, pause animation outside the viewport/background, respect reduced motion and preserve readings/configuration when WebGL is unavailable. Existing kWh history remains below the model.

Prepared locally; live HA energy hardware validation remains pending.

# 1.0.0

- Replace thermostat controls with a semicircular target-temperature display, room reading and large +/- buttons. Show mode and HVAC activity separately with heating/cooling/off colors, across Home, rooms and device dialogs. Respect reported steps, bounds and availability; mode switching and dual-setpoint editing are not introduced.
- Add a configurable EV/charger section under Home → Energy. Bind existing battery, range, power, energy and status sensors plus an optional charging switch per user. Missing/offline readings remain explicit; configuration sends no device commands and switching asks for confirmation.
- Provide a setup empty state until a vehicle or charger is connected. No vendor integration, current-limit control or charging schedule is created automatically.

# 0.9.0

Add a calendar to Home with a seven-day date strip, week navigation, today shortcut and expandable daily agenda. Select up to 12 existing calendars per SMARTi user; none are selected initially. Display timed, all-day and multi-day events using the home timezone, with exclusive end dates and explicit loading/offline/partial-failure states. Calendar viewing is read-only; events remain in their existing calendar service.

# 0.8.2

Inspect integration device history with a pointer or touch: show the nearest sampled reading, timestamp, unit and a graph marker. Unknown readings are explicitly labelled. Arrow keys, Home and End navigate readings; changing sensor or period clears the selection.

# 0.8.1

Fix integration device history returning HTTP 422 when the browser explicitly requests 24 hours or seven days. Validate the period as a URL string before converting it to hours. Regression tests cover both explicit periods, the default period and invalid values.

# 0.8.0

- Choose which people appear on Home, with an optional “only home” filter saved per login. Show actual local system profile photos through an authenticated proxy; administrators can upload shared profile overrides or restore system photos.
- Show current weather alongside tomorrow’s daily forecast, including high/low temperature and precipitation when supplied. Use the home timezone and clearly indicate unavailable forecasts.
- Open devices from expanded integrations in a detail dialog with manufacturer, model, room, firmware and supported controls. Inspect sensor and binary sensor history over 24 hours or seven days, with min/max, a graph and readings table; unknown values break the graph.
- Keep photo credentials server-side and enforce administrator access for photo changes and integration device inspection.

Prepared locally; physical HA installation validation remains pending.

# 0.7.1

Use SMARTi names and the bundled SMARTi logo for Home Assistant platform integrations, including Supervisor and hardware variants. Brand expanded integration/device labels, update labels, home/control display names and built-in Norwegian/English copy consistently. Search accepts SMARTi while retaining original integration searches. Preserve original domain/entry/entity IDs, endpoints and saved names; opening and saving an unchanged branded integration name does not rewrite its underlying name. Third-party integrations retain their own logos.

# 0.7.0

- Add SMARTi, Fjord, Forest, Sand and Plum color palettes, each combined independently with light/dark mode. Choose from the header palette menu or More → Settings. Optional browser storage remembers the choice; blocked/full storage cannot prevent rendering.
- Replace individual room device lists with a photographic room overview, real room status, section icons, search and shortcuts. Group lights, climate/air, power/outlets, security, cameras and other controls. Existing controls, confirmations and availability restrictions remain in place.
- Reuse personal room photos, with labelled decorative imagery as a fallback. Large groups expand explicitly, room cameras use the existing visibility-managed live player, and room switching/back navigation stay accessible on mobile and desktop.

Prepared locally; physical HA installation validation remains pending.

# 0.6.0

- Split Home into Overview, Lights, Energy, Security and Climate, with direct tab selection, keyboard navigation and horizontal touch swipes. Gestures starting on controls, video or charts stay with those controls; vertical scrolling remains available.
- Keep greetings, favorite rooms/devices, scenes and security warnings on Overview. Show HA person presence as Home/Away/Unknown without exposing location/tracker metadata; disconnected presence is unknown.
- Group lights and climate devices by room, with search and expandable device lists. Move energy configuration and charging to Energy; camera playback and security controls to Security. Camera players unmount and release their sessions when leaving the tab.
- Retain responsive light/dark styling, accessible tab labels, reduced motion, and clear empty states. No separate dashboard editor.

Prepared locally; physical HA and native Safari testing remain pending.

# 0.5.0

- Replace Home camera stills with authenticated HLS live video, automatic playback while visible, explicit stop/retry and fullscreen. HA credentials remain server-side; streams are scoped to the SMARTi login session. Requires an HA camera with HLS stream support; WebRTC-only cameras are not supported yet.
- Add scene favorites and a three-step creator/editor for lights, switches and climate. Save persistent native HA scenes without activating devices; activation and deletion are explicit. Preserve advanced fields and unsupported devices when editing an existing scene.
- Expand energy into a configurable overview with 24-hour, 7-day and 30-day periods, bar/line charts, previous-period comparisons and individual meter summaries. Use recorder statistics, retain missing-data gaps, and compare only complete periods. Personal choices control meters and visible sections; never sum overlapping meters or invent costs/savings.

Prepared locally. Physical HA camera, recorder and native scene validation remains required.

# 0.4.1

Refresh the built-in Home screen with a photographic welcome area, decorative Scandinavian room images, compact controls, semantic status colors and refined light/dark themes. Personal room photos take precedence over clearly labelled decorative images; all artwork is bundled locally. Improve phone/tablet layouts, navigation, camera previews and real-data energy charts. Show configured routines as actions without implying an active home mode. No new dashboard editor or changes to physical automation execution. Validated locally; physical HA installation validation remains pending.

# 0.4.0

Replace the custom dashboard builder with an automatic, responsive Home overview. Retire dashboard CRUD endpoints (410) and remove the editor; preserve old stored layouts without exposing them. Home discovers weather, room temperatures, security signals, cameras, power/energy meters and charging signals from live registry-backed controls. Add personal favorite rooms/devices/cameras, admin-uploaded room photos, and explicit admin mapping of Home/Away/Night/Holiday to scenes, scripts or automations. Mode activation and lock/cover/scene actions require confirmation. Camera stills are opt-in, authenticated and bounded; HA tokens stay on the server. Add per-meter 24-hour history and configured solar/battery/consumer readings without summing overlapping meters or inventing daily usage. Show observed recent state changes, stale data and unknown security explicitly. Support light/dark themes, phone, tablet and desktop layouts. Live physical HA validation remains pending.

# 0.3.7

Connect flow cards by dragging output to input or selecting ports by touch/keyboard. Preview and confirm sequence changes or combine two action cards into a native HA parallel block. Show compatible targets and explanations for unsupported links. Keep global conditions before actions, reject self/duplicate links and outgoing active stops, and preserve untouched card configuration. New vivid/calm palettes color cards, ports and wires consistently. Connections change the saved automation; visual positions and palette remain session-only. Arbitrary graphs and custom conditional port wiring remain unsupported; edit conditional branches in the subflow editor.

# 0.3.6

Give flow cards distinct orange, blue and green headers with matching connections. Drag cards from their body or handle, pan by dragging the canvas background, toggle the grid and connection lines, and remove cards with confirmation. Moving cards and hiding lines do not alter execution order; removing a card changes the draft until saved. Card positions remain temporary. Validated with frontend unit tests and desktop/mobile browser interaction tests; not tested on physical HA.

# 0.3.5

Add a Homey-inspired automation workspace with connected cards, pointer/touch and keyboard movement, zoom, arrange/reset and a searchable card library. Select cards to edit or open advanced subflows. Preserve the structural and JSON editors. Connections are projected from HA execution order; position changes do not change the automation. Card positions are temporary and arbitrary connector wiring is not implemented. No physical automations were executed during validation.

# 0.3.4

Group integration connections into compact, expandable cards with Home Assistant brand images. Fetch local/custom brand icons through an authenticated backend request, fall back to the official brands CDN on older HA installations, and use an icon when neither source is available. Expand each card to inspect connection-specific devices, rooms, models and administration actions. Search also matches devices and rooms. Count unique devices across connections and support legacy/current HA device registry associations. Existing automation flow improvements are included.

# 0.3.3

Render nested choose/default, if/then/else, repeat count/for_each/while/until, parallel/sequence, logical conditions and wait-trigger branches as expandable flows. Show delay, stop, variables, events and template conditions explicitly. Add targeted nested-step editing and branch additions/removal while preserving untouched configuration, templates and unknown fields. Give advanced action flows full width with quieter surfaces and connection rails. Unsupported fields and blueprints remain accessible through full configuration editing; templates are never evaluated in the browser. No real HA automations were executed during validation.

# 0.3.2

Add a responsive, editable When / And if / Then flow view for existing and newly saved automations, with card editing, additions, removal, ordering and switching to the standard editor without losing configuration. Advanced blocks and additional settings remain visible and preserved; blueprints use the full configuration editor. Replace entity dropdowns with a searchable room-filtered picker, device-type icons, available state labels and keyboard-accessible dialogs. Successful saves refresh the editing revision and keep the flow open. Physical HA validation remains pending.

# 0.3.1

Add a three-step automation guide: choose a time, sunrise/sunset or binary sensor event; select a light/socket by name and room; review a plain-language summary before saving. Supports backtracking, automatic name suggestions and validated selections. Simple compatible routines reopen in the guide. Complex configurations retain the full editor without hiding or discarding settings. Saving does not trigger a test run. HA remains the execution engine; physical installation testing is still required.

# 0.3.0

Add administrator room creation/rename/deletion, device placement and explicit entity area overrides. Add automation creation/editing/deletion, enable/disable and confirmed runs; a visual time/state/sun editor preserves advanced configuration through a full JSON editor. HA remains the execution engine and authority. Automations in separate YAML files that the HA config API cannot edit stay at their source.

Add integration status, rename, enable/disable and reload (new integration setup is deferred by choice). Add update entities with current/latest versions, live progress, confirmed installation and optional supported backup. Names containing Home Assistant display as SMARTi with the SMARTi logo; underlying component identity and versions are unchanged.

Add persistent private and shared dashboards with separate 2/6/12-column phone/tablet/desktop layouts, pointer/touch drag handles, keyboard movement, tile sizing, collision handling, sensor/control/text/heading tiles and revision checks. Residents edit their own private dashboards; admins edit shared dashboards. Existing SQLite data migrates without account reset. Successful logins no longer consume the failed-login rate-limit budget; previous failed attempts remain counted. No live system updates or real HA configuration changes were performed during development; installation validation remains required.

# 0.2.5

Support both HA MQTT and an explicitly configured external Zigbee2MQTT frontend WebSocket, including setups using Zigbee2MQTT Proxy. Add backend-only server/token options and redacted connection diagnostics. Pairing, stop and removal require correlated acknowledgements; no command is replayed after reconnect. HA entity controls still require HA integration. Accept legacy plain online/offline messages and preserve bounded, sanitized telemetry arriving before device inventory. Frontend sample age remains unknown because the stream does not identify cached samples. Hardware/HAOS validation remains pending.

# 0.2.4

Add actual Z-Wave controller state, redacted diagnostics and an explicitly confirmed stop operation for inclusion/exclusion that no longer belongs to a SMARTi session. Distinguish disconnected, unknown and busy states; support named and numeric state values. This supplies recovery and diagnostic tools; the customer's persistent busy state has not been reproduced on hardware.

Add clickable physical device rows with a modal showing model, firmware, network metadata, related sensor readings and supported power/brightness/temperature commands. Use Zigbee2MQTT's official model image catalog, with an icon fallback. Add persistent administrator-uploaded PNG/JPEG/WebP images for either protocol. Automatic Z-Wave JS UI image import is not available via the current HA API. Images and device actions retain session/role/CSRF checks.

# 0.2.3

Fix pairing remaining blocked after stopping Z-Wave inclusion. Wait for delayed controller state, continue stopping when S2 cancellation has already completed, and reconcile unresolved sessions against connected idle controller status. Ignore late events from previous sessions and preserve active interviews. Show separate messages for an unresolved SMARTi session and a busy controller, with visible stopping progress. No start commands are replayed.

# 0.2.2

Add Zigbee and Z-Wave tabs under Devices with physical device inventories, status icons, search and refresh. Show Zigbee LQI when reported, explicitly mark unknown measurement age and distinguish sleeping Z-Wave battery devices from offline nodes. Admins can remove Zigbee devices with a correlated acknowledgement or start a two-minute, stoppable Z-Wave exclusion flow. Controller deletion is blocked. Exclusion recovery markers persist across restarts; a different excluded node is never reported as the selected device. Add new device opens the existing pairing wizard. Real hardware validation remains pending.

# 0.2.1

Add direct Zigbee2MQTT permit-join and Z-Wave JS inclusion from SMARTi, with capability detection, controller selection, bounded search, stop, progress, S2 security approval and PIN entry. Preserve an interrupted-session marker across restarts. Configure zigbee2mqtt_base_topic when using a custom MQTT base topic. Admin access is required. Bluetooth, ZHA and Matter commissioning are not implemented by this release. Real radio/hardware validation is pending; contract and browser tests cover the new flows.

# 0.2.0 (local pilot, unpublished)

Add opt-in mobile API foundations and persistent installation identity. Existing HA UI remains unchanged; mobile access is disabled by default. Add separate Docker relay/connector pilot with nested TLS, single-use pairing, rotating device credentials and revocation. This does not yet provide a native phone app, cloud accounts or a multi-home hosted service. SQLite migration preserves existing accounts/sessions.

# 0.1.3

Support multiple local/external addresses with additional_origins and explicit HTTP Ingress opt-in (HTTPS remains the default). Existing origin settings remain valid. Explain first-run failures separately: HA origin mismatch, setup secret, invalid fields, invalid timezone and network errors. Recover to login when owner creation has succeeded but automatic login fails. Keep origin and setup-secret checks enforced.

# 0.1.2

Fix a blank screen when browser storage is full or blocked. Theme and language remain usable in memory when preferences cannot be saved. Invalid saved values use safe defaults. SMARTi does not clear or evict Home Assistant browser data.

# 0.1.1

Installable through the built-in HA app store from the Git repository. Include a reproducible runtime payload, source/checksum manifest, app logo and direct repository-add link. No manual staging or file transfer is required for users. Build and runtime smoke verification for amd64 and aarch64.

# 0.1.0

Initial development foundation: local accounts, real HA WebSocket adapter, rooms, daily controls, explicit demo, responsive SMARTi design, and initial Ingress packaging. Physical hardware and HAOS validation pending.

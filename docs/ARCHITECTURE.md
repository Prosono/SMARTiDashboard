# SMARTi – løsningsarkitektur

Oppdatert 24. oktober 2026. Dette beskriver implementert struktur i prosjektet, ikke en sanntidskontroll av produksjon eller alle kundehuber.

## Interaktiv oversikt

SMARTi-administratorer finner kartet under **Administrasjon → Arkitektur**, på `/admin/architecture`. Kartet kan filtreres etter lokal styring, fjernaksess, konto/oppsett, energi, varsler og oppdateringer. Klikk en komponent for ansvar, lagring, forbindelser og kildefiler. Både siden og dataendepunktet krever portaladministratorrolle.

Kartets vedlikeholdte datakilde er [`backend/app/architecture.json`](../backend/app/architecture.json). Oppdater denne når en komponent eller dataflyt endres. Ingen kundeidentiteter, nøkler, passord eller private serveradresser skal legges i kartet.

## Viktige grenser

- Home Assistant er autoritet for rom, enheter, entiteter, tilstander og automasjoner. SMARTi gir grensesnitt, tilgangskontroll, sammenstilling og avgrensede administrasjonsoperasjoner.
- SMARTi-backend holder HA-legitimasjonen; nettleseren får ikke dette tokenet. WebSocket/REST brukes mot HA, mens SMARTi-UI får endringsvarsler via SSE og henter oppdatert modell.
- Lokal hubstyring og HA-automasjoner er ikke avhengige av skyreléet. Portal, fjernaksess, eksterne prisdata og eventuelle produsentskyer trenger internett.
- Portaladministrator er ikke samme rolle som eier/administrator inne i kundens hjem. Tilgang til administrasjon gir ikke automatisk adgang til å styre et hjem.
- Fjernaksess har to transportlag: huben kobler ut til WSS-reléet; hjemmets HTTPS fraktes gjennom tunnelen og avsluttes på huben. Reléet ser forbindelsesmetadata og trafikkmengder, men terminerer ikke hjemmets HTTPS. Portalens HTTPS avsluttes ved Caddy.
- Konto- og energidata i skyen er separate fra hubens SMARTi-database og HA Recorder. Synkronisering av energi betyr ikke at all HA-historikk eller alle sikkerhetskopier speiles til skyen.
- Enkel/normal/avansert er presentasjonsvalg, ikke en erstatning for autorisasjon. Kommandoer og administrasjon valideres på backend.

## Komponenter og ansvar

### Brukere og klienter

**Nettleser / SMARTi UI** — React · TypeScript · Vite

Kundens grensesnitt for rom, enheter, automasjoner, energi og rapporter. Henter modeller fra hubens API og får endringsvarsler via SSE. Portalen er en egen nettflate.

Lagring: Nettleserøkt og visningsvalg. HA-token holdes på backend.

**SMARTi for iPhone** — SwiftUI · WKWebView

Viser SMARTi, finner huber på lokalnettet og skanner QR-koder. Native funksjoner omfatter telefonparing, posisjon og varsler. Distribueres via TestFlight.

Lagring: Telefonlegitimasjon i Keychain; samtykkestyrte telefonfunksjoner.

**SMARTi-administrator** — Administrasjon på home.smarti.dev

Administrerer kunder, huber, QR-etiketter, support og priser. Portalrollen er separat fra kundens lokale administratorrolle og gir ikke automatisk styring av hjemmet.

Lagring: Ingen egen database; bruker skyens tilgangskontrollerte API.

### SMARTi i skyen

**Internettinngang** — HAProxy · Caddy · DNS

HAProxy ruter på TLS-vertsnavn. Portaltrafikk går til Caddy og skytjenesten. Hjemmenes HTTPS-trafikk går til reléet. Caddy tar også imot hubens utgående WSS-forbindelse.

Lagring: Sertifikater for portal og rutekonfigurasjon. Hjemmets TLS avsluttes på huben.

**SMARTi-sky / portal** — FastAPI · home.smarti.dev

Kontoer, verifisering, eierskap, QR-aktivering, onboarding, support, invitasjoner, reset-koordinering og energiarkiv. Tilgang kontrolleres per konto og hjem.

Lagring: SQLite: kontoer, hjem, medlemskap, support, revisjonslogg, energiarkiv og prisdata.

**Fjernaksess-relé** — Utgående tunnel fra huben

Knytter hjemmeadressen til riktig hub og frakter krypterte bytes. Huben oppretter forbindelsen ut; kunden trenger ikke portåpning i ruteren. Reléet kan se trafikkmengde og forbindelsesmetadata.

Lagring: Egen SQLite for trafikkhistorikk. Leser tilgangsgrunnlag fra skyens database.

**Skyens databaser** — SQLite · vedvarende Docker-volumer

Kontodata og energiarkiv ligger i kontovolumet. Trafikkhistorikk ligger i et separat volum som portalen leser. Dette er separate data fra HA sin historikk på kundens hub.

Lagring: cloud.sqlite og traffic.sqlite. Tilgang avgrenses i API-et.

### Kundens hub

**SMARTi på huben** — FastAPI · lokal backend

Håndterer tillatelser, lokale økter, UI-modeller, rapporter, energiinnsamling og validerte kommandoer til HA. Lokal styring trenger ikke reléet; skyfunksjoner trenger internett.

Lagring: Lokale brukere, innstillinger, bilder og energiarkiv. HA-legitimasjon forblir her.

**Hubens fjernforbindelse** — WSS · lokal HTTPS

Autentiserer huben mot skyen og holder en utgående tunnel åpen. Hjemmets HTTPS avsluttes lokalt på huben, ikke i skyreléet.

Lagring: Installasjonsidentitet, tilkoblingslegitimasjon og hjemmets TLS-sertifikat.

**Home Assistant** — Tilstander · registre · automasjoner

Autoritet for enheter, rom, entiteter, tilstander og automasjoner. SMARTi leser via WebSocket/REST og sender kontrollerte tjenestekall. HA-automatiseringer kjører også når SMARTi-grensesnittet er lukket.

Lagring: HA-konfigurasjon og Recorder-historikk, separat fra SMARTi-databasen.

**HA OS / Supervisor** — Apper · oppdatering · sikkerhetskopier

Kjører og administrerer SMARTi og andre HA-apper. SMARTi tilbyr avgrensede administrasjonsoperasjoner for blant annet oppdateringer og reset.

Lagring: Appdata, sikkerhetskopier og systemkonfigurasjon på hubens lagring.

**Lokale arkiver** — SMARTi SQLite + HA Recorder

SMARTi lagrer egne innstillinger og energiintervaller. Huslogg og tilstandshistorikk hentes fra HA. Energiarkiv kan synkroniseres til skyen; all HA-historikk speiles ikke automatisk.

Lagring: Lokalt SMARTi-arkiv og HA sin konfigurerte Recorder-database.

### Enheter og eksterne tjenester

**Enheter og integrasjoner** — Zigbee · Z-Wave · Wi-Fi · Matter

Sensorer, lys, varme, låser, kameraer og andre enheter når SMARTi gjennom HA-integrasjoner. Zigbee2MQTT/MQTT og Z-Wave JS håndterer sine radionettverk. Tilgjengelige funksjoner avhenger av integrasjonen. Enkelte produsentintegrasjoner bruker produsentens sky; andre er helt lokale.

Lagring: Paringer og nettverksnøkler i respektive radio-/integrasjonssystemer.

**Pris- og tariffkilder** — Hva koster strømmen · Fri Nettleie

Skyen henter spotprisdata fra Hva koster strømmen og tariffdata fra Fri Nettleie. SMARTi beregner kostnader med målegrunnlaget og valgte avtaler. Dette er ikke en direkte Elhub-forbindelse.

Lagring: Pristabeller og kildeinformasjon caches i skyen.

**E-postleverandør** — SMTP · SendGrid-oppsett

Sender bekreftelser, passordlenker og invitasjoner via konfigurert SMTP. Skyen håndterer utkø og nye forsøk. Leverandøren får mottaker og e-postinnhold.

Lagring: Midlertidig utkø i skyen; leverandørens egen behandling kommer i tillegg.

**Apple-tjenester** — APNs · TestFlight

APNs leverer iPhone-varsler når leverandør og signering er konfigurert. TestFlight distribuerer iPhone-bygg. Dette er eksterne tjenester, ikke lokal hubstyring.

Lagring: APNs-enhetstoken og varseldata behandles i varslingskjeden.

**Utgivelser og sertifikater** — GitHub · HA app-repository · ACME

SMARTi-kilde og HA-apppakke distribueres via GitHub. Supervisor håndterer appoppdatering. Huben bruker ACME / Let’s Encrypt for hjemmets HTTPS-sertifikat.

Lagring: Versjoner og pakkemanifest; sertifikatnøkler på huben.

## Hovedflyter

1. **Lokal styring:** nettleser/iPhone → SMARTi på huben → HA → integrasjon/enhet. Tilstandsoppdateringer går tilbake til grensesnittet.
2. **Fjernstyring:** klient → HAProxy → relé → hubens utgående tunnel → lokal HTTPS/SMARTi → HA. WSS-forbindelsen etableres av huben via Caddy.
3. **Konto og oppsett:** kunde → portal → kontodatabase; QR/aktivering og onboarding koordineres med huben. E-post sendes via SMTP.
4. **Energi:** HA/måler → lokalt SMARTi-arkiv → skyarkiv. Skyen henter pris-/tariffgrunnlag fra eksterne kilder. Ufullstendige målinger må ikke presenteres som null eller komplette kostnader.
5. **Varsler:** hub → SMARTi-sky → konfigurert APNs → iPhone. Levering avhenger av konfigurasjon og Apple-tjenesten.
6. **Oppdatering:** GitHub/HA-apprepository → Supervisor → SMARTi-app på huben. iPhone-bygg distribueres separat gjennom TestFlight.

## Utenfor dagens implementerte kart

Android, meshing, direkte native Matter-commissioning og Elhub er ikke aktive komponenter i dette diagrammet. Se [TODO](TODO.md). Eksisterende Matter-enheter kan likevel nås gjennom HA-integrasjoner.

## Videre dokumentasjon

- [Sikkerhet](SECURITY.md)
- [Fjernaksess og drift](REMOTE_ACCESS.md)
- [Energi og beregningsgrunnlag](energy-platform.md)
- [Fabrikkreset](FACTORY_RESET.md) og [kloning/klargjøring](FACTORY_IMAGE.md)
- [iPhone](../ios/README.md)

Den eldre [Docker-piloten](MOBILE_PILOT.md) beskriver en separat demonstrasjon og skal ikke brukes som dagens produksjonsarkitektur. Detaljdokumentene inneholder også daterte historiske implementasjonsnotater.

## Publisering av kartet

24. oktober 2026: publisert på home.smarti.dev som portalimage `smartihome:architecture-20261024`, basert på det eksisterende portalimaget. Bare portalcontaineren ble oppdatert; ingen huboppdatering eller reléendring. Helsesjekk og portal svarte 200; arkitektursiden og dataendepunktet svarte 401 uten innlogging. Lokal test bekreftet 403 for kundekontoer og tilbakekalt administratorrolle. Konfigurasjonskopi på serveren: `compose.before-architecture-20261024.yaml`.

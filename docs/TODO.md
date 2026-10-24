# SMARTi – gjenstående arbeid og roadmap

Oppdatert 24. oktober 2026, etter versjon 1.36.26. Listen gjelder avtalt videre arbeid, ikke en plan om å starte alle punktene nå. Ingen leveringsdatoer eller automatisk overvåking er avtalt.

## Mobilapp og Matter

**Levert:** SMARTi har en egen iPhone-app distribuert via TestFlight. Mobilapp og fjernaksess er derfor ikke lenger bare en lokal pilot. Offentlig App Store-distribusjon og Android er ikke bekreftet levert.

- [ ] Fullføre offentlig distribusjon av iPhone-appen.
- [ ] Lage og distribuere Android-appen. PWA er valgt bort.
- [ ] Implementere native Matter-oppsett uten Companion-appen: «Legg til → Matter», skann QR-kode, gjennomfør telefonens systemdialog, koble enheten til hubens Matter-server og velg navn/rom.
- [ ] Integrere Apple MatterSupport og Androids commissioning-API med SMARTi-backend.
- [ ] Håndtere Wi-Fi-/Thread-oppsett, tillatelser, avbrudd og tilkoblingsfeil. Test hele prosessen på fysiske telefoner og Matter-enheter. Thread krever en kompatibel grenseruter.

**Avgrensning:** Nettvisningen støtter Matter-kode for enheter som allerede er på nettverket. Førstegangsoppsett av helt nye enheter henvises foreløpig til Companion. Bluetooth-oppsett via hub/proxy er en separat funksjon. Se [iPhone-appen](../ios/README.md).

## Tilgang, hubber og oppsett

**Levert:** Kundeportal på home.smarti.dev, konto- og hubregistrering, QR-basert oppsett, flere hjem per konto, medlemsinvitasjoner og fjernaksess. De gamle oppgavene om å opprette en offentlig portal og gå videre fra en lokal Docker-pilot er tatt ut av listen.

- [ ] Tidsbegrenset gjestetilgang: tilgang til utvalgte deler av hjemmet med automatisk utløp.
- [ ] Forenkle oppsettet videre: færre steg fra ny hub til et ferdig hjem.
- [ ] Meshing: flere hubber i samme hjem med samlet styring på tvers av hubber. Dette er noe annet enn flere separate hjem på én konto.
- [ ] Selvbetjent erstatning/rotasjon av mistet eller kompromittert QR-aktiveringskode, med eierskapskontroll og revisjonslogg.

Se [fjernaksess](REMOTE_ACCESS.md), [fabrikktilbakestilling](FACTORY_RESET.md) og [klargjøring av fabrikkimage](FACTORY_IMAGE.md). [Docker-piloten](MOBILE_PILOT.md) beskriver den historiske, isolerte demonstrasjonen; den er ikke status for dagens kundeløsning. Eldre statusavsnitt i dokumentasjonen må leses med dato og versjon i mente.

## Energi og fleksibilitet

**Levert:** Energioppsett, utstyrsvalg, 3D-oversikt, forbruks- og prishistorikk, kostnadsberegning og rapporter. Norsk strømpris, nettleie og effekttopper er delvis implementert; dette skal videreutvikles, ikke bygges fra bunnen.

- [ ] Videreutvikle dekning og kvalitet for norske strømavtaler, nettselskaper, nettleie og effekttopper. Åpne datakilder prioriteres.
- [ ] Tilrettelegge for fleksibilitetsmarkedet, fremtidige tjenester og samarbeidspartnere.

**Elhub:** Fjernet fra energioppsettet etter ønske. Ikke en aktiv leveranse. Eventuell senere integrasjon krever egen beslutning, virksomhetsavtale, Maskinporten-tilgang og kundens samtykke.

Se [energiplattformen](energy-platform.md) for beregningsmodell og dokumenterte begrensninger. Eldre implementasjonsnotater må sammenholdes med senere utgivelser.

## Zigbee2MQTT – direkte og via proxy

- [ ] Gjenoppta feilsøkingen av paring og enhetsinformasjon med Zigbee2MQTT Proxy og nettverkstilkoblet koordinator.
- [ ] Verifisere både direkte oppsett og proxy: oppdagelse, MQTT-forbindelse/base topic, permit join og oppdaterte enhetsdata.
- [ ] Teste begge oppsettene mot faktisk installasjon før problemet regnes som løst.

**Status:** Utsatt etter brukerens ønske. Proxy som årsak er en hypotese, ikke en bekreftet diagnose.

## Robotstøvsugere

**Levert:** Grunnstyring og bruk av eksisterende romkoblinger i 1.35.0.

- [ ] Kartvisning.
- [ ] Opprettelse av romkoblinger i SMARTi.
- [ ] Produsentspesifikk mopping, tømming og stasjonsvedlikehold der integrasjonen støtter det.

Funksjonene må bygge på faktisk tilgjengelige HA-entiteter/API-er per integrasjon, ikke antakelser om støvsugermerket.

## HACS / Community Store / Marketplace – avventes

- [ ] Vurdere integrasjon når den omtalte nye løsningen er offisielt lansert. Bekreft navn, tilgjengelighet og støttede API-er da.
- [ ] Deretter avklare søk, installasjon, oppdatering og administrasjon i SMARTi.

**Beslutning:** Avvent offisiell lansering. Ikke baser implementasjonen på et antatt navn eller en utviklingsversjon. Lanseringsstatus er ikke undersøkt på nytt som del av denne oppryddingen.

## Nylig levert – ikke åpne TODO-punkter

- Rapporter og innsikt for hele hjemmet, samlet med huslogg i sidepanelet.
- SMARTi-logo og animert lastevisning ved rapportgenerering.
- Tilstedeværelse, lysstatistikk, temperatur og luftfuktighet fra lagret historikk.
- Nytt rapportdesign i 1.36.26: tydelige nøkkeltall, målerkort, oppfølgingspunkter, forbruksgraf og hendelsesvedlegg, tilpasset mobil og utskrift.

Se [utgivelsesloggen](../ha-app/CHANGELOG.md) for full historikk over leverte endringer. «Levert» betyr implementert/publisert i angitt kanal, ikke at alle enheter og integrasjoner er ferdig felttestet.

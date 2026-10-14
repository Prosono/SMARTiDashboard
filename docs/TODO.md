# SMARTi – utsatt arbeid

Oppdatert 14. oktober 2026. Dette er en huskeliste over arbeid vi har avtalt å ta senere, ikke en plan om å starte det nå. Ingen automatisk overvåking eller publisering er satt opp.

## Egen mobilapp og direkte Matter-oppsett

- [ ] Lage og distribuere SMARTi som egen iOS-/Android-app. PWA er valgt bort.
- [ ] Implementere native Matter-oppsett slik at kunden slipper Companion-appen: «Legg til → Matter», skann QR-kode, gjennomfør telefonens systemdialog, koble enheten til hjemmesentralens Matter-server og velg navn/rom.
- [ ] Integrere Apple MatterSupport og Androids commissioning-API med SMARTi-backend. En enkel innpakking av nettsiden gir ikke denne funksjonen.
- [ ] Håndtere Wi-Fi-/Thread-oppsett, tillatelser, avbrudd og tilkoblingsfeil. Test hele prosessen på fysiske iOS-/Android-telefoner og Matter-enheter. Thread krever en kompatibel grenseruter.

**I dag:** Nettvisningen støtter Matter-kode for enheter som allerede er på nettverket. Førstegangsoppsett av helt nye enheter henvises foreløpig til Companion. Bluetooth-enhetsoppsett via hjemmesentralen/proxy er en separat funksjon.

## Fjernaksess for komplette SMARTi-produkter

- [ ] Videreføre den lokale Docker-piloten til en løsning for kundene våre, med egen mobilapp og tilgang både hjemme og utenfra.
- [ ] Klargjøre Docker-image for egen server og senere domene, for eksempel `app.smarti.dev`. Domenet er et eksempel, ikke en besluttet eller publisert adresse.
- [ ] Fullføre kunde-/hubregistrering, sikker telefonparing, valg mellom lokal og ekstern forbindelse, sertifikathåndtering og drift for flere hjem.

**Status:** Pilot finnes, men offentlig publisering og videre produktarbeid er utsatt. Se [mobil- og fjernaksesspiloten](MOBILE_PILOT.md) for eksisterende funksjoner og begrensninger.

## HACS / Community Store / Marketplace

- [ ] Vurdere integrasjon når den omtalte nye løsningen faktisk er offisielt lansert. Bekreft navn, tilgjengelighet og støttede API-er på det tidspunktet.
- [ ] Deretter avklare hvordan søk, installasjon, oppdatering og administrasjon skal vises i SMARTi.

**Beslutning:** Avvent offisiell lansering før vi tar dette inn. Ikke baser implementasjonen på et antatt navn eller en utviklingsversjon.

## Zigbee2MQTT – direkte og via proxy

- [ ] Gjenoppta feilsøkingen av paring og innhenting av enhetsinformasjon i brukerens oppsett med Zigbee2MQTT Proxy og nettverkstilkoblet koordinator.
- [ ] Verifisere støtte for både direkte Zigbee2MQTT-oppsett og proxy-oppsett: oppdagelse, MQTT-forbindelse/base topic, permit join og oppdaterte enhetsdata.
- [ ] Teste begge oppsettene mot faktisk installasjon før problemet regnes som løst.

**Status:** Brukeren ba om å ta Zigbee-problemet senere. Proxy som årsak er en hypotese, ikke en bekreftet diagnose.

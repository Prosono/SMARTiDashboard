# Internt produksjonsvalg: Klargjør master-image for kloning

Dette er **ikke** et ekstra valg under kundens fabrikktilbakestilling. Verktøyet
`python3 scripts/prepare_factory_image.py` finnes kun i produksjonsrepoet, ikke i
HA-appens payload, kundegrensesnitt eller noen HTTP-rute. Det krever tilgang til
SMARTis datamappe på en avslått, separat montert master-SSD. Vanlig eller avansert
SMARTi-admin gir ikke denne tilgangen. En operatør med fysisk disk-/roottilgang
kan naturligvis endre filer; dette er ingen sikkerhetsgrense mot maskinens root.

## Arbeidsflyt

1. Installer en versjon som støtter factory image (1.35.84 eller nyere).
2. Bruk en dedikert test-/produksjonsmaster uten kundedata. Kjør full reset med
   frigivelse av eierskap. Vent på omstart og «venter på ny eier». Bekreft også
   i sentral administrasjon at masteren er frigitt.
3. Tøm `remote_installation_id`, `remote_credential` og `bootstrap_secret` i
   HA-appens konfigurasjon. Noter masterens **fysiske Ethernet-MAC**; ikke en
   Docker-/virtuell adresse. Ikke start nytt kundeoppsett.
4. Slå av huben. Monter SSDen på produksjonsmaskinen. Finn SMARTi-addonens
   datamappe (mappen med `options.json` og `smarti-live.sqlite3`).
5. Kontroller uten å endre noe:

   ```sh
   python3 scripts/prepare_factory_image.py --data-dir /ABSOLUTT/STI/TIL/SMARTI-DATA --source-mac aa:bb:cc:dd:ee:ff
   ```

6. Forsegl med samme argumenter pluss `--prepare-master-image --confirm-offline-ssd`.
   Dette sletter SMARTis lokale database, gamle identiteter, nøkler, sertifikater
   og reset-journaler. Bare addon-options og en ikke-hemmelig oppstartsmal beholdes.
   Det endrer ingen andre huber eller skyregistreringer.
7. Ta SSD-imaget **nå**, før oppstart på en annen hub. Ikke lag nytt master-image
   fra en kopi som allerede er startet eller aktivert. SMARTi nekter oppstart på
   den opprinnelige masterens MAC etter forsegling.
8. Skriv det forseglede imaget til nye SSDer. Hver fysiske hub får en egen
   QR-etikett fra administrasjonen. Ved oppstart opprettes tilfeldige individuelle
   enhets-/registreringsnøkler og en egen nøkkel for kryptert HA-eieroppsett.
9. Kunden finner huben lokalt, skanner etiketten og gjennomfører vanlig onboarding.
   Gjenopprettingskontoen fra reset fjernes før kundens HA-eier opprettes.

Oppstart uten identifiserbart fysisk nettverkskort stoppes. Den genererte
identiteten beholdes ved senere omstarter. Kloning av en allerede startet kopi
støttes ikke: bruk alltid det forseglede originalimaget.

## Avgrensning og akseptansetest

Dette klargjør **SMARTis identitet**, ikke et generelt anonymiseringsverktøy for
hele HAOS-SSDen. Ikke bruk en tidligere kundes SSD som produksjonsmaster.
Kontroller separat at HA Cloud, nettverksoppsett, SSH, radioappar og andre addons
ikke inneholder kundekontoer, gamle paringer eller nøkler som ikke skal kopieres.
En reset som beholder radioenes paringer er ikke alene en garanti for et rent
produksjonsimage.

Før serieproduksjon: klon samme forseglede image til to testhuber; kontroller ulike
Bonjour-IDer; bruk to nye QR-etiketter; fullfør begge oppsett; kontroller egne
HA-eiere, fjernaksess og radiointegrasjoner. Start begge på nytt og bekreft stabil
identitet. Test at gjenopprettingskontoen er borte. Programvaretestene dekker
uavhengige nøkler, omstart, masterblokkering og QR-/kryptert oppsettkobling;
faktisk HAOS/SSD-kloning må fortsatt verifiseres på maskinvare.

Ved avbrutt forsegling: ikke distribuer imaget; gjenopprett produksjonsmasteren
og gjennomfør reset/forsegling på nytt. Delvis forsegling blokkerer oppstart.

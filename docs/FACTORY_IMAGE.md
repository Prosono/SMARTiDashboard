# Produksjonsreset fra appen — RESTORE WIPE

Fra 1.35.85 er anbefalt produksjonsflyt:

1. I **sentral administrasjon → Huber → Se detaljer → Internt · produksjonsklargjøring**,
   aktiver produksjonstilgang på masterhuben. Tilgangen gjelder én reset i 30 minutter.
2. I hubens reset-dialog velger du **Klargjør for ny eier**, bekrefter advarslene
   og skriver **RESTORE WIPE** i stedet for RESET HUB. Produksjonshjelpen vises bare
   når sentral administrasjon har gitt akkurat denne huben tilgang.
3. Huben kjører full reset og OS-omstart. Etter omstart bekreftes frigivelse i skyen,
   Supervisor-options tømmes for fjernidentitet/bootstrap, og SMARTis lokale data,
   sertifikater, identitet og gamle reset-journaler fjernes. En produksjonsmarkør beholdes.
4. Når huben igjen er tilgjengelig for lokalt søk, er produksjonsmodus aktiv.
   Slå av før SSD-kopiering. **Ikke skann QR eller start kundeoppsett på masteren.**
5. Skriv samme image til nye huber. Hver skal ha egen registrering/QR-etikett.
   En kopi med annet fysisk nettverkskort får nye tilfeldige SMARTi-nøkler før
   nettverkstilkoblingen startes. På samme hub fornyes nøklene ved SMARTi-oppstart
   så lenge den ikke er QR-koblet. Ved rent HA Core-restart uten omstart av SMARTi
   er det ikke nødvendig å bytte identiteten.
6. Ved QR-kobling lagres den nye identiteten varig og produksjonsmodus slås av.
   Om strømmen går mellom QR-claim og mottak av identiteten, hentes eksisterende
   kobling før nøklene roteres. Ved manglende internett beholdes samme fysiske hubs
   ventende identitet slik at dette ikke brytes. Kopier på annen maskinvare gjenbruker
   aldri masterens ventende registrering.

Fra 1.35.86 oppretter kundeoppsettet seks tilfeldige Z-Wave-sikkerhetsnøkler
(S0, tre S2-klasser og to Long Range-klasser) etter QR-kobling og radiotilkobling.
Z-Wave JS UI startes på nytt og lagringen kontrolleres før oppsettet fullføres.
Kontrolleren må være tom for parede enheter; ellers stoppes dette steget.
Fjern gamle paringer manuelt før produksjonsklargjøring. Home ID endres ikke.
Nøklene beholdes ved retry/omstart og vanlig reset. En lokal journal med modus 0600
sikrer at et avbrutt forsøk gjenbruker samme nøkler; den fjernes etter kontroll.
API-autentisering eller eksternt administrerte nøkler overstyres ikke: oppsettet
stoppes med en feilmelding dersom SMARTi ikke får lagret og kontrollert nøklene.
Test også Z-Wave-paring på begge faktiske kloner før serieproduksjon.

Vanlige lokale administratorer får ikke produksjonstilgang bare ved å kjenne teksten.
Backend kontrollerer sentral tillatelse før reset og skytjenesten forbruker tillatelsen
før sletting. Supportøkter er fortsatt blokkert. Ingen generelle produksjonsrettigheter
ligger i imaget, og originalens trykte QR-etikett kan knyttes på nytt etter wipe.

Dette forutsetter dedikert produksjonsmaster uten kundedata. Radio-paringer og andre
HA-apper renses ikke av denne funksjonen. Etter oppdateringer kan samme master brukes
igjen: dersom den er tatt i bruk og QR-koblet, aktiver ny produksjonstilgang og kjør
RESTORE WIPE på nytt. Ikke klon et image etter kundeoppsett.

Programvaretester dekker tillatelser, isolering av kopier, nøkkelrotasjon, skyfeil og
avbrutt QR-kobling. Test to faktiske SSD-kopier, hele onboardingløpet og radioene før
serieproduksjon. Ingen fysisk reset utføres ved installasjon av denne programvaren.

---

# Alternativt offline-verktøy

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

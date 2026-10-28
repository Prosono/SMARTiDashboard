# Godkjenning av systemoppdateringer

Implementert for hubpakke 1.36.39 og tilhørende skyendring. Må publiseres på både sky og hub før flyten er aktiv; eldre hubversjoner har ikke sperren.

## Arbeidsflyt

1. Åpne `/admin/updates` med en portaladministratorkonto.
2. Core-, OS- og Supervisor-versjoner rapporteres av tilknyttede huber omtrent hvert minutt. En versjon kan også registreres manuelt før den dukker opp på hubene.
3. Test versjonen på en testhub via Home Assistant. Noter testresultatene på versjonskortet.
4. Velg «Godkjenn for kunder» og bekreft. Godkjenningen gjelder nøyaktig komponent og versjonsstreng.
5. Godkjenningen kan trekkes tilbake. Dette stopper nye installasjonsforespørsler, men avbryter ikke pågående oppdateringer og nedgraderer ikke installerte huber.

## Avgrensning og drift

- Gjelder HA Core, Home Assistant OS og Supervisor i SMARTis systemoppdateringsliste. SMARTi-appen selv, tillegg og enhetsfastvare omfattes ikke.
- Direkte HA-administrasjon, HA-automasjoner og HAs egen automatikk omfattes ikke av denne sperren. Kontroller derfor automatisk oppdatering i HA ved klargjøring av kundehuber.
- Alle nye kandidater er ugodkjente. Rapportering fra en hub kan verken godkjenne eller trekke tilbake en versjon.
- Godkjenningslisten hentes over HTTPS. Lokal liste har kort levetid (60 sekunder mellom oppslag, maksimalt 120 sekunder gyldighet). Installasjon gjør alltid et nytt oppslag. Nettfeil, ugyldig svar eller manglende skytjeneste blokkerer systemoppdateringer.
- Installasjon krever fortsatt at versjonen er den HA rapporterer som tilgjengelig. Core og OS støtter versjonsvalg; godkjent versjon sendes eksplisitt når HA støtter dette. Supervisor tilbyr bare installasjon av gjeldende nyeste versjon, og kontrolleres derfor mot fersk HA-status før forespørselen.
- Portaladministrasjon og godkjenning krever serverkontrollert rolle og CSRF. Hver beslutning logges i `admin_audit`. Historikk og notater lagres i skyens SQLite-tabell `system_releases`.
- Publiser skyendringen først, test/registrer/godkjenn ønskede versjoner, og distribuer deretter hubpakken. Ingen versjoner blir automatisk godkjent ved migrering.

Identifikasjon bygger på hassio-registerets stabile `unique_id` og integrasjonens systemtittel som reserve. Se Home Assistants kildekode: `homeassistant/components/hassio/entity.py` og `update.py`.

## Installerte versjoner (1.36.40)

Admin → Oppdateringer viser installerte versjoner per hjem/hub, med rapporteringstid. Huben sender et øyeblikksbilde fra HAs update-entiteter hvert minutt, også når ingen oppdatering er tilgjengelig. Komponenter uten rapportert installert versjon vises som «Ikke rapportert», og rapporter eldre enn fem minutter merkes. SMARTi-appversjon rapporteres når HA eksponerer appens update-entitet med tittelen SMARTi. Opplysningene er kun tilgjengelige for portaladministratorer. Krever ny skyversjon og hubpakke 1.36.40.

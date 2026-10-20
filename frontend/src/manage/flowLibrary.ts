import type { FlowKind } from "./flowPresentation";
export function newFlowStep(kind: FlowKind, type: string): Record<string, any> {
  if (kind === "triggers") {
    if (type === "time") return { trigger: "time", at: "20:00:00" };
    if (type === "sun") return { trigger: "sun", event: "sunset" };
    if (type === "numeric_state")
      return { trigger: type, entity_id: "", above: 0 };
    return { trigger: "state", entity_id: "", to: "on" };
  }
  if (kind === "conditions") {
    if (["and", "or", "not"].includes(type))
      return { condition: type, conditions: [] };
    if (type === "time")
      return { condition: "time", after: "18:00:00", before: "23:00:00" };
    if (type === "sun") return { condition: "sun", after: "sunset" };
    return {
      condition: type,
      entity_id: "",
      ...(type === "state" ? { state: "on" } : { above: 0 }),
    };
  }
  if (type === "notify.mobile_app_") return { action: type, data: { title: "SMARTi", message: "" } };
  if (type === "delay") return { delay: 60 };
  if (type === "if") return { if: [], then: [], else: [] };
  if (type === "choose")
    return { choose: [{ conditions: [], sequence: [] }], default: [] };
  if (type === "repeat") return { repeat: { count: 2, sequence: [] } };
  if (type === "parallel")
    return { parallel: [{ sequence: [] }, { sequence: [] }] };
  if (type === "wait_for_trigger")
    return {
      wait_for_trigger: [],
      timeout: "00:05:00",
      continue_on_timeout: false,
    };
  if (type === "stop") return { stop: "" };
  return {
    action: type,
    target: { entity_id: "" },
    ...(type === "climate.set_temperature"
      ? { data: { temperature: 21 } }
      : {}),
  };
}
export function flowLibrary(kind: FlowKind, lang: string) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const rows =
    kind === "triggers"
      ? [
          [
            "time",
            t("Et klokkeslett", "A time of day"),
            t("For eksempel klokken 20:00.", "For example, at 20:00."),
          ],
          [
            "sun",
            t("Solen står opp eller går ned", "Sunrise or sunset"),
            t("Følger soltidene der du bor.", "Follows the sun at your home."),
          ],
          [
            "state",
            t("Noe endrer seg", "Something changes"),
            t(
              "En dør åpnes, bevegelse oppdages eller noen kommer hjem.",
              "A door opens, motion is detected or someone comes home.",
            ),
          ],
          [
            "numeric_state",
            t("En måling passerer en grense", "A reading crosses a threshold"),
            t(
              "Temperatur, lysnivå eller en annen måling.",
              "Temperature, light level or another measurement.",
            ),
          ],
        ]
      : kind === "conditions"
        ? [
            [
              "state",
              t("En bestemt tilstand", "A particular state"),
              t(
                "For eksempel at noen er hjemme eller døren er lukket.",
                "For example, someone is home or a door is closed.",
              ),
            ],
            [
              "numeric_state",
              t("En måling er over eller under", "A reading is above or below"),
              t(
                "Sjekk en temperatur eller annen måling.",
                "Check a temperature or another reading.",
              ),
            ],
            [
              "time",
              t("Innenfor et tidsrom", "Within a time window"),
              t("Kjør bare på bestemte tider.", "Only run at certain times."),
            ],
            [
              "sun",
              t("Før eller etter solen", "Before or after the sun"),
              t(
                "For eksempel bare etter solnedgang.",
                "For example, only after sunset.",
              ),
            ],
            [
              "or",
              t("Minst ett krav passer", "Any requirement matches"),
              t(
                "Lag alternative krav med ELLER.",
                "Combine alternative requirements with OR.",
              ),
            ],
            [
              "and",
              t("Alle krav passer", "All requirements match"),
              t(
                "Samle krav som må stemme samtidig.",
                "Group requirements that must all be true.",
              ),
            ],
            [
              "not",
              t("Ingen av kravene passer", "None of the requirements match"),
              t("Utelukk bestemte situasjoner.", "Exclude certain situations."),
            ],
          ]
        : [
            [
              "light.turn_on",
              t("Slå på lys", "Turn on lights"),
              t(
                "Velg lys og tilpass styrken.",
                "Choose lights and adjust brightness.",
              ),
            ],
            [
              "notify.mobile_app_",
              t("Send notifikasjon til SMARTi-appen", "Send a notification to the SMARTi app"),
              t("Velg bruker og skriv en beskjed.", "Choose a phone and write a message."),
            ],
            [
              "light.turn_off",
              t("Slå av lys", "Turn off lights"),
              t(
                "La hjemmet slukke for deg.",
                "Let your home turn the lights off.",
              ),
            ],
            [
              "switch.turn_on",
              t("Slå på stikkontakt", "Turn on socket"),
              t("Start en tilkoblet enhet.", "Start a connected device."),
            ],
            [
              "switch.turn_off",
              t("Slå av stikkontakt", "Turn off socket"),
              t("Slå av en tilkoblet enhet.", "Turn off a connected device."),
            ],
            [
              "climate.set_temperature",
              t("Still temperatur", "Set temperature"),
              t(
                "Velg termostat og ønsket temperatur.",
                "Choose a thermostat and target temperature.",
              ),
            ],
            [
              "scene.turn_on",
              t("Aktiver scene", "Activate scene"),
              t(
                "Sett flere enheter slik du ønsker.",
                "Set several devices just how you like them.",
              ),
            ],
            [
              "delay",
              t("Vent litt", "Wait a little"),
              t("Ta en pause før neste steg.", "Pause before the next step."),
            ],
            [
              "if",
              t("Ta et valg", "Make a choice"),
              t(
                "Hvis noe stemmer, gjør dette. Ellers gjør noe annet.",
                "If something is true, do this. Otherwise do something else.",
              ),
            ],
            [
              "choose",
              t("Velg mellom flere veier", "Choose between paths"),
              t(
                "Den første veien med riktige krav blir valgt.",
                "The first path with matching requirements is chosen.",
              ),
            ],
            [
              "repeat",
              t("Gjenta", "Repeat"),
              t(
                "Kjør de samme stegene flere ganger.",
                "Run the same steps several times.",
              ),
            ],
            [
              "parallel",
              t("Gjør flere ting samtidig", "Do things at the same time"),
              t(
                "Uavhengige løp som starter sammen.",
                "Independent sequences that start together.",
              ),
            ],
            [
              "wait_for_trigger",
              t("Vent på en hendelse", "Wait for an event"),
              t(
                "Fortsett når en sensor eller annen hendelse reagerer.",
                "Continue when a sensor or another event responds.",
              ),
            ],
            [
              "stop",
              t("Avslutt her", "Finish here"),
              t(
                "Stopp resten av dette løpet.",
                "Stop the rest of this sequence.",
              ),
            ],
          ];
  return rows.map(([id, title, hint]) => ({ id, title, hint }));
}

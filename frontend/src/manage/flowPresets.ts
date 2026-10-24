import type { FlowKind } from "./flowPresentation";
export const flowCategories = [
  ["all", "Alle kort", "All cards"],
  ["time", "Tid og sol", "Time and sun"],
  ["presence", "Bevegelse og hjem", "Motion and presence"],
  ["climate", "Temperatur og klima", "Temperature and climate"],
  ["energy", "Energi og lading", "Energy and charging"],
  ["devices", "Lys og enheter", "Lights and devices"],
  ["logic", "Logikk og flyt", "Logic and flow"],
] as const;
export function flowPresets(kind: FlowKind, lang: string) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const trigger = kind === "triggers";
  const state = (value: string) =>
    trigger
      ? { trigger: "state", entity_id: "", to: value }
      : { condition: "state", entity_id: "", state: value };
  const number = (direction: "above" | "below", value: number) =>
    trigger
      ? { trigger: "numeric_state", entity_id: "", [direction]: value }
      : { condition: "numeric_state", entity_id: "", [direction]: value };
  const rows: Array<{
    id: string;
    title: string;
    hint: string;
    category: string;
    step: Record<string, any>;
  }> = [];
  const add = (
    id: string,
    category: string,
    nb: string,
    en: string,
    hnb: string,
    hen: string,
    step: Record<string, any>,
  ) =>
    rows.push({
      id: `preset:${id}`,
      category,
      title: t(nb, en),
      hint: t(hnb, hen),
      step,
    });
  if (kind === "actions") return rows;
  if (trigger) {
    add(
      "sunrise",
      "time",
      "Solen står opp",
      "The sun rises",
      "Start ved soloppgang der hjemmet ligger.",
      "Start at sunrise at your home.",
      { trigger: "sun", event: "sunrise" },
    );
    add(
      "sunset",
      "time",
      "Solen går ned",
      "The sun sets",
      "Start ved solnedgang. Du kan legge til en forskyvning.",
      "Start at sunset. You can add an offset.",
      { trigger: "sun", event: "sunset" },
    );
    add(
      "morning",
      "time",
      "Det blir morgen",
      "Morning begins",
      "Et klokkeslett du velger. Forslaget starter kl. 07:00.",
      "Choose a time. Suggested starting time: 07:00.",
      { trigger: "time", at: "07:00:00" },
    );
  } else {
    add(
      "daylight",
      "time",
      "Solen er oppe",
      "The sun is up",
      "Mellom soloppgang og solnedgang.",
      "Between sunrise and sunset.",
      { condition: "sun", after: "sunrise", before: "sunset" },
    );
    add(
      "weekdays",
      "time",
      "Det er en hverdag",
      "It is a weekday",
      "Mandag til fredag. Velg dagene som passer.",
      "Monday to Friday. Choose the days you want.",
      { condition: "time", weekday: ["mon", "tue", "wed", "thu", "fri"] },
    );
    add(
      "weekend",
      "time",
      "Det er helg",
      "It is the weekend",
      "Lørdag eller søndag.",
      "Saturday or Sunday.",
      { condition: "time", weekday: ["sat", "sun"] },
    );
    add(
      "evening",
      "time",
      "Det er kveld",
      "It is evening",
      "Mellom kl. 18 og 23. Tidene kan endres.",
      "Between 18:00 and 23:00. Times can be changed.",
      { condition: "time", after: "18:00:00", before: "23:00:00" },
    );
  }
  add(
    "motion",
    "presence",
    trigger ? "Det oppdages bevegelse" : "Det er bevegelse i rommet",
    trigger ? "Motion is detected" : "There is motion in the room",
    "Velg rommets bevegelsessensor. Aktiv tilstand: on.",
    "Choose a motion sensor. Active state: on.",
    state("on"),
  );
  add(
    "home",
    "presence",
    trigger ? "Noen kommer hjem" : "Noen er hjemme",
    trigger ? "Someone arrives home" : "Someone is home",
    "Velg personen som skal følges.",
    "Choose the person to follow.",
    state("home"),
  );
  add(
    "door",
    "presence",
    trigger ? "En dør åpnes" : "En dør er åpen",
    trigger ? "A door opens" : "A door is open",
    "Velg dørsensor. Åpen tilstand: on.",
    "Choose a door sensor. Open state: on.",
    state("on"),
  );
  add(
    "warm",
    "climate",
    trigger
      ? "Temperaturen går over en grense"
      : "Temperaturen er over en grense",
    trigger
      ? "Temperature rises above a threshold"
      : "Temperature is above a threshold",
    "Velg temperaturmåler og grense. Forslag: 22 i målerens enhet.",
    "Choose a temperature sensor and threshold. Suggested value: 22 in its unit.",
    number("above", 22),
  );
  add(
    "cold",
    "climate",
    trigger
      ? "Temperaturen går under en grense"
      : "Temperaturen er under en grense",
    trigger
      ? "Temperature falls below a threshold"
      : "Temperature is below a threshold",
    "Velg temperaturmåler og grense. Forslag: 18 i målerens enhet.",
    "Choose a temperature sensor and threshold. Suggested value: 18 in its unit.",
    number("below", 18),
  );
  add(
    "humidity",
    "climate",
    trigger ? "Luftfuktigheten blir høy" : "Luftfuktigheten er høy",
    trigger ? "Humidity rises" : "Humidity is high",
    "Velg fuktmåler. Forslaget er over 70 %.",
    "Choose a humidity sensor. Suggested threshold: above 70%.",
    number("above", 70),
  );
  add(
    "power",
    "energy",
    trigger ? "Effekten passerer en grense" : "Effekten er over en grense",
    trigger ? "Power crosses a threshold" : "Power is above a threshold",
    "Velg W- eller kW-måler og sett grensen i samme enhet.",
    "Choose a W or kW sensor and set the threshold in the same unit.",
    number("above", 0),
  );
  add(
    "energy",
    "energy",
    trigger
      ? "Energiforbruket passerer en grense"
      : "Energiforbruket er over en grense",
    trigger
      ? "Energy use crosses a threshold"
      : "Energy use is above a threshold",
    "Velg Wh- eller kWh-måler og angi ønsket grense.",
    "Choose a Wh or kWh sensor and enter a threshold.",
    number("above", 0),
  );
  add(
    "charging",
    "energy",
    trigger ? "Bilen begynner å lade" : "Bilen lader",
    trigger ? "The car starts charging" : "The car is charging",
    "Velg ladestatus. Forslaget bruker on; tilpass hvis laderen bruker f.eks. charging.",
    "Choose charging status. Default is on; adjust if your charger uses e.g. charging.",
    state("on"),
  );

  for (const [id, category, nb, en, value] of [
    ["away", "presence", "Personen er borte", "Person is away", "not_home"],
    ["still", "presence", "Ingen bevegelse", "No motion", "off"],
    ["closed", "presence", "Døren er lukket", "Door is closed", "off"],
    ["leak", "devices", "Vannlekkasje oppdages", "Water leak detected", "on"],
    ["smoke", "devices", "Røyk oppdages", "Smoke detected", "on"],
    [
      "charging-done",
      "energy",
      "Ladingen er avsluttet",
      "Charging has stopped",
      "off",
    ],
  ])
    add(
      id,
      category,
      nb,
      en,
      "Velg riktig sensor eller person. Kontroller tilstanden som enheten rapporterer.",
      "Choose the sensor or person. Check the state reported by the device.",
      state(value),
    );
  for (const [id, category, nb, en, direction, value] of [
    ["dark", "devices", "Det er lite lys", "Light level is low", "below", 50],
    [
      "battery-low",
      "devices",
      "Batterinivået er lavt",
      "Battery level is low",
      "below",
      20,
    ],
    [
      "co2-high",
      "climate",
      "CO₂-nivået er høyt",
      "CO₂ level is high",
      "above",
      1000,
    ],
    [
      "price-high",
      "energy",
      "Strømprisen er høy",
      "Electricity price is high",
      "above",
      0,
    ],
    [
      "price-low",
      "energy",
      "Strømprisen er lav",
      "Electricity price is low",
      "below",
      0,
    ],
    [
      "solar",
      "energy",
      "Solcellene produserer",
      "Solar panels are producing",
      "above",
      0,
    ],
  ] as const)
    add(
      id,
      category,
      nb,
      en,
      "Velg måler og tilpass grensen til enheten den viser. Verdien er et forslag.",
      "Choose a sensor and adjust the threshold to its unit. The value is a suggestion.",
      number(direction, value),
    );
  return rows;
}
export function categoryForFlowCard(id: string) {
  if (["time", "sun", "delay"].includes(id)) return "time";
  if (id === "climate.set_temperature") return "climate";
  if (id === "state") return "presence";
  if (id === "numeric_state") return "energy";
  if (id.includes(".")) return "devices";
  return "logic";
}

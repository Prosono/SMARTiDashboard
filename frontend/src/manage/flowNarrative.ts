import type { Home } from "../types";
import { entityState } from "./entityWords";
import { has } from "./flowStructure";

export type NarrativeKey = "triggers" | "conditions" | "actions";
export type FlowNarrative = { title: string; detail: string };
type Row = Record<string, any>;
const record = (v: any): v is Row =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const items = (v: any): any[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
const text = (v: any): string =>
  v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
const join = (...values: (string | false | undefined)[]) =>
  values.filter(Boolean).join(" · ");
const template = (v: any) => typeof v === "string" && /{{|{%/.test(v);
const humanize = (v: any) => text(v).replace(/_/g, " ");

/** Read-only descriptions of HA configuration. Templates remain expressions, never evaluated. */
export function flowNarrative(
  row: any,
  key: NarrativeKey,
  home: Home,
  lang: string,
): FlowNarrative {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const name = (id: any): string => {
    if (Array.isArray(id)) return id.map(name).join(", ");
    if (id === "all") return t("Alle enheter", "All entities");
    return home.controls.find((c) => c.entity_id === id)?.name || text(id);
  };
  const device = (id: any): string =>
    items(id)
      .map((value) => {
        const controls = home.controls.filter((c) => c.device_id === value);
        const names = [...new Set(controls.map((c) => c.name))];
        return names.length
          ? names.join(", ")
          : t("Enhet ", "Device ") + text(value);
      })
      .join(", ");
  const area = (id: any): string =>
    items(id)
      .map(
        (value) =>
          home.areas.find((a) => a.area_id === value)?.name || text(value),
      )
      .join(", ");
  const target = (r: Row): string => {
    if (template(r.target))
      return t("Mål fra uttrykk: ", "Target from expression: ") + r.target;
    const selected = record(r.target) ? r.target : {};
    return join(
      name(selected.entity_id ?? r.entity_id ?? r.data?.entity_id),
      selected.area_id && t("Rom: ", "Room: ") + area(selected.area_id),
      selected.device_id && device(selected.device_id),
      selected.floor_id && t("Etasje: ", "Floor: ") + text(selected.floor_id),
      selected.label_id && t("Etikett: ", "Label: ") + text(selected.label_id),
    );
  };
  const state = (value: any): string => {
    if (Array.isArray(value))
      return value.map(state).join(t(" eller ", " or "));
    if (row.attribute) return text(value);
    if (
      typeof value === "string" &&
      /^(input_boolean|input_datetime|input_number|input_select|input_text)\./.test(
        value,
      )
    )
      return t("verdien til ", "the value of ") + name(value);
    // A mixed list can contain entities with different device classes. Do not label all of them as a door.
    const ids = items(row.entity_id);
    if (ids.length > 1) {
      const labels = ids.map((id) => entityState(id, value, home, lang));
      if (new Set(labels).size > 1) return text(value);
      return labels[0];
    }
    return entityState(ids[0] || "", value, home, lang);
  };
  const duration = (value: any): string => {
    if (typeof value === "number") return `${value} ${t("sek", "sec")}`;
    if (record(value)) {
      const units: Record<string, string> = {
        days: t("dager", "days"),
        hours: t("t", "h"),
        minutes: "min",
        seconds: t("sek", "sec"),
        milliseconds: "ms",
      };
      return Object.entries(value)
        .map(([unit, n]) => `${text(n)} ${units[unit] || unit}`)
        .join(" ");
    }
    if (typeof value === "string" && /^\d+:\d{2}:\d{2}(\.\d+)?$/.test(value)) {
      const [h, m, s] = value.split(":").map(Number);
      return (
        [
          h && `${h} ${t("t", "h")}`,
          m && `${m} min`,
          s && `${s} ${t("sek", "sec")}`,
        ]
          .filter(Boolean)
          .join(" ") || `0 ${t("sek", "sec")}`
      );
    }
    return text(value);
  };
  const held = () =>
    has(row, "for") ? t("I minst ", "For at least ") + duration(row.for) : "";
  const attribute = () =>
    row.attribute
      ? t("Egenskap: ", "Attribute: ") + humanize(row.attribute)
      : "";
  const sunName = (value: any) =>
    value === "sunrise"
      ? t("soloppgang", "sunrise")
      : value === "sunset"
        ? t("solnedgang", "sunset")
        : text(value);
  const weekday = (value: any) =>
    items(value)
      .map(
        (day) =>
          ({
            mon: t("mandag", "Monday"),
            tue: t("tirsdag", "Tuesday"),
            wed: t("onsdag", "Wednesday"),
            thu: t("torsdag", "Thursday"),
            fri: t("fredag", "Friday"),
            sat: t("lørdag", "Saturday"),
            sun: t("søndag", "Sunday"),
          })[text(day)] || text(day),
      )
      .join(", ");
  const finish = (summary: FlowNarrative): FlowNarrative => {
    const detail = join(
      row?.alias && row.alias !== summary.title ? summary.title : "",
      summary.detail,
      key === "actions" &&
        (typeof row === "string" ||
          Array.isArray(row) ||
          has(row, "condition") ||
          ["and", "or", "not"].some((k) => has(row, k)))
        ? t(
            "Hvis kravet ikke stemmer, stopper resten av denne sekvensen.",
            "If the requirement is false, the rest of this sequence stops.",
          )
        : "",
      row?.enabled === false
        ? t("Deaktivert – hoppes over", "Disabled – skipped")
        : template(row?.enabled)
          ? t("Aktivering bestemmes av et uttrykk", "Enabled by an expression")
          : "",
      row?.continue_on_error === true
        ? t("Fortsetter også ved feil", "Continues on error")
        : "",
    );
    return {
      title:
        typeof row?.alias === "string" && row.alias.trim()
          ? row.alias
          : summary.title,
      detail,
    };
  };
  const result = (title: string, ...detail: (string | false | undefined)[]) =>
    finish({ title, detail: join(...detail) });
  const fields = (r: Row, omit: string[] = []): string =>
    Object.entries(r)
      .filter(
        ([k]) =>
          !["alias", "enabled", "continue_on_error", ...omit].includes(k),
      )
      .map(([k, value]) => `${humanize(k)}: ${text(value)}`)
      .join(" · ");

  if (typeof row === "string")
    return result(t("Sjekk et uttrykk", "Check an expression"), row);
  if (typeof row === "boolean")
    return result(
      row ? t("Alltid sant", "Always true") : t("Alltid usant", "Always false"),
    );
  if (Array.isArray(row))
    return result(
      t("Alle krav må stemme", "All requirements must match"),
      t(
        "Hvert krav nedenfor må være oppfylt.",
        "Each requirement below must be met.",
      ),
    );
  if (!record(row))
    return result(
      t("Ukjent oppsett", "Unrecognized configuration"),
      t(
        "Åpne detaljene for å se originalen.",
        "Open details to see the original.",
      ),
    );
  if (Array.isArray(row.condition))
    return result(
      t("Alle krav må stemme", "All requirements must match"),
      t(
        "Hvert krav nedenfor må være oppfylt.",
        "Each requirement below must be met.",
      ),
    );
  const isCondition =
    key === "conditions" || (key === "actions" && has(row, "condition"));
  const kind =
    key === "triggers"
      ? (row.trigger ?? row.platform)
      : isCondition
        ? row.condition
        : (row.action ?? row.service);

  if (key === "triggers" && has(row, "triggers"))
    return result(
      t("Flere hendelser", "More events"),
      t(
        "Én av hendelsene nedenfor starter rutinen.",
        "Any of the events below starts the routine.",
      ),
    );

  if (kind === "state") {
    const transition = isCondition
      ? t("Er ", "Is ") + state(row.state)
      : join(
          has(row, "from") && row.from != null
            ? t("Fra ", "From ") + state(row.from)
            : "",
          has(row, "to") && row.to != null
            ? t("Til ", "To ") + state(row.to)
            : "",
          has(row, "not_from")
            ? t("Ikke fra ", "Not from ") + state(row.not_from)
            : "",
          has(row, "not_to")
            ? t("Ikke til ", "Not to ") + state(row.not_to)
            : "",
        ) ||
        (has(row, "from") ||
        has(row, "to") ||
        has(row, "not_from") ||
        has(row, "not_to") ||
        row.attribute
          ? t("Når verdien endres", "When the value changes")
          : t(
              "Når tilstanden eller en egenskap endres",
              "When the state or an attribute changes",
            ));
    return result(
      name(row.entity_id) || t("En tilstand endres", "A state changes"),
      transition,
      attribute(),
      held(),
      items(row.entity_id).length > 1
        ? isCondition
          ? row.match === "any"
            ? t("Minst én må stemme", "At least one must match")
            : t("Alle må stemme", "All must match")
          : t("Én av enhetene er nok", "Any one entity can trigger")
        : "",
    );
  }
  if (kind === "numeric_state") {
    const thresholds = join(
      has(row, "above") ? t("Over ", "Above ") + name(row.above) : "",
      has(row, "below") ? t("Under ", "Below ") + name(row.below) : "",
    );
    return result(
      name(row.entity_id) || t("Sjekk en måleverdi", "Check a measurement"),
      isCondition
        ? thresholds
        : t(
            "Når verdien går inn i området: ",
            "When the value enters the range: ",
          ) + thresholds,
      t("Grensene er ikke inkludert", "Limits are not included"),
      attribute(),
      held(),
      row.value_template
        ? t("Beregning: ", "Calculation: ") + text(row.value_template)
        : "",
    );
  }
  if (kind === "time") {
    if (isCondition)
      return result(
        t("Innenfor valgt tid", "Within the selected time"),
        row.after ? t("Etter ", "After ") + name(row.after) : "",
        row.before ? t("Før ", "Before ") + name(row.before) : "",
        row.weekday ? weekday(row.weekday) : "",
      );
    const at = items(row.at)
      .map((value) =>
        record(value)
          ? join(
              name(value.entity_id),
              has(value, "offset") &&
                t("Forskyvning: ", "Offset: ") + duration(value.offset),
            )
          : name(value),
      )
      .join(t(" eller ", " or "));
    return result(
      t("På et bestemt tidspunkt", "At a scheduled time"),
      at || t("Velg klokkeslett", "Choose a time"),
      row.weekday ? weekday(row.weekday) : "",
    );
  }
  if (kind === "time_pattern") {
    const units: Record<string, [string, string]> = {
      hours: ["Time", "Hour"],
      minutes: ["Minutt", "Minute"],
      seconds: ["Sekund", "Second"],
    };
    return result(
      t("Gjentas etter klokken", "Repeats by the clock"),
      ...Object.entries(units)
        .filter(([unit]) => has(row, unit))
        .map(([unit, label]) => {
          const v = text(row[unit]);
          return `${t(...label)}: ${v === "*" ? t("hver", "every") : v.startsWith("/") ? t("hver ", "every ") + v.slice(1) : v}`;
        }),
    );
  }
  if (kind === "sun") {
    if (isCondition)
      return result(
        t("I forhold til solen", "Relative to the sun"),
        row.after
          ? join(
              t("Etter ", "After ") + sunName(row.after),
              has(row, "after_offset") &&
                t("forskyvning ", "offset ") + duration(row.after_offset),
            )
          : "",
        row.before
          ? join(
              t("Før ", "Before ") + sunName(row.before),
              has(row, "before_offset") &&
                t("forskyvning ", "offset ") + duration(row.before_offset),
            )
          : "",
      );
    return result(
      row.event === "sunset"
        ? t("Solen går ned", "The sun sets")
        : row.event === "sunrise"
          ? t("Solen står opp", "The sun rises")
          : t("Solhendelse", "Sun event"),
      has(row, "offset")
        ? t("Forskyvning: ", "Offset: ") + duration(row.offset)
        : t("Følger årstidene", "Follows the seasons"),
    );
  }
  if (kind === "template" || template(kind))
    return result(
      isCondition
        ? t("Sjekk et uttrykk", "Check an expression")
        : t("Når et uttrykk blir sant", "When an expression becomes true"),
      text(row.value_template || kind),
      held(),
    );
  if (kind === "trigger" && isCondition)
    return result(
      t("Startet av en bestemt hendelse", "Started by a specific event"),
      t("Utløser-ID: ", "Trigger ID: ") +
        items(row.id).join(t(" eller ", " or ")),
    );
  if (kind === "zone" || kind === "geo_location")
    return result(
      isCondition
        ? t("Er i et område", "Is in a zone")
        : row.event === "leave"
          ? t("Forlater et område", "Leaves a zone")
          : t("Kommer til et område", "Enters a zone"),
      name(row.entity_id) || text(row.source),
      name(row.zone),
    );
  if (
    kind === "device" ||
    (key === "actions" && !kind && row.device_id && row.domain && row.type)
  ) {
    const types: Record<string, [string, string]> = {
      opened: ["Åpnes", "Opens"],
      closed: ["Lukkes", "Closes"],
      opening: ["Åpner seg", "Opening"],
      closing: ["Lukker seg", "Closing"],
      is_open: ["Er åpen", "Is open"],
      is_closed: ["Er lukket", "Is closed"],
      turned_on: ["Slås på", "Turns on"],
      turned_off: ["Slås av", "Turns off"],
      is_on: ["Er på", "Is on"],
      is_off: ["Er av", "Is off"],
      motion: ["Bevegelse oppdages", "Motion detected"],
      no_motion: ["Ingen bevegelse", "No motion"],
      occupied: ["Tilstedeværelse oppdages", "Presence detected"],
      not_occupied: ["Ingen til stede", "No presence"],
      smoke: ["Røyk oppdages", "Smoke detected"],
      moist: ["Vann oppdages", "Water detected"],
      button_short_press: ["Kort trykk", "Short press"],
      button_long_press: ["Langt trykk", "Long press"],
      button_double_press: ["Dobbelttrykk", "Double press"],
      turn_on: ["Slå på", "Turn on"],
      turn_off: ["Slå av", "Turn off"],
      toggle: ["Bytt mellom på og av", "Toggle on/off"],
    };
    const title = types[row.type]
      ? t(...types[row.type])
      : t("Enhet: ", "Device: ") + humanize(row.type || row.domain || "device");
    return result(
      title,
      row.entity_id ? name(row.entity_id) : device(row.device_id),
      row.subtype
        ? t("Knapp / funksjon: ", "Button / function: ") + humanize(row.subtype)
        : "",
      held(),
      fields(row, [
        "trigger",
        "platform",
        "condition",
        "type",
        "domain",
        "device_id",
        "entity_id",
        "subtype",
        "for",
      ]),
    );
  }
  if (kind === "event")
    return result(
      t("Når en hendelse mottas", "When an event arrives"),
      text(row.event_type),
      row.event_data ? t("Med: ", "With: ") + fields(row.event_data) : "",
      row.context ? t("Kontekst: ", "Context: ") + text(row.context) : "",
    );
  if (kind === "mqtt")
    return result(
      t("Når en melding mottas", "When a message arrives"),
      text(row.topic),
      has(row, "payload")
        ? t("Innhold: ", "Payload: ") + text(row.payload)
        : t("Uansett innhold", "Any payload"),
      row.value_template
        ? t("Beregning: ", "Calculation: ") + text(row.value_template)
        : "",
    );
  if (kind === "homeassistant")
    return result(
      row.event === "shutdown"
        ? t("Når SMARTi stopper", "When SMARTi stops")
        : t("Når SMARTi starter", "When SMARTi starts"),
    );
  if (kind === "calendar")
    return result(
      row.event === "end"
        ? t("En kalenderavtale slutter", "A calendar event ends")
        : t("En kalenderavtale starter", "A calendar event starts"),
      name(row.entity_id),
      has(row, "offset")
        ? t("Forskyvning: ", "Offset: ") + duration(row.offset)
        : "",
    );
  if (kind === "tag")
    return result(
      t("Når en brikke skannes", "When a tag is scanned"),
      items(row.tag_id).join(", "),
      row.device_id ? device(row.device_id) : "",
    );
  if (kind === "webhook")
    return result(
      t(
        "Når en ekstern forespørsel mottas",
        "When an external request arrives",
      ),
      row.allowed_methods ? items(row.allowed_methods).join(", ") : "POST, PUT",
      row.local_only === false
        ? t(
            "Tillater også forespørsler utenfra",
            "Also accepts external requests",
          )
        : t(
            "Kun lokalt eller via skyforbindelsen",
            "Local or cloud connection only",
          ),
    );
  if (kind === "conversation")
    return result(
      t("Når du sier", "When you say"),
      items(row.command).join(t(" eller ", " or ")),
    );

  const booleanKind = ["and", "or", "not"].find(
    (k) => kind === k || has(row, k),
  );
  if (booleanKind)
    return result(
      booleanKind === "and"
        ? t("Alle krav må stemme", "All requirements must match")
        : booleanKind === "or"
          ? t("Minst ett krav må stemme", "At least one requirement must match")
          : t(
              "Ingen av kravene må stemme",
              "None of the requirements may match",
            ),
      t("Se kravene nedenfor.", "See the requirements below."),
    );
  if (has(row, "choose"))
    return result(
      t("Velg første vei som passer", "Choose the first matching path"),
      `${items(row.choose).length} ${t("valg sjekkes ovenfra og ned", "options are checked from top to bottom")}`,
      has(row, "default")
        ? t("Ellers kjøres reserveveien", "Otherwise the fallback runs")
        : t(
            "Ingen treff: fortsett etter valget",
            "No match: continue after the choice",
          ),
    );
  if (has(row, "if"))
    return result(
      t("Hvis dette stemmer", "If this is true"),
      t(
        "Ja: gjør stegene i første vei.",
        "Yes: run the steps in the first path.",
      ),
      has(row, "else")
        ? t(
            "Nei: gjør stegene i den andre veien.",
            "No: run the steps in the other path.",
          )
        : t(
            "Nei: fortsett etter dette valget.",
            "No: continue after this choice.",
          ),
    );
  if (has(row, "repeat")) {
    const repeat = record(row.repeat) ? row.repeat : {};
    if (has(repeat, "count"))
      return result(
        t("Gjenta ", "Repeat ") + text(repeat.count) + t(" ganger", " times"),
        t(
          "Stegene kjøres i rekkefølge for hver runde.",
          "The steps run in order on each iteration.",
        ),
      );
    if (has(repeat, "for_each"))
      return result(
        t("Gjenta for hvert element", "Repeat for each item"),
        text(repeat.for_each),
      );
    if (has(repeat, "until"))
      return result(
        t("Gjenta til kravene stemmer", "Repeat until requirements match"),
        t(
          "Kjøres minst én gang. Kravene sjekkes etter hver runde.",
          "Runs at least once. Requirements are checked after each iteration.",
        ),
      );
    return result(
      t("Gjenta så lenge kravene stemmer", "Repeat while requirements match"),
      t(
        "Kravene sjekkes før hver runde. Kan bli hoppet over.",
        "Requirements are checked before each iteration. May be skipped.",
      ),
    );
  }
  if (has(row, "parallel"))
    return result(
      t("Kjør flere løp samtidig", "Run several paths together"),
      t(
        "Ingen fast rekkefølge mellom løpene. Neste steg venter til alle er ferdige.",
        "No fixed order between paths. The next step waits until all are finished.",
      ),
    );
  if (has(row, "sequence"))
    return result(
      t("Gjør stegene i rekkefølge", "Run these steps in order"),
      t(
        "Hvert steg venter på det forrige.",
        "Each step waits for the previous one.",
      ),
    );
  if (has(row, "delay"))
    return result(
      t("Vent ", "Wait ") + duration(row.delay),
      t(
        "Fortsett med neste steg etter pausen.",
        "Continue with the next step after the pause.",
      ),
    );
  if (has(row, "wait_template") || has(row, "wait_for_trigger"))
    return result(
      has(row, "wait_template")
        ? t("Vent til uttrykket er sant", "Wait until the expression is true")
        : t("Vent på en ny hendelse", "Wait for a new event"),
      has(row, "wait_template")
        ? text(row.wait_template)
        : t(
            "Én av hendelsene nedenfor må inntreffe.",
            "One of the events below must occur.",
          ),
      has(row, "timeout")
        ? t("Vent maksimalt ", "Wait at most ") + duration(row.timeout)
        : t("Ingen tidsgrense", "No timeout"),
      has(row, "timeout")
        ? row.continue_on_timeout === false
          ? t("Stopp ved tidsgrensen", "Stop on timeout")
          : t("Fortsett også ved tidsgrensen", "Continue even on timeout")
        : "",
    );
  if (has(row, "stop"))
    return result(
      row.error
        ? t("Stopp med feil", "Stop with an error")
        : t("Stopp her", "Stop here"),
      text(row.stop),
      row.response_variable
        ? t("Svar: ", "Response: ") + text(row.response_variable)
        : "",
    );
  if (has(row, "variables"))
    return result(
      t("Husk verdier til senere", "Remember values for later"),
      record(row.variables) ? fields(row.variables) : text(row.variables),
    );
  if (has(row, "event"))
    return result(
      t("Send en hendelse", "Send an event"),
      text(row.event),
      row.event_data ? fields(row.event_data) : "",
      row.event_data_template
        ? t("Innhold fra uttrykk: ", "Data from expression: ") +
            text(row.event_data_template)
        : "",
    );
  if (has(row, "scene"))
    return result(t("Aktiver en scene", "Activate a scene"), name(row.scene));

  // A service action is not the same as a newer domain-specific trigger/condition.
  if (key === "actions" && !isCondition && typeof kind === "string") {
    const verbs: Record<string, [string, string]> = {
      turn_on: ["Slå på", "Turn on"],
      turn_off: ["Slå av", "Turn off"],
      toggle: ["Bytt mellom på og av", "Toggle on/off"],
      set_temperature: ["Still temperaturen", "Set the temperature"],
      set_hvac_mode: ["Velg klimamodus", "Set climate mode"],
      set_preset_mode: ["Velg forhåndsinnstilling", "Choose a preset"],
      open_cover: ["Åpne", "Open"],
      close_cover: ["Lukk", "Close"],
      stop_cover: ["Stopp bevegelsen", "Stop moving"],
      set_cover_position: ["Still åpningen", "Set the position"],
      lock: ["Lås", "Lock"],
      unlock: ["Lås opp", "Unlock"],
      media_play: ["Spill av", "Play"],
      media_pause: ["Sett på pause", "Pause"],
      media_play_pause: [
        "Bytt mellom avspilling og pause",
        "Toggle play/pause",
      ],
      media_stop: ["Stopp avspilling", "Stop playback"],
      media_next_track: ["Neste spor", "Next track"],
      media_previous_track: ["Forrige spor", "Previous track"],
      volume_set: ["Still volumet", "Set the volume"],
      volume_mute: ["Velg lyd av/på", "Set mute"],
      play_media: ["Spill av innhold", "Play media"],
      select_source: ["Velg kilde", "Choose a source"],
      set_value: ["Sett verdien", "Set the value"],
      select_option: ["Velg alternativ", "Choose an option"],
      press: ["Trykk på knappen", "Press the button"],
      start: ["Start", "Start"],
      pause: ["Sett på pause", "Pause"],
      stop: ["Stopp", "Stop"],
      return_to_base: ["Kjør tilbake til laderen", "Return to the dock"],
      alarm_arm_away: ["Aktiver bortemodus", "Arm away"],
      alarm_arm_home: ["Aktiver hjemmemodus", "Arm home"],
      alarm_arm_night: ["Aktiver nattmodus", "Arm night"],
      alarm_disarm: ["Slå av alarmen", "Disarm the alarm"],
      trigger: ["Kjør automasjonen", "Run the automation"],
    };
    const [domain, verb] = kind.split(".");
    const title = template(kind)
      ? t("Handling valgt av et uttrykk", "Action chosen by an expression")
      : (domain === "notify" && verb !== "reload") ||
          kind === "persistent_notification.create"
        ? t("Send et varsel", "Send a notification")
        : domain === "scene" && verb === "turn_on"
          ? t("Aktiver en scene", "Activate a scene")
          : verbs[verb]
            ? t(...verbs[verb])
            : t("Kjør ", "Run ") + kind;
    const parameters: Record<string, [string, string]> = {
      brightness_pct: ["Lysstyrke", "Brightness"],
      brightness: ["Lysstyrke (0–255)", "Brightness (0–255)"],
      temperature: ["Temperatur", "Temperature"],
      target_temp_low: ["Min. temperatur", "Min. temperature"],
      target_temp_high: ["Maks. temperatur", "Max. temperature"],
      hvac_mode: ["Modus", "Mode"],
      preset_mode: ["Forhåndsinnstilling", "Preset"],
      volume_level: ["Volum", "Volume"],
      is_volume_muted: ["Dempet", "Muted"],
      position: ["Åpning", "Position"],
      transition: ["Overgang", "Transition"],
      color_temp_kelvin: ["Fargetemperatur", "Color temperature"],
      color_name: ["Farge", "Color"],
      rgb_color: ["RGB-farge", "RGB color"],
      hs_color: ["Farge / metning", "Hue / saturation"],
      message: ["Melding", "Message"],
      title: ["Tittel", "Title"],
      value: ["Verdi", "Value"],
      option: ["Alternativ", "Option"],
      source: ["Kilde", "Source"],
      media_content_id: ["Innhold", "Content"],
      media_content_type: ["Innholdstype", "Content type"],
    };
    const details = record(row.data)
      ? Object.entries(row.data)
          .filter(([k]) => k !== "entity_id")
          .map(([k, v]) => {
            if (["code", "password", "token", "api_key"].includes(k))
              return t("Tilgangskode er satt", "Access credential is set");
            let value = text(v);
            if (k === "volume_level" && typeof v === "number")
              value = `${Math.round(v * 100)} %`;
            if (["brightness_pct", "position"].includes(k)) value += " %";
            if (k === "color_temp_kelvin") value += " K";
            if (k === "transition") value += " s";
            return `${parameters[k] ? t(...parameters[k]) : humanize(k)}: ${value}`;
          })
          .join(" · ")
      : text(row.data);
    return result(
      title,
      target(row),
      details,
      row.data_template
        ? t("Verdier fra uttrykk: ", "Values from expression: ") +
            text(row.data_template)
        : "",
      row.response_variable
        ? t("Lagre svaret i ", "Save the response in ") +
            text(row.response_variable)
        : "",
      template(kind) ? kind : "",
    );
  }
  const specific: Record<string, [string, string]> = {
    "light.turned_on": ["Et lys slås på", "A light turns on"],
    "light.turned_off": ["Et lys slås av", "A light turns off"],
    "light.is_on": ["Lyset er på", "The light is on"],
    "light.is_off": ["Lyset er av", "The light is off"],
    "sun.sunrise": ["Solen står opp", "The sun rises"],
    "sun.sunset": ["Solen går ned", "The sun sets"],
  };
  return result(
    specific[kind]
      ? t(...specific[kind])
      : (isCondition
          ? t("Sjekk: ", "Check: ")
          : key === "triggers"
            ? t("Hendelse: ", "Event: ")
            : t("Handling: ", "Action: ")) +
          humanize(kind || row.type || Object.keys(row)[0]),
    target(row),
    fields(row, [
      "trigger",
      "platform",
      "condition",
      "action",
      "service",
      "target",
      "entity_id",
    ]),
  );
}

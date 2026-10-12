import { EntityPicker } from "./EntityPicker";
import { useState, useRef, useEffect } from "react";
import {
  Clock,
  Sunset,
  DoorOpen,
  ArrowRight,
  Check,
  SlidersHorizontal,
} from "lucide-react";
import type { Home } from "../types";
import { words } from "./shared";
type Config = Record<string, any>;
const only = (v: Config, keys: string[]) =>
  !!v &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  Object.keys(v).every((k) => keys.includes(k));
// A strict boundary: never hide conditions, templates or advanced options in the guide.
export function canGuide(c: Config): boolean {
  if (
    !only(c, [
      "id",
      "alias",
      "description",
      "mode",
      "triggers",
      "conditions",
      "actions",
    ]) ||
    c.mode !== "single" ||
    c.conditions?.length ||
    c.triggers?.length !== 1 ||
    c.actions?.length !== 1
  )
    return false;
  const r = c.triggers[0],
    a = c.actions[0];
  if (!r || !a || typeof r !== "object" || typeof a !== "object") return false;
  const trigger =
    r.trigger === "time"
      ? only(r, ["trigger", "at"]) && /^\d{2}:\d{2}(:00)?$/.test(r.at)
      : r.trigger === "sun"
        ? only(r, ["trigger", "event"]) &&
          ["sunset", "sunrise"].includes(r.event)
        : r.trigger === "state" &&
          only(r, ["trigger", "entity_id", "from", "to"]) &&
          typeof r.entity_id === "string" &&
          ["on", "off"].includes(r.to) &&
          r.from === (r.to === "on" ? "off" : "on");
  return (
    !!trigger &&
    only(a, ["action", "target"]) &&
    /^(light|switch)\.turn_(on|off)$/.test(a.action) &&
    !!a.target &&
    only(a.target, ["entity_id"]) &&
    typeof a.target.entity_id === "string"
  );
}
export function guideValid(c: Config, home: Home): boolean {
  if (!canGuide(c)) return false;
  const r = c.triggers[0],
    a = c.actions[0];
  return (
    (r.trigger !== "time" ||
      /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(r.at)) &&
    (r.trigger !== "state" ||
      home.controls.some(
        (x) => x.entity_id === r.entity_id && x.domain === "binary_sensor",
      )) &&
    home.controls.some(
      (x) =>
        x.entity_id === a.target.entity_id &&
        a.action.startsWith(x.domain + ".") &&
        x.capabilities.some((p) => p.actions.includes(a.action.split(".")[1])),
    )
  );
}
export function AutomationGuide({
  config: c,
  home,
  lang,
  patch,
  onAdvanced,
  onReady,
}: {
  config: Config;
  home: Home;
  lang: string;
  patch: (c: Config) => void;
  onAdvanced: () => void;
  onReady: (v: boolean) => void;
}) {
  const t = (nb: string, en: string) => words(lang, nb, en);
  const [step, setStep] = useState(0);
  const title = useRef<HTMLHeadingElement>(null);
  const r = c.triggers[0],
    a = c.actions[0];
  const target = home.controls.find(
    (x) => x.entity_id === a?.target?.entity_id,
  );
  const sensor = home.controls.find((x) => x.entity_id === r?.entity_id);
  const targets = home.controls.filter(
    (x) =>
      ["light", "switch"].includes(x.domain) &&
      x.capabilities.some(
        (p) => p.actions.includes("turn_on") && p.actions.includes("turn_off"),
      ),
  );
  const sensors = home.controls.filter((x) => x.domain === "binary_sensor");
  const stateText = (on: boolean) =>
    ["door", "window", "opening"].includes(
      String(sensor?.attributes.device_class),
    )
      ? on
        ? t("åpnes", "opens")
        : t("lukkes", "closes")
      : ["motion", "occupancy", "presence"].includes(
            String(sensor?.attributes.device_class),
          )
        ? on
          ? t("registrerer aktivitet", "detects activity")
          : t("ikke lenger registrerer aktivitet", "stops detecting activity")
        : on
          ? t("blir aktiv", "becomes active")
          : t("blir inaktiv", "becomes inactive");
  const when =
    r?.trigger === "time"
      ? t("klokken er ", "the time is ") + r.at?.slice(0, 5)
      : r?.trigger === "sun"
        ? r.event === "sunset"
          ? t("solen går ned", "the sun sets")
          : t("solen står opp", "the sun rises")
        : sensor
          ? `${sensor.name} ${stateText(r.to === "on")}`
          : t("en sensor endrer seg", "a sensor changes");
  const then = target
    ? `${a.action.endsWith("turn_off") ? t("slå av", "turn off") : t("slå på", "turn on")} ${target.name}`
    : t("velg hva som skal skje", "choose what happens");
  const valid = guideValid(c, home);
  useEffect(() => {
    onReady(step === 2 && valid);
  }, [step, valid, onReady]);
  function go(n: number) {
    setStep(n);
    requestAnimationFrame(() => title.current?.focus());
  }
  function trigger(kind: string) {
    patch({
      triggers: [
        kind === "time"
          ? { trigger: "time", at: "20:00:00" }
          : kind === "sun"
            ? { trigger: "sun", event: "sunset" }
            : { trigger: "state", entity_id: "", from: "off", to: "on" },
      ],
    });
  }
  const whenValid =
    r?.trigger === "sun" ||
    (r?.trigger === "time" &&
      /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(r.at)) ||
    (r?.trigger === "state" && !!sensor);
  return (
    <div className="routine-guide">
      <ol className="routine-steps" aria-label={t("Fremdrift", "Progress")}>
        {[t("Når", "When"), t("Gjør", "Then"), t("Se over", "Review")].map(
          (s, i) => (
            <li key={s} aria-current={step === i ? "step" : undefined}>
              <span>{step > i ? <Check size={16} /> : i + 1}</span>
              {s}
            </li>
          ),
        )}
      </ol>
      <div className="routine-layout">
        <div className="routine-main">
          <h2 ref={title} tabIndex={-1}>
            {
              [
                t("Når skal det skje?", "When should it happen?"),
                t("Hva skal hjemmet gjøre?", "What should your home do?"),
                t("Rutinen din.", "Your routine."),
              ][step]
            }
          </h2>
          <p className="routine-hint">
            {
              [
                t(
                  "Velg det som setter rutinen i gang.",
                  "Choose what starts your routine.",
                ),
                t(
                  "Velg et lys eller en stikkontakt.",
                  "Choose a light or a socket.",
                ),
                t(
                  "Se over og gi rutinen et navn du kjenner igjen.",
                  "Review and give your routine a familiar name.",
                ),
              ][step]
            }
          </p>
          {step === 0 && (
            <>
              <div className="routine-choices">
                {[
                  [
                    "time",
                    Clock,
                    t("På et tidspunkt", "At a time"),
                    t(
                      "For eksempel klokken 20 hver dag",
                      "For example, every day at 8 pm",
                    ),
                  ],
                  [
                    "sun",
                    Sunset,
                    t("Når solen går ned eller opp", "At sunset or sunrise"),
                    t(
                      "Følger årstidene automatisk",
                      "Automatically follows the seasons",
                    ),
                  ],
                  [
                    "state",
                    DoorOpen,
                    t("Når noe skjer hjemme", "When something happens at home"),
                    t(
                      "En dør åpnes eller en sensor reagerer",
                      "A door opens or a sensor reacts",
                    ),
                  ],
                ].map(([kind, Icon, label, hint]: any) => (
                  <button
                    type="button"
                    key={kind}
                    aria-pressed={r?.trigger === kind}
                    onClick={() => trigger(kind)}
                  >
                    <Icon size={25} />
                    <span>
                      <strong>{label}</strong>
                      <small>{hint}</small>
                    </span>
                    {r?.trigger === kind && <Check size={20} />}
                  </button>
                ))}
              </div>
              {r?.trigger === "time" && (
                <label className="routine-field">
                  {t("Klokkeslett", "Time")}
                  <input
                    aria-label={t("Klokkeslett", "Time")}
                    type="time"
                    required
                    value={r.at.slice(0, 5)}
                    onChange={(e) =>
                      patch({ triggers: [{ ...r, at: e.target.value }] })
                    }
                  />
                  <small>
                    {t(
                      "Hver dag, i hjemmets tidssone.",
                      "Every day, in your home’s time zone.",
                    )}
                  </small>
                </label>
              )}
              {r?.trigger === "sun" && (
                <label className="routine-field">
                  {t("Tidspunkt", "Event")}
                  <select
                    value={r.event}
                    onChange={(e) =>
                      patch({ triggers: [{ ...r, event: e.target.value }] })
                    }
                  >
                    <option value="sunset">{t("Solnedgang", "Sunset")}</option>
                    <option value="sunrise">
                      {t("Soloppgang", "Sunrise")}
                    </option>
                  </select>
                  <small>
                    {t(
                      "Bruker hjemmets plassering i SMARTi.",
                      "Uses your home’s location in SMARTi.",
                    )}
                  </small>
                </label>
              )}
              {r?.trigger === "state" && (
                <div className="routine-field">
                  <EntityPicker
                    value={r.entity_id}
                    onChange={(v) =>
                      patch({ triggers: [{ ...r, entity_id: v }] })
                    }
                    choices={sensors}
                    home={home}
                    lang={lang}
                    label={t("Velg sensor", "Choose sensor")}
                  />
                  {!sensors.length && (
                    <p>
                      {t(
                        "Ingen sensorer er tilgjengelige i oversikten ennå. Velg et tidspunkt, eller bruk flere muligheter nedenfor.",
                        "No sensors are listed yet. Choose a time or use more options below.",
                      )}
                    </p>
                  )}
                  {sensor && (
                    <label>
                      {t("Når den", "When it")}
                      <select
                        value={r.to}
                        onChange={(e) =>
                          patch({
                            triggers: [
                              {
                                ...r,
                                to: e.target.value,
                                from: e.target.value === "on" ? "off" : "on",
                              },
                            ],
                          })
                        }
                      >
                        <option value="on">{stateText(true)}</option>
                        <option value="off">{stateText(false)}</option>
                      </select>
                    </label>
                  )}
                </div>
              )}
            </>
          )}
          {step === 1 && (
            <>
              <EntityPicker
                value={target?.entity_id || ""}
                onChange={(v) => {
                  const device = targets.find((x) => x.entity_id === v);
                  if (device)
                    patch({
                      actions: [
                        {
                          action: device.domain + ".turn_on",
                          target: { entity_id: v },
                        },
                      ],
                    });
                }}
                choices={targets}
                home={home}
                lang={lang}
                label={t(
                  "Velg lys eller stikkontakt",
                  "Choose light or socket",
                )}
              />
              {!targets.length && (
                <p>
                  {t(
                    "Ingen lys eller stikkontakter er tilgjengelige i oversikten. Flere handlinger finnes under «Flere muligheter».",
                    "No lights or sockets are listed. More actions are available under “More options”.",
                  )}
                </p>
              )}
              {target && (
                <fieldset className="routine-toggle">
                  <legend>{t("Hva skal skje?", "What should happen?")}</legend>
                  {["turn_on", "turn_off"].map((v) => (
                    <button
                      type="button"
                      key={v}
                      aria-pressed={a.action.endsWith(v)}
                      onClick={() =>
                        patch({
                          actions: [{ ...a, action: target.domain + "." + v }],
                        })
                      }
                    >
                      {v === "turn_on"
                        ? t("Slå på", "Turn on")
                        : t("Slå av", "Turn off")}
                    </button>
                  ))}
                </fieldset>
              )}
            </>
          )}
          {step === 2 && (
            <>
              <div className="routine-review">
                <Check size={24} />
                <p>
                  {t("Når ", "When ")}
                  <strong>{when}</strong>, {then}.
                </p>
              </div>
              <label className="routine-field">
                {t("Navn", "Name")}
                <input
                  aria-label={t("Navn", "Name")}
                  required
                  maxLength={200}
                  value={c.alias}
                  placeholder={t(
                    "For eksempel: Lys til kvelden",
                    "For example: Evening lights",
                  )}
                  onChange={(e) => patch({ alias: e.target.value })}
                />
              </label>
              <p>
                {t(
                  "Når du lagrer, kan rutinen kjøre neste gang dette skjer. Den kjøres ikke som en test nå.",
                  "Once saved, the routine can run the next time this happens. It will not run as a test now.",
                )}
              </p>
              {!valid && (
                <p role="alert">
                  {t(
                    "Enheten eller valgene er ikke tilgjengelige. Gå tilbake og kontroller dem.",
                    "The device or choices are unavailable. Go back and check them.",
                  )}
                </p>
              )}
            </>
          )}
          <div className="routine-navigation">
            {step > 0 && (
              <button type="button" onClick={() => go(step - 1)}>
                {t("Tilbake", "Back")}
              </button>
            )}
            {step < 2 && (
              <button
                type="button"
                className="primary compact"
                disabled={step === 0 ? !whenValid : !valid}
                onClick={() => {
                  if (step === 1 && !c.alias)
                    patch({
                      alias: `${when.charAt(0).toUpperCase() + when.slice(1)} → ${then}`,
                    });
                  go(step + 1);
                }}
              >
                {step === 0
                  ? t("Velg handling", "Choose action")
                  : t("Se over rutinen", "Review routine")}
                <ArrowRight size={18} />
              </button>
            )}
          </div>
        </div>
        <aside className="routine-preview">
          <span className="eyebrow">
            {t("Slik vil det fungere", "How it will work")}
          </span>
          <span className="routine-dot">{t("NÅR", "WHEN")}</span>
          <p>{r ? when : t("Velg en hendelse", "Choose an event")}</p>
          <span className="routine-dot">{t("GJØR", "THEN")}</span>
          <p>{then}</p>
          <small>
            {t(
              "Du bestemmer. Hjemmet husker.",
              "You decide. Your home remembers.",
            )}
          </small>
        </aside>
      </div>
      <button className="text-button" type="button" onClick={onAdvanced}>
        <SlidersHorizontal size={16} />
        {t("Flere muligheter", "More options")}
      </button>
      <small className="routine-hint">
        {t(
          "Flere enheter, betingelser og avanserte handlinger.",
          "More devices, conditions and advanced actions.",
        )}
      </small>
    </div>
  );
}
